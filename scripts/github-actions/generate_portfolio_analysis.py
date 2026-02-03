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

# OpenAI クライアント初期化
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# データベース接続
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("Error: DATABASE_URL environment variable not set")
    sys.exit(1)


def get_portfolio_stocks():
    """保有銘柄（PortfolioStock）を取得"""
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    try:
        cur.execute("""
            SELECT
                ps.id,
                ps."userId",
                ps."stockId",
                ps.quantity,
                ps."averagePurchasePrice",
                ps."purchaseDate",
                s."tickerCode",
                s.name,
                s.sector,
                s."currentPrice"
            FROM "PortfolioStock" ps
            JOIN "Stock" s ON ps."stockId" = s.id
            ORDER BY ps."userId", s.name
        """)

        stocks = cur.fetchall()
        print(f"Found {len(stocks)} stocks in portfolio")
        return stocks
    finally:
        cur.close()
        conn.close()


def get_recent_prices(ticker_code):
    """直近30日の株価データを取得"""
    conn = psycopg2.connect(DATABASE_URL)
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
        conn.close()


def calculate_profit_loss(average_price, current_price, quantity):
    """損益を計算"""
    if not current_price or not average_price:
        return None, None

    total_cost = float(average_price) * quantity
    current_value = float(current_price) * quantity
    profit = current_value - total_cost
    profit_percent = (profit / total_cost) * 100 if total_cost > 0 else 0

    return profit, profit_percent


def generate_portfolio_analysis(stock, recent_prices):
    """OpenAI APIを使ってポートフォリオ分析を生成"""

    average_price = float(stock['averagePurchasePrice'])
    current_price = float(stock['currentPrice']) if stock['currentPrice'] else None
    quantity = stock['quantity']

    profit, profit_percent = calculate_profit_loss(average_price, current_price, quantity)

    # プロンプト構築
    prompt = f"""あなたは投資初心者向けのAIコーチです。
以下の保有銘柄について、売買判断をしてください。

【銘柄情報】
- 名前: {stock['name']}
- ティッカーコード: {stock['tickerCode']}
- セクター: {stock['sector'] or '不明'}
- 保有数量: {quantity}株
- 平均取得単価: {average_price}円
- 現在価格: {current_price or '不明'}円
- 損益: {f'{profit:,.0f}円 ({profit_percent:+.2f}%)' if profit is not None else '不明'}

【株価データ】
直近30日の終値: {len(recent_prices)}件のデータあり

【回答形式】
以下のJSON形式で回答してください。JSON以外のテキストは含めないでください。

{{
  "shortTerm": "短期予測（今週）の分析結果を初心者に分かりやすく2-3文で",
  "mediumTerm": "中期予測（今月）の分析結果を初心者に分かりやすく2-3文で",
  "longTerm": "長期予測（今後3ヶ月）の分析結果を初心者に分かりやすく2-3文で"
}}

【判断の指針】
- shortTerm: 「売り時」「保持」「買い増し時」のいずれかの判断を含める
- mediumTerm: 今月の見通しと推奨行動を含める
- longTerm: 今後3ヶ月の成長性と投資継続の判断を含める
- 専門用語は使わない（ROE、PER、株価収益率などは使用禁止）
- 「成長性」「安定性」「割安」「割高」のような平易な言葉を使う
- 中学生でも理解できる表現にする
- 損益状況を考慮した実践的なアドバイスを含める
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


def save_portfolio_analysis(portfolio_stock_id, analysis_data):
    """ポートフォリオ分析をデータベースに保存（UPDATE）"""
    conn = psycopg2.connect(DATABASE_URL)
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
        conn.close()


def main():
    """メイン処理"""
    print("=== Starting Portfolio Analysis Generation ===")
    print(f"Time: {datetime.now(timezone.utc).isoformat()}")

    # OpenAI APIキーの確認
    if not os.getenv("OPENAI_API_KEY"):
        print("Error: OPENAI_API_KEY environment variable not set")
        sys.exit(1)

    # ポートフォリオ取得
    stocks = get_portfolio_stocks()

    if not stocks:
        print("No stocks in portfolio. Exiting.")
        sys.exit(0)

    success_count = 0
    error_count = 0

    for stock in stocks:
        print(f"\n--- Processing: {stock['name']} ({stock['tickerCode']}) ---")

        # 直近価格取得
        recent_prices = get_recent_prices(stock['tickerCode'])

        # ポートフォリオ分析生成
        analysis = generate_portfolio_analysis(stock, recent_prices)

        if not analysis:
            print(f"❌ Failed to generate analysis for {stock['name']}")
            error_count += 1
            continue

        print(f"Generated analysis:")
        print(f"Short-term: {analysis['shortTerm'][:50]}...")
        print(f"Medium-term: {analysis['mediumTerm'][:50]}...")
        print(f"Long-term: {analysis['longTerm'][:50]}...")

        # データベース保存
        if save_portfolio_analysis(stock['id'], analysis):
            success_count += 1
        else:
            error_count += 1

    print(f"\n=== Summary ===")
    print(f"Total stocks processed: {len(stocks)}")
    print(f"Success: {success_count}")
    print(f"Errors: {error_count}")

    if error_count > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
