#!/usr/bin/env python3
"""
購入判断分析を生成するスクリプト

ウォッチリスト（気になる銘柄）に対して、毎日AI分析を行い購入判断を生成します。
- 買い（buy）/ 待ち（hold）/ 見送り（pass）の3段階判断
- 具体的な購入提案（推奨数量、目安価格、必要金額）
- 平易な言葉での理由説明
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


def get_watchlist_stocks():
    """ウォッチリスト（気になる銘柄）を取得"""
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    try:
        # WatchlistStockから銘柄を取得（重複除去）
        cur.execute("""
            SELECT DISTINCT
                s.id,
                s."tickerCode",
                s.name,
                s.sector,
                s."currentPrice"
            FROM "WatchlistStock" ws
            JOIN "Stock" s ON ws."stockId" = s.id
            ORDER BY s.name
        """)

        stocks = cur.fetchall()
        print(f"Found {len(stocks)} stocks in watchlist")
        return stocks
    finally:
        cur.close()
        conn.close()


def get_stock_prediction(stock_id):
    """既存の株価予測データを取得"""
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    try:
        cur.execute("""
            SELECT
                "shortTerm",
                "mediumTerm",
                "longTerm"
            FROM "StockPrediction"
            WHERE "stockId" = %s
            ORDER BY date DESC
            LIMIT 1
        """, (stock_id,))

        result = cur.fetchone()
        return result if result else {}
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


def generate_recommendation(stock, prediction, recent_prices):
    """OpenAI APIを使って購入判断を生成"""

    # プロンプト構築
    prompt = f"""あなたは投資初心者向けのAIコーチです。
以下の銘柄について、購入判断をしてください。

【銘柄情報】
- 名前: {stock['name']}
- ティッカーコード: {stock['tickerCode']}
- セクター: {stock['sector'] or '不明'}
- 現在価格: {stock['currentPrice'] or '不明'}円

【予測情報】
- 短期予測: {prediction.get('shortTerm', '不明')}
- 中期予測: {prediction.get('mediumTerm', '不明')}
- 長期予測: {prediction.get('longTerm', '不明')}

【株価データ】
直近30日の終値: {len(recent_prices)}件のデータあり

【回答形式】
以下のJSON形式で回答してください。JSON以外のテキストは含めないでください。

{{
  "recommendation": "buy" | "hold" | "pass",
  "confidence": 0.0から1.0の数値（小数点2桁）,
  "reason": "初心者に分かりやすい言葉で1-2文の理由",
  "recommendedQuantity": 100株単位の整数（buyの場合のみ、それ以外はnull）,
  "recommendedPrice": 目安価格の整数（buyの場合のみ、それ以外はnull）,
  "estimatedAmount": 必要金額の整数（buyの場合のみ、それ以外はnull）,
  "caution": "注意点を1-2文"
}}

【制約】
- 専門用語は使わない（ROE、PER、株価収益率などは使用禁止）
- 「成長性」「安定性」「割安」のような平易な言葉を使う
- 理由と注意点は、中学生でも理解できる表現にする
- recommendationが"buy"の場合のみ、recommendedQuantity、recommendedPrice、estimatedAmountを設定
- recommendationが"hold"または"pass"の場合、これらはnullにする
"""

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a helpful investment coach for beginners. Always respond in JSON format."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            max_tokens=500,
        )

        content = response.choices[0].message.content.strip()

        # JSONパース
        result = json.loads(content)

        # バリデーション
        required_fields = ["recommendation", "confidence", "reason", "caution"]
        for field in required_fields:
            if field not in result:
                raise ValueError(f"Missing required field: {field}")

        if result["recommendation"] not in ["buy", "hold", "pass"]:
            raise ValueError(f"Invalid recommendation: {result['recommendation']}")

        if not (0 <= result["confidence"] <= 1):
            raise ValueError(f"Invalid confidence: {result['confidence']}")

        return result
    except json.JSONDecodeError as e:
        print(f"Error: Failed to parse JSON response: {e}")
        print(f"Content: {content}")
        return None
    except Exception as e:
        print(f"Error generating recommendation: {e}")
        return None


def save_recommendation(stock_id, recommendation_data):
    """購入判断をデータベースに保存（upsert）"""
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    try:
        today = datetime.now(timezone.utc).date()

        # upsert
        cur.execute("""
            INSERT INTO "PurchaseRecommendation" (
                id,
                "stockId",
                date,
                recommendation,
                confidence,
                "recommendedQuantity",
                "recommendedPrice",
                "estimatedAmount",
                reason,
                caution,
                "createdAt",
                "updatedAt"
            ) VALUES (
                gen_random_uuid(),
                %s,
                %s,
                %s,
                %s,
                %s,
                %s,
                %s,
                %s,
                %s,
                NOW(),
                NOW()
            )
            ON CONFLICT ("stockId", date) DO UPDATE SET
                recommendation = EXCLUDED.recommendation,
                confidence = EXCLUDED.confidence,
                "recommendedQuantity" = EXCLUDED."recommendedQuantity",
                "recommendedPrice" = EXCLUDED."recommendedPrice",
                "estimatedAmount" = EXCLUDED."estimatedAmount",
                reason = EXCLUDED.reason,
                caution = EXCLUDED.caution,
                "updatedAt" = NOW()
        """, (
            stock_id,
            today,
            recommendation_data["recommendation"],
            recommendation_data["confidence"],
            recommendation_data.get("recommendedQuantity"),
            recommendation_data.get("recommendedPrice"),
            recommendation_data.get("estimatedAmount"),
            recommendation_data["reason"],
            recommendation_data["caution"],
        ))

        conn.commit()
        print(f"✅ Saved recommendation for stock {stock_id}")
        return True
    except Exception as e:
        conn.rollback()
        print(f"Error saving recommendation: {e}")
        return False
    finally:
        cur.close()
        conn.close()


def main():
    """メイン処理"""
    print("=== Starting Purchase Recommendation Generation ===")
    print(f"Time: {datetime.now(timezone.utc).isoformat()}")

    # OpenAI APIキーの確認
    if not os.getenv("OPENAI_API_KEY"):
        print("Error: OPENAI_API_KEY environment variable not set")
        sys.exit(1)

    # ウォッチリスト取得
    stocks = get_watchlist_stocks()

    if not stocks:
        print("No stocks in watchlist. Exiting.")
        sys.exit(0)

    success_count = 0
    error_count = 0

    for stock in stocks:
        print(f"\n--- Processing: {stock['name']} ({stock['tickerCode']}) ---")

        # 予測データ取得
        prediction = get_stock_prediction(stock['id'])

        # 直近価格取得
        recent_prices = get_recent_prices(stock['tickerCode'])

        # 購入判断生成
        recommendation = generate_recommendation(stock, prediction, recent_prices)

        if not recommendation:
            print(f"❌ Failed to generate recommendation for {stock['name']}")
            error_count += 1
            continue

        print(f"Generated recommendation: {recommendation['recommendation']}")
        print(f"Confidence: {recommendation['confidence']}")
        print(f"Reason: {recommendation['reason']}")

        # データベース保存
        if save_recommendation(stock['id'], recommendation):
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
