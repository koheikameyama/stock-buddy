#!/usr/bin/env python3
"""
Stock Prediction Generator
銘柄の価格予測を生成するスクリプト（短期・中期・長期）
"""

import os
import sys
import json
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Dict, Any, List, Optional, Tuple
import psycopg2
import psycopg2.extras
from openai import OpenAI


def get_db_connection():
    """データベース接続を取得"""
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("Error: DATABASE_URL environment variable is not set")
        sys.exit(1)

    return psycopg2.connect(database_url)


def calculate_baseline_prediction(
    cur,
    stock_id: str,
    current_price: Decimal
) -> Optional[Dict[str, Any]]:
    """
    ルールベースのベースライン予測を計算

    Args:
        cur: データベースカーソル
        stock_id: 銘柄ID
        current_price: 現在株価

    Returns:
        ベースライン予測データ
    """
    try:
        # 過去の株価データを取得（3ヶ月分）
        cur.execute("""
            SELECT date, close, volume
            FROM "StockPrice"
            WHERE "stockId" = %s
              AND date >= CURRENT_DATE - INTERVAL '3 months'
            ORDER BY date DESC
        """, (stock_id,))

        prices = cur.fetchall()
        if not prices or len(prices) < 5:
            return None

        # 価格変動率を計算
        week_ago_price = next((p[1] for p in prices if len(prices) >= 5), prices[-1][1])
        month_ago_price = next((p[1] for p in prices if len(prices) >= 20), prices[-1][1])
        three_months_ago_price = prices[-1][1] if len(prices) >= 60 else prices[-1][1]

        week_change_pct = ((current_price - week_ago_price) / week_ago_price * 100) if week_ago_price else 0
        month_change_pct = ((current_price - month_ago_price) / month_ago_price * 100) if month_ago_price else 0
        three_month_change_pct = ((current_price - three_months_ago_price) / three_months_ago_price * 100) if three_months_ago_price else 0

        # ボラティリティを計算（標準偏差）
        price_values = [float(p[1]) for p in prices[:30]]  # 直近30日
        if len(price_values) >= 2:
            mean_price = sum(price_values) / len(price_values)
            variance = sum((p - mean_price) ** 2 for p in price_values) / len(price_values)
            volatility = variance ** 0.5
        else:
            volatility = 0

        # 出来高トレンド
        recent_volumes = [float(p[2]) for p in prices[:5]]
        avg_volume = sum(recent_volumes) / len(recent_volumes) if recent_volumes else 0

        return {
            "current_price": float(current_price),
            "week_change_pct": float(week_change_pct),
            "month_change_pct": float(month_change_pct),
            "three_month_change_pct": float(three_month_change_pct),
            "volatility": volatility,
            "avg_volume": avg_volume,
            "price_range_52w_high": float(prices[0][1]) if prices else 0,
            "price_range_52w_low": float(min(p[1] for p in prices)) if prices else 0,
        }

    except Exception as e:
        print(f"Error calculating baseline for stock {stock_id}: {e}")
        return None


def predict_with_ai(
    client: OpenAI,
    stock_info: Dict[str, Any],
    baseline: Dict[str, Any]
) -> Optional[Dict[str, Any]]:
    """
    AIを使って株価予測を生成

    Args:
        client: OpenAI クライアント
        stock_info: 銘柄情報
        baseline: ベースライン予測データ

    Returns:
        AI予測結果
    """
    try:
        prompt = f"""
あなたは日本株の分析アシスタントです。以下の銘柄について、短期・中期・長期の価格予測を行ってください。

# 銘柄情報
- 銘柄名: {stock_info['name']}
- ティッカー: {stock_info['ticker_code']}
- セクター: {stock_info['sector']}
- 現在株価: {baseline['current_price']:.2f}円

# 価格トレンド
- 1週間変動: {baseline['week_change_pct']:+.2f}%
- 1ヶ月変動: {baseline['month_change_pct']:+.2f}%
- 3ヶ月変動: {baseline['three_month_change_pct']:+.2f}%
- ボラティリティ: {baseline['volatility']:.2f}

# 財務指標
- PBR: {stock_info.get('pbr', 'N/A')}
- PER: {stock_info.get('per', 'N/A')}
- ROE: {stock_info.get('roe', 'N/A')}
- 配当利回り: {stock_info.get('dividend_yield', 'N/A')}%

以下の形式のJSONで回答してください（コードブロックなし、JSONのみ）:

{{
  "shortTermTrend": "up/neutral/down",
  "shortTermPriceLow": <数値>,
  "shortTermPriceHigh": <数値>,
  "midTermTrend": "up/neutral/down",
  "midTermPriceLow": <数値>,
  "midTermPriceHigh": <数値>,
  "longTermTrend": "up/neutral/down",
  "longTermPriceLow": <数値>,
  "longTermPriceHigh": <数値>,
  "recommendation": "buy/hold/sell",
  "advice": "初心者向けの平易な日本語で100-200文字のアドバイス",
  "confidence": <0.0-1.0の数値>
}}

注意:
- 短期は1週間、中期は1ヶ月、長期は3ヶ月の予測
- 価格範囲は現実的な値幅で設定（ボラティリティを考慮）
- adviceは専門用語を避け、初心者にも分かりやすく
- confidenceは予測の確実性（0.0=不確実、1.0=確実）
"""

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "あなたは日本株の分析アシスタントです。初心者にも分かりやすく、専門用語を避けて説明してください。"},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            response_format={"type": "json_object"}
        )

        result = json.loads(response.choices[0].message.content)
        return result

    except Exception as e:
        print(f"Error predicting with AI for {stock_info['name']}: {e}")
        return None


def save_prediction(
    cur,
    stock_id: str,
    prediction: Dict[str, Any]
) -> bool:
    """
    予測結果をデータベースに保存

    Args:
        cur: データベースカーソル
        stock_id: 銘柄ID
        prediction: 予測データ

    Returns:
        成功したかどうか
    """
    try:
        cur.execute("""
            INSERT INTO "StockAnalysis" (
                "id",
                "stockId",
                "shortTermTrend",
                "shortTermPriceLow",
                "shortTermPriceHigh",
                "midTermTrend",
                "midTermPriceLow",
                "midTermPriceHigh",
                "longTermTrend",
                "longTermPriceLow",
                "longTermPriceHigh",
                "recommendation",
                "advice",
                "confidence",
                "analyzedAt",
                "createdAt"
            ) VALUES (
                gen_random_uuid(),
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP
            )
        """, (
            stock_id,
            prediction['shortTermTrend'],
            Decimal(str(prediction['shortTermPriceLow'])),
            Decimal(str(prediction['shortTermPriceHigh'])),
            prediction['midTermTrend'],
            Decimal(str(prediction['midTermPriceLow'])),
            Decimal(str(prediction['midTermPriceHigh'])),
            prediction['longTermTrend'],
            Decimal(str(prediction['longTermPriceLow'])),
            Decimal(str(prediction['longTermPriceHigh'])),
            prediction['recommendation'],
            prediction['advice'],
            prediction['confidence']
        ))

        return True

    except Exception as e:
        print(f"Error saving prediction for stock {stock_id}: {e}")
        return False


def get_stocks_to_analyze(cur) -> List[Dict[str, Any]]:
    """
    分析対象の銘柄を取得

    ユーザーのポートフォリオまたはウォッチリストに含まれる銘柄のみ分析

    Args:
        cur: データベースカーソル

    Returns:
        銘柄リスト
    """
    try:
        # ポートフォリオまたはウォッチリストに含まれる銘柄
        cur.execute("""
            SELECT DISTINCT
                s.id,
                s."tickerCode",
                s.name,
                s.sector,
                s."currentPrice",
                s.pbr,
                s.per,
                s.roe,
                s."dividendYield"
            FROM "Stock" s
            WHERE s.id IN (
                SELECT DISTINCT "stockId" FROM "PortfolioStock"
                UNION
                SELECT DISTINCT "stockId" FROM "Watchlist"
            )
            AND s."currentPrice" IS NOT NULL
            ORDER BY s.name
        """)

        stocks = []
        for row in cur.fetchall():
            stocks.append({
                "id": row[0],
                "ticker_code": row[1],
                "name": row[2],
                "sector": row[3],
                "current_price": row[4],
                "pbr": row[5],
                "per": row[6],
                "roe": row[7],
                "dividend_yield": row[8]
            })

        return stocks

    except Exception as e:
        print(f"Error getting stocks to analyze: {e}")
        return []


def main():
    """メイン処理"""
    print("🔮 Starting stock prediction generation...")

    # OpenAI API キーの確認
    openai_api_key = os.environ.get("OPENAI_API_KEY")
    if not openai_api_key:
        print("Error: OPENAI_API_KEY environment variable is not set")
        sys.exit(1)

    client = OpenAI(api_key=openai_api_key)

    # データベース接続
    conn = get_db_connection()
    cur = conn.cursor()

    try:
        # 分析対象の銘柄を取得
        stocks = get_stocks_to_analyze(cur)

        if not stocks:
            print("No stocks to analyze (no stocks in portfolios or watchlists)")
            return

        print(f"Found {len(stocks)} stocks to analyze")

        success_count = 0
        error_count = 0

        for stock in stocks:
            print(f"\nAnalyzing: {stock['name']} ({stock['ticker_code']})")

            # ベースライン予測を計算
            baseline = calculate_baseline_prediction(
                cur,
                stock['id'],
                stock['current_price']
            )

            if not baseline:
                print(f"  ⚠️  Skipping {stock['name']}: insufficient price data")
                error_count += 1
                continue

            # AIで予測を生成
            prediction = predict_with_ai(client, stock, baseline)

            if not prediction:
                print(f"  ❌ Failed to generate prediction for {stock['name']}")
                error_count += 1
                continue

            # データベースに保存
            if save_prediction(cur, stock['id'], prediction):
                print(f"  ✅ Prediction saved: {prediction['recommendation']} (confidence: {prediction['confidence']:.2f})")
                success_count += 1
            else:
                print(f"  ❌ Failed to save prediction for {stock['name']}")
                error_count += 1

        # トランザクションをコミット
        conn.commit()

        # 結果サマリー
        print(f"\n{'='*60}")
        print(f"✅ Stock prediction generation completed")
        print(f"{'='*60}")
        print(f"  Analyzed: {len(stocks)} stocks")
        print(f"  Success: {success_count}")
        print(f"  Errors: {error_count}")
        print(f"{'='*60}")

        if error_count > 0 and success_count == 0:
            sys.exit(1)

    except Exception as e:
        conn.rollback()
        print(f"\n❌ Error during prediction generation: {e}")
        sys.exit(1)

    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
