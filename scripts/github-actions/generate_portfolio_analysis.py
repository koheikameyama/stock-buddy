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
from datetime import datetime, timezone
from decimal import Decimal

import psycopg2
import yfinance as yf
from openai import OpenAI


# 環境変数
TIME_CONTEXT = os.environ.get("TIME_CONTEXT", "morning")

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


def get_database_url() -> str:
    """データベースURLを取得"""
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("Error: DATABASE_URL environment variable not set")
        sys.exit(1)
    return url


def fetch_portfolio_stocks(conn) -> list[dict]:
    """ポートフォリオの銘柄を取得"""
    with conn.cursor() as cur:
        cur.execute('''
            SELECT
                ps.id,
                ps."userId",
                ps."stockId",
                ps."suggestedSellPrice",
                s."tickerCode",
                s.name,
                s.sector,
                s."marketCap",
                s."dividendYield",
                s.pbr,
                s.per,
                s.roe,
                s."fiftyTwoWeekHigh",
                s."fiftyTwoWeekLow"
            FROM "PortfolioStock" ps
            JOIN "Stock" s ON ps."stockId" = s.id
        ''')
        portfolio_rows = cur.fetchall()

    portfolio_stocks = []
    for row in portfolio_rows:
        ps_id = row[0]

        # 取引履歴を取得
        cur.execute('''
            SELECT type, quantity, "totalAmount", "transactionDate"
            FROM "Transaction"
            WHERE "portfolioStockId" = %s
        ''', (ps_id,))
        transactions = cur.fetchall()

        portfolio_stocks.append({
            "id": ps_id,
            "userId": row[1],
            "stockId": row[2],
            "suggestedSellPrice": float(row[3]) if row[3] else None,
            "tickerCode": row[4],
            "name": row[5],
            "sector": row[6],
            "marketCap": float(row[7]) if row[7] else None,
            "dividendYield": float(row[8]) if row[8] else None,
            "pbr": float(row[9]) if row[9] else None,
            "per": float(row[10]) if row[10] else None,
            "roe": float(row[11]) if row[11] else None,
            "fiftyTwoWeekHigh": float(row[12]) if row[12] else None,
            "fiftyTwoWeekLow": float(row[13]) if row[13] else None,
            "transactions": [
                {"type": t[0], "quantity": t[1], "totalAmount": float(t[2]), "transactionDate": t[3]}
                for t in transactions
            ],
        })

    return portfolio_stocks


def fetch_recent_prices(ticker_code: str) -> list[dict]:
    """yfinanceで直近の価格データを取得"""
    try:
        symbol = ticker_code if ticker_code.endswith(".T") else f"{ticker_code}.T"
        ticker = yf.Ticker(symbol)
        hist = ticker.history(period="1mo")

        if hist.empty:
            return []

        prices = []
        for date, row in hist.iterrows():
            prices.append({
                "date": date.strftime("%Y-%m-%d"),
                "close": float(row["Close"]),
                "volume": int(row["Volume"]),
            })

        return sorted(prices, key=lambda x: x["date"], reverse=True)
    except Exception as e:
        print(f"Error fetching prices for {ticker_code}: {e}")
        return []


def get_nikkei_context() -> dict | None:
    """日経平均の市場文脈を取得"""
    try:
        ticker = yf.Ticker("^N225")
        hist = ticker.history(period="1mo")

        if hist.empty or len(hist) < 2:
            return None

        latest = hist.iloc[-1]
        previous = hist.iloc[-2]

        current_price = float(latest["Close"])
        previous_close = float(previous["Close"])
        change = current_price - previous_close
        change_percent = (change / previous_close) * 100

        # 週間変動率
        weekly_change_percent = None
        if len(hist) >= 6:
            week_ago = hist.iloc[-6]
            weekly_change_percent = ((current_price - float(week_ago["Close"])) / float(week_ago["Close"])) * 100

        return {
            "currentPrice": current_price,
            "previousClose": previous_close,
            "change": change,
            "changePercent": change_percent,
            "weeklyChangePercent": weekly_change_percent,
        }
    except Exception as e:
        print(f"Error fetching Nikkei context: {e}")
        return None


def calculate_profit_loss(average_price: float, current_price: float | None, quantity: int) -> tuple[float | None, float | None]:
    """損益を計算"""
    if not current_price or not average_price:
        return None, None

    total_cost = average_price * quantity
    current_value = current_price * quantity
    profit = current_value - total_cost
    profit_percent = (profit / total_cost) * 100 if total_cost > 0 else 0

    return profit, profit_percent


def format_financial_metrics(stock: dict, current_price: float | None) -> str:
    """財務指標を初心者向けにフォーマット"""
    metrics = []

    # 時価総額
    if stock["marketCap"]:
        market_cap = stock["marketCap"]
        if market_cap >= 10000:
            metrics.append(f"- 会社の規模: 大企業（時価総額{market_cap / 10000:.1f}兆円）")
        elif market_cap >= 1000:
            metrics.append(f"- 会社の規模: 中堅企業（時価総額{market_cap:.0f}億円）")
        else:
            metrics.append(f"- 会社の規模: 小型企業（時価総額{market_cap:.0f}億円）")

    # 配当利回り
    if stock["dividendYield"]:
        div_yield = stock["dividendYield"]
        if div_yield >= 4:
            metrics.append(f"- 配当: 高配当（年{div_yield:.2f}%）")
        elif div_yield >= 2:
            metrics.append(f"- 配当: 普通（年{div_yield:.2f}%）")
        elif div_yield > 0:
            metrics.append(f"- 配当: 低め（年{div_yield:.2f}%）")
        else:
            metrics.append("- 配当: なし")

    # 株価水準（PBR）
    if stock["pbr"]:
        pbr = stock["pbr"]
        if pbr < 1:
            metrics.append("- 株価水準: 割安（資産価値より安い）")
        elif pbr < 1.5:
            metrics.append("- 株価水準: 適正")
        else:
            metrics.append("- 株価水準: やや割高")

    # 52週高値/安値
    if stock["fiftyTwoWeekHigh"] and stock["fiftyTwoWeekLow"] and current_price:
        high = stock["fiftyTwoWeekHigh"]
        low = stock["fiftyTwoWeekLow"]
        position = ((current_price - low) / (high - low)) * 100 if high != low else 50
        position = max(0, min(100, position))
        metrics.append(f"- 1年間の値動き: 高値{high:.0f}円〜安値{low:.0f}円（現在は{position:.0f}%の位置）")

    return "\n".join(metrics) if metrics else "財務データなし"


def generate_portfolio_analysis(
    client: OpenAI,
    stock: dict,
    quantity: int,
    average_price: float,
    recent_prices: list[dict],
    current_price: float | None,
    nikkei_context: dict | None,
) -> dict | None:
    """OpenAIでポートフォリオ分析を生成"""
    prompts = TIME_CONTEXT_PROMPTS.get(TIME_CONTEXT, TIME_CONTEXT_PROMPTS["morning"])

    profit, profit_percent = calculate_profit_loss(average_price, current_price, quantity)
    financial_metrics = format_financial_metrics(stock, current_price)

    # 売却目標情報
    target_info = ""
    if stock["suggestedSellPrice"]:
        sell_price = stock["suggestedSellPrice"]
        progress = 0
        if current_price and average_price and sell_price > average_price:
            progress = ((current_price - average_price) / (sell_price - average_price)) * 100
            progress = max(0, min(100, progress))
        target_info = f"""

【AI提案の売却目標】
- 提案売却価格: {sell_price:,.0f}円（達成度: {progress:.0f}%）"""

    # 市場文脈
    market_context = ""
    if nikkei_context:
        market_context = f"""

【市場全体の状況】
- 日経平均: {nikkei_context['currentPrice']:,.0f}円（前日比 {'+' if nikkei_context['change'] >= 0 else ''}{nikkei_context['change']:,.0f}円、{'+' if nikkei_context['changePercent'] >= 0 else ''}{nikkei_context['changePercent']:.2f}%）"""
        if nikkei_context["weeklyChangePercent"] is not None:
            market_context += f"\n- 直近1週間: {'+' if nikkei_context['weeklyChangePercent'] >= 0 else ''}{nikkei_context['weeklyChangePercent']:.2f}%"

    profit_label = f"{profit:,.0f}円 ({'+' if profit_percent >= 0 else ''}{profit_percent:.2f}%)" if profit is not None else "不明"

    prompt = f"""あなたは投資初心者向けのAIコーチです。
{prompts['intro']}
以下の保有銘柄について、売買判断と感情コーチングを提供してください。

【銘柄情報】
- 名前: {stock['name']}
- ティッカーコード: {stock['tickerCode']}
- セクター: {stock['sector'] or '不明'}
- 保有数量: {quantity}株
- 購入時単価: {average_price:,.0f}円
- 現在価格: {f'{current_price:,.0f}円' if current_price else '不明'}
- 損益: {profit_label}{target_info}

【財務指標（初心者向け解説）】
{financial_metrics}

【株価データ】
直近30日の終値: {len(recent_prices)}件のデータあり
{market_context}

【回答形式】
以下のJSON形式で回答してください。JSON以外のテキストは含めないでください。

{{
  "shortTerm": "{prompts['shortTerm']}",
  "mediumTerm": "{prompts['mediumTerm']}",
  "longTerm": "{prompts['longTerm']}",
  "emotionalCoaching": "ユーザーの気持ちに寄り添うメッセージ（下落時は安心感、上昇時は冷静さを促す）",
  "simpleStatus": "現状を一言で表すステータス（好調/順調/様子見/注意/要確認のいずれか）",
  "statusType": "ステータスの種類（excellent/good/neutral/caution/warningのいずれか）",
  "suggestedSellPrice": "具体的な売却目標価格（数値のみ、円単位）",
  "sellCondition": "売却の条件や考え方"
}}

【判断の指針】
- 専門用語は使わない（ROE、PER、株価収益率などは使用禁止）
- 「成長性」「安定性」「割安」「割高」のような平易な言葉を使う
- 中学生でも理解できる表現にする

【ステータスの指針】
- 好調（excellent）: 利益率 +10%以上
- 順調（good）: 利益率 0%〜+10%
- 様子見（neutral）: 利益率 -5%〜0%
- 注意（caution）: 利益率 -10%〜-5%
- 要確認（warning）: 利益率 -10%以下"""

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a helpful investment coach for beginners. Always respond in JSON format."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.7,
            max_tokens=600,
        )

        content = response.choices[0].message.content.strip()

        # マークダウンコードブロックを削除
        if content.startswith("```json"):
            content = content[7:]
        elif content.startswith("```"):
            content = content[3:]
        if content.endswith("```"):
            content = content[:-3]
        content = content.strip()

        import json
        result = json.loads(content)

        # suggestedSellPriceを数値に変換
        if result.get("suggestedSellPrice"):
            try:
                result["suggestedSellPrice"] = float(str(result["suggestedSellPrice"]).replace(",", ""))
            except:
                result["suggestedSellPrice"] = None

        return result

    except Exception as e:
        print(f"Error generating portfolio analysis: {e}")
        return None


def save_analysis(conn, portfolio_stock_id: str, analysis: dict):
    """分析結果をDBに保存"""
    with conn.cursor() as cur:
        cur.execute('''
            UPDATE "PortfolioStock"
            SET "lastAnalysis" = %s,
                "shortTerm" = %s,
                "mediumTerm" = %s,
                "longTerm" = %s,
                "emotionalCoaching" = %s,
                "simpleStatus" = %s,
                "statusType" = %s,
                "suggestedSellPrice" = %s,
                "sellCondition" = %s,
                "updatedAt" = %s
            WHERE id = %s
        ''', (
            datetime.now(timezone.utc),
            analysis["shortTerm"],
            analysis["mediumTerm"],
            analysis["longTerm"],
            analysis["emotionalCoaching"],
            analysis["simpleStatus"],
            analysis["statusType"],
            analysis.get("suggestedSellPrice"),
            analysis.get("sellCondition"),
            datetime.now(timezone.utc),
            portfolio_stock_id,
        ))

    conn.commit()


def main():
    print("=== Starting Portfolio Analysis Generation (Python) ===")
    print(f"Time: {datetime.now().isoformat()}")
    print(f"Time context: {TIME_CONTEXT}")

    openai_key = os.environ.get("OPENAI_API_KEY")
    if not openai_key:
        print("Error: OPENAI_API_KEY environment variable not set")
        sys.exit(1)

    client = OpenAI(api_key=openai_key)
    db_url = get_database_url()
    conn = psycopg2.connect(db_url)

    try:
        # ポートフォリオ取得
        portfolio_stocks = fetch_portfolio_stocks(conn)
        print(f"Found {len(portfolio_stocks)} stocks in portfolio")

        if not portfolio_stocks:
            print("No stocks in portfolio. Exiting.")
            return

        # 日経平均の市場文脈を取得
        print("Fetching Nikkei 225 market context...")
        nikkei_context = get_nikkei_context()
        if nikkei_context:
            print(f"Nikkei 225: {nikkei_context['currentPrice']:,.0f} ({'+' if nikkei_context['changePercent'] >= 0 else ''}{nikkei_context['changePercent']:.2f}%)")
        else:
            print("Warning: Could not fetch Nikkei 225 context")

        success_count = 0
        error_count = 0

        for ps in portfolio_stocks:
            print(f"\n--- Processing: {ps['name']} ({ps['tickerCode']}) ---")

            # Transactionから数量と平均取得単価を計算
            quantity = 0
            total_buy_cost = 0
            total_buy_quantity = 0

            for t in ps["transactions"]:
                if t["type"] == "buy":
                    quantity += t["quantity"]
                    total_buy_cost += t["totalAmount"]
                    total_buy_quantity += t["quantity"]
                else:
                    quantity -= t["quantity"]

            average_price = total_buy_cost / total_buy_quantity if total_buy_quantity > 0 else 0

            # 保有数量が0以下の場合はスキップ
            if quantity <= 0:
                print(f"Skipping: No holdings (quantity: {quantity})")
                continue

            # 直近価格取得
            recent_prices = fetch_recent_prices(ps["tickerCode"])
            current_price = recent_prices[0]["close"] if recent_prices else None

            if current_price:
                print(f"Current price: {current_price:,.0f}円")
            else:
                print("No price data available")

            # ポートフォリオ分析生成
            analysis = generate_portfolio_analysis(
                client, ps, quantity, average_price, recent_prices, current_price, nikkei_context
            )

            if not analysis:
                print(f"Failed to generate analysis for {ps['name']}")
                error_count += 1
                continue

            print(f"Generated analysis:")
            print(f"Short-term: {analysis['shortTerm'][:50]}...")
            print(f"Status: {analysis['simpleStatus']} ({analysis['statusType']})")

            # データベース保存
            save_analysis(conn, ps["id"], analysis)
            print(f"Saved portfolio analysis for stock {ps['id']}")
            success_count += 1

        print(f"\n=== Summary ===")
        print(f"Total stocks processed: {len(portfolio_stocks)}")
        print(f"Success: {success_count}")
        print(f"Errors: {error_count}")

        if error_count > 0 and success_count == 0:
            sys.exit(1)

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
