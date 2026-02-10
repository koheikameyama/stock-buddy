#!/usr/bin/env python3
"""
ポートフォリオ分析を生成するスクリプト

保有銘柄（PortfolioStock）に対して、毎日AI分析を行い売買判断を生成します。
- 短期予測（shortTerm）: 今週の売買判断
- 中期予測（mediumTerm）: 今月の売買判断
- 長期予測（longTerm）: 今後3ヶ月の売買判断
"""

import os
import sys
import json
from datetime import datetime, timezone
import psycopg2
import psycopg2.extras
from openai import OpenAI

# Add path to lib directory
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from lib.news_fetcher import get_related_news, format_news_for_prompt

# OpenAI クライアント初期化
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# 時間帯コンテキスト
TIME_CONTEXT = os.getenv("TIME_CONTEXT", "morning")

# 時間帯別のプロンプト設定
TIME_CONTEXT_PROMPTS = {
    "morning": {
        "intro": "今日の取引開始前の分析です。",
        "shortTerm": "今日の見通しとチェックポイントを初心者に分かりやすく2-3文で",
        "mediumTerm": "今週の注目ポイントと目標を初心者に分かりやすく2-3文で",
        "longTerm": "今後の成長シナリオを初心者に分かりやすく2-3文で",
    },
    "noon": {
        "intro": "前場の取引を踏まえた分析です。",
        "shortTerm": "前場の動きを踏まえた後場の注目点を初心者に分かりやすく2-3文で",
        "mediumTerm": "今日の値動きを踏まえた今週の見通しを初心者に分かりやすく2-3文で",
        "longTerm": "今後の成長シナリオを初心者に分かりやすく2-3文で",
    },
    "close": {
        "intro": "本日の取引終了後の振り返りです。",
        "shortTerm": "本日のまとめと明日への展望を初心者に分かりやすく2-3文で",
        "mediumTerm": "今週の残りの見通しを初心者に分かりやすく2-3文で",
        "longTerm": "今後の成長シナリオと来週以降の展望を初心者に分かりやすく2-3文で",
    },
}

# データベース接続
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("Error: DATABASE_URL environment variable not set")
    sys.exit(1)


def get_portfolio_stocks(conn):
    """保有銘柄（PortfolioStock）を取得。Transactionテーブルから数量と平均取得単価を集計"""
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    try:
        cur.execute("""
            SELECT
                ps.id,
                ps."userId",
                ps."stockId",
                ps."targetPrice",
                ps."stopLossPrice",
                s."tickerCode",
                s.name,
                s.sector,
                s."currentPrice",
                s."marketCap",
                s."dividendYield",
                s.pbr,
                s.per,
                s.roe,
                s."fiftyTwoWeekHigh",
                s."fiftyTwoWeekLow",
                s."beginnerScore",
                s."growthScore",
                s."dividendScore",
                s."stabilityScore",
                COALESCE(
                    (SELECT SUM(CASE WHEN t.type = 'buy' THEN t.quantity ELSE -t.quantity END)
                     FROM "Transaction" t
                     WHERE t."portfolioStockId" = ps.id),
                    0
                ) AS quantity,
                COALESCE(
                    (SELECT SUM(CASE WHEN t.type = 'buy' THEN t."totalAmount" ELSE 0 END) /
                            NULLIF(SUM(CASE WHEN t.type = 'buy' THEN t.quantity ELSE 0 END), 0)
                     FROM "Transaction" t
                     WHERE t."portfolioStockId" = ps.id),
                    0
                ) AS "averagePurchasePrice",
                (SELECT MIN(t."transactionDate")
                 FROM "Transaction" t
                 WHERE t."portfolioStockId" = ps.id AND t.type = 'buy'
                ) AS "purchaseDate"
            FROM "PortfolioStock" ps
            JOIN "Stock" s ON ps."stockId" = s.id
            ORDER BY ps."userId", s.name
        """)

        stocks = cur.fetchall()
        print(f"Found {len(stocks)} stocks in portfolio")
        return stocks
    finally:
        cur.close()


def get_recent_prices(conn, ticker_code):
    """直近30日の株価データを取得"""
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    try:
        cur.execute("""
            SELECT
                date,
                close,
                volume
            FROM "StockPrice"
            WHERE "stockId" = (
                SELECT id FROM "Stock" WHERE "tickerCode" = %s
            )
            ORDER BY date DESC
            LIMIT 30
        """, (ticker_code,))

        prices = cur.fetchall()
        return prices
    finally:
        cur.close()


def calculate_profit_loss(average_price, current_price, quantity):
    """損益を計算"""
    if not current_price or not average_price:
        return None, None

    total_cost = float(average_price) * quantity
    current_value = float(current_price) * quantity
    profit = current_value - total_cost
    profit_percent = (profit / total_cost) * 100 if total_cost > 0 else 0

    return profit, profit_percent


def format_financial_metrics(stock):
    """財務指標を初心者向けにフォーマット"""
    metrics = []

    # 時価総額
    if stock.get('marketCap'):
        market_cap = float(stock['marketCap'])
        if market_cap >= 10000:
            metrics.append(f"- 会社の規模: 大企業（時価総額{market_cap/10000:.1f}兆円）")
        elif market_cap >= 1000:
            metrics.append(f"- 会社の規模: 中堅企業（時価総額{market_cap:.0f}億円）")
        else:
            metrics.append(f"- 会社の規模: 小型企業（時価総額{market_cap:.0f}億円）")

    # 配当利回り
    if stock.get('dividendYield'):
        div_yield = float(stock['dividendYield'])
        if div_yield >= 4:
            metrics.append(f"- 配当: 高配当（年{div_yield:.2f}%）")
        elif div_yield >= 2:
            metrics.append(f"- 配当: 普通（年{div_yield:.2f}%）")
        elif div_yield > 0:
            metrics.append(f"- 配当: 低め（年{div_yield:.2f}%）")
        else:
            metrics.append("- 配当: なし")

    # 割安/割高判断（PBR）
    if stock.get('pbr'):
        pbr = float(stock['pbr'])
        if pbr < 1:
            metrics.append(f"- 株価水準: 割安（資産価値より安い）")
        elif pbr < 1.5:
            metrics.append(f"- 株価水準: 適正")
        else:
            metrics.append(f"- 株価水準: やや割高")

    # 52週高値/安値との比較
    if stock.get('fiftyTwoWeekHigh') and stock.get('fiftyTwoWeekLow') and stock.get('currentPrice'):
        high = float(stock['fiftyTwoWeekHigh'])
        low = float(stock['fiftyTwoWeekLow'])
        current = float(stock['currentPrice'])
        position = (current - low) / (high - low) * 100 if high != low else 50
        metrics.append(f"- 1年間の値動き: 高値{high:.0f}円〜安値{low:.0f}円（現在は{position:.0f}%の位置）")

    # スコア
    scores = []
    if stock.get('beginnerScore'):
        scores.append(f"初心者向け{stock['beginnerScore']}点")
    if stock.get('growthScore'):
        scores.append(f"成長性{stock['growthScore']}点")
    if stock.get('stabilityScore'):
        scores.append(f"安定性{stock['stabilityScore']}点")
    if stock.get('dividendScore'):
        scores.append(f"配当{stock['dividendScore']}点")
    if scores:
        metrics.append(f"- 評価スコア（100点満点）: {', '.join(scores)}")

    return "\n".join(metrics) if metrics else "財務データなし"


def generate_portfolio_analysis(stock, recent_prices, related_news=None, time_context=None):
    """OpenAI APIを使ってポートフォリオ分析を生成"""

    # 時間帯に応じたプロンプト設定を取得
    context = time_context or TIME_CONTEXT
    prompts = TIME_CONTEXT_PROMPTS.get(context, TIME_CONTEXT_PROMPTS["morning"])

    average_price = float(stock['averagePurchasePrice'])
    current_price = float(stock['currentPrice']) if stock['currentPrice'] else None
    quantity = stock['quantity']

    profit, profit_percent = calculate_profit_loss(average_price, current_price, quantity)

    # 財務指標をフォーマット
    financial_metrics = format_financial_metrics(stock)

    # 売却目標情報をフォーマット
    target_info = ""
    target_price_val = stock.get('targetPrice')
    stop_loss_price_val = stock.get('stopLossPrice')
    if target_price_val or stop_loss_price_val:
        target_parts = []
        if target_price_val:
            target_price = float(target_price_val)
            if current_price and average_price and target_price > average_price:
                progress = (current_price - average_price) / (target_price - average_price) * 100
                progress = max(0, min(100, progress))
            else:
                progress = 0
            target_parts.append(f"利確目標: {target_price:,.0f}円（達成度: {progress:.0f}%）")
        if stop_loss_price_val:
            stop_price = float(stop_loss_price_val)
            warning = " ⚠️損切ライン割れ" if current_price and current_price < stop_price else ""
            target_parts.append(f"損切ライン: {stop_price:,.0f}円{warning}")
        target_info = f"""

【ユーザーの売却目標設定】
{chr(10).join('- ' + p for p in target_parts)}
※ ユーザーが設定した目標です。この目標に対する進捗も考慮してアドバイスしてください。"""

    # ニュース情報をフォーマット
    news_context = ""
    if related_news:
        news_context = f"""

【最新のニュース情報】
{format_news_for_prompt(related_news)}
"""

    # プロンプト構築
    prompt = f"""あなたは投資初心者向けのAIコーチです。
{prompts['intro']}
以下の保有銘柄について、売買判断をしてください。

【銘柄情報】
- 名前: {stock['name']}
- ティッカーコード: {stock['tickerCode']}
- セクター: {stock['sector'] or '不明'}
- 保有数量: {quantity}株
- 購入時単価: {average_price}円
- 現在価格: {current_price or '不明'}円
- 損益: {f'{profit:,.0f}円 ({profit_percent:+.2f}%)' if profit is not None else '不明'}{target_info}

【財務指標（初心者向け解説）】
{financial_metrics}

【株価データ】
直近30日の終値: {len(recent_prices)}件のデータあり
{news_context}
【回答形式】
以下のJSON形式で回答してください。JSON以外のテキストは含めないでください。

{{
  "shortTerm": "{prompts['shortTerm']}（ニュース情報があれば参考にする）",
  "mediumTerm": "{prompts['mediumTerm']}（ニュース情報があれば参考にする）",
  "longTerm": "{prompts['longTerm']}（ニュース情報があれば参考にする）"
}}

【判断の指針】
- 財務指標（会社の規模、配当、株価水準、評価スコア）を分析に活用してください
- 提供されたニュース情報を参考にしてください
- ニュースにない情報は推測や創作をしないでください
- ユーザーの売却目標設定がある場合は、目標への進捗や損切ラインへの接近を考慮してください
- shortTerm: 「売り時」「保持」「買い増し時」のいずれかの判断を含める
- mediumTerm: 今月の見通しと推奨行動を含める
- longTerm: 今後3ヶ月の成長性と投資継続の判断を含める
- 専門用語は使わない（ROE、PER、株価収益率などは使用禁止）
- 「成長性」「安定性」「割安」「割高」のような平易な言葉を使う
- 中学生でも理解できる表現にする
- 損益状況と財務指標を考慮した実践的なアドバイスを含める
"""

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a helpful investment coach for beginners. Always respond in JSON format."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            max_tokens=600,
        )

        content = response.choices[0].message.content.strip()

        # JSONパース
        result = json.loads(content)

        # バリデーション
        required_fields = ["shortTerm", "mediumTerm", "longTerm"]
        for field in required_fields:
            if field not in result:
                raise ValueError(f"Missing required field: {field}")

        return result
    except json.JSONDecodeError as e:
        print(f"Error: Failed to parse JSON response: {e}")
        print(f"Content: {content}")
        return None
    except Exception as e:
        print(f"Error generating portfolio analysis: {e}")
        return None


def save_portfolio_analysis(conn, portfolio_stock_id, analysis_data):
    """ポートフォリオ分析をデータベースに保存（UPDATE）"""
    cur = conn.cursor()

    try:
        now = datetime.now(timezone.utc)

        cur.execute("""
            UPDATE "PortfolioStock"
            SET
                "lastAnalysis" = %s,
                "shortTerm" = %s,
                "mediumTerm" = %s,
                "longTerm" = %s,
                "updatedAt" = NOW()
            WHERE id = %s
        """, (
            now,
            analysis_data["shortTerm"],
            analysis_data["mediumTerm"],
            analysis_data["longTerm"],
            portfolio_stock_id,
        ))

        conn.commit()
        print(f"✅ Saved portfolio analysis for stock {portfolio_stock_id}")
        return True
    except Exception as e:
        conn.rollback()
        print(f"Error saving portfolio analysis: {e}")
        return False
    finally:
        cur.close()


def main():
    """メイン処理"""
    print("=== Starting Portfolio Analysis Generation ===")
    print(f"Time: {datetime.now(timezone.utc).isoformat()}")

    # OpenAI APIキーの確認
    if not os.getenv("OPENAI_API_KEY"):
        print("Error: OPENAI_API_KEY environment variable not set")
        sys.exit(1)

    # データベース接続（単一接続を使用）
    conn = psycopg2.connect(DATABASE_URL)

    try:
        # ポートフォリオ取得
        stocks = get_portfolio_stocks(conn)

        if not stocks:
            print("No stocks in portfolio. Exiting.")
            sys.exit(0)

        # 関連ニュースを一括取得
        ticker_codes = [s['tickerCode'] for s in stocks]
        sectors = list(set([s['sector'] for s in stocks if s['sector']]))

        print(f"Fetching related news for {len(ticker_codes)} stocks...")
        all_news = get_related_news(
            conn=conn,
            ticker_codes=ticker_codes,
            sectors=sectors,
            limit=20,  # ポートフォリオ分析は多めに取得
            days_ago=7,
        )
        print(f"Found {len(all_news)} related news articles")

        success_count = 0
        error_count = 0

        for stock in stocks:
            print(f"\n--- Processing: {stock['name']} ({stock['tickerCode']}) ---")

            # 保有数量が0以下の場合はスキップ（売却済み）
            if not stock['quantity'] or stock['quantity'] <= 0:
                print(f"⏭️  Skipping: No holdings (quantity: {stock['quantity']})")
                continue

            # この銘柄に関連するニュースをフィルタリング
            stock_news = [
                n for n in all_news
                if (stock['tickerCode'] in n['content'] or
                    stock['tickerCode'].replace('.T', '') in n['content'] or
                    n['sector'] == stock['sector'])
            ][:5]  # 最大5件

            print(f"Found {len(stock_news)} news for this stock")

            # 直近価格取得
            recent_prices = get_recent_prices(conn, stock['tickerCode'])

            # ポートフォリオ分析生成（ニュース付き、時間帯考慮）
            analysis = generate_portfolio_analysis(stock, recent_prices, stock_news, TIME_CONTEXT)

            if not analysis:
                print(f"❌ Failed to generate analysis for {stock['name']}")
                error_count += 1
                continue

            print(f"Generated analysis:")
            print(f"Short-term: {analysis['shortTerm'][:50]}...")
            print(f"Medium-term: {analysis['mediumTerm'][:50]}...")
            print(f"Long-term: {analysis['longTerm'][:50]}...")

            # データベース保存
            if save_portfolio_analysis(conn, stock['id'], analysis):
                success_count += 1
            else:
                error_count += 1

        print(f"\n=== Summary ===")
        print(f"Total stocks processed: {len(stocks)}")
        print(f"Success: {success_count}")
        print(f"Errors: {error_count}")

        if error_count > 0:
            sys.exit(1)

    finally:
        conn.close()


if __name__ == "__main__":
    main()
