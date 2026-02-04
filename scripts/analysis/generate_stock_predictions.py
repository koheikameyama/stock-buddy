#!/usr/bin/env python3
"""
銘柄動向予測生成スクリプト

ルールベース分析 + AI予測のハイブリッド方式で、
各銘柄の短期・中期・長期の見通しとアドバイスを生成します。
"""

import os
import sys
import json
import psycopg2
import psycopg2.extras
from openai import OpenAI
from datetime import datetime
import statistics

# Add news fetcher module
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from lib.news_fetcher import get_related_news, format_news_for_prompt

DATABASE_URL = os.getenv("DATABASE_URL")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

client = OpenAI(api_key=OPENAI_API_KEY)


def calculate_trend(current, past):
    """トレンドを計算"""
    if not past:
        return "neutral"

    change = ((current - past) / past) * 100

    if change > 2:
        return "up"
    elif change < -2:
        return "down"
    else:
        return "neutral"


def calculate_volatility(prices):
    """ボラティリティ（標準偏差）を計算"""
    if len(prices) < 2:
        return 0.0
    return statistics.stdev(prices)


def get_baseline_data(cur, stock_id):
    """ルールベースで基礎データを計算"""

    # 過去90日分の価格データを取得
    cur.execute(
        """
        SELECT close, date
        FROM "StockPrice"
        WHERE "stockId" = %s
        ORDER BY date DESC
        LIMIT 90
    """,
        (stock_id,),
    )

    price_history = cur.fetchall()

    if not price_history:
        return None

    current_price = float(price_history[0][0])
    week_ago = float(price_history[5][0]) if len(price_history) > 5 else None
    month_ago = float(price_history[20][0]) if len(price_history) > 20 else None
    three_months_ago = (
        float(price_history[60][0]) if len(price_history) > 60 else None
    )

    # トレンド計算
    weekly_trend = calculate_trend(current_price, week_ago)
    monthly_trend = calculate_trend(current_price, month_ago)
    quarterly_trend = calculate_trend(current_price, three_months_ago)

    # ボラティリティ計算（直近30日）
    prices = [float(p[0]) for p in price_history[:30]]
    volatility = calculate_volatility(prices)

    return {
        "current_price": current_price,
        "weekly_trend": weekly_trend,
        "monthly_trend": monthly_trend,
        "quarterly_trend": quarterly_trend,
        "volatility": volatility,
    }


def generate_ai_prediction(stock, baseline, scores, related_news=None):
    """AIで予測を生成"""

    trend_labels = {"up": "上昇", "neutral": "横ばい", "down": "下降"}

    # ニュース情報をフォーマット
    news_context = ""
    if related_news:
        news_context = f"""

【最新のニュース情報】
{format_news_for_prompt(related_news)}
"""

    prompt = f"""あなたは株式投資の初心者向けアドバイザーです。
以下の銘柄について、今後の動向予測とアドバイスを生成してください。

【銘柄情報】
名称: {stock['name']}
ティッカー: {stock['ticker_code']}
セクター: {stock['sector'] or '不明'}
現在価格: {baseline['current_price']:.2f}円

【過去のトレンド】
- 1週間: {trend_labels[baseline['weekly_trend']]}
- 1ヶ月: {trend_labels[baseline['monthly_trend']]}
- 3ヶ月: {trend_labels[baseline['quarterly_trend']]}

【スコア】
- 成長性: {scores['growth']}/100
- 安定性: {scores['stability']}/100
- 配当性: {scores['dividend']}/100

【ボラティリティ（価格変動幅）】
{baseline['volatility']:.2f}円
{news_context}
---

以下の形式でJSON形式で回答してください：

{{
  "shortTerm": {{
    "trend": "up" | "neutral" | "down",
    "priceLow": 数値,
    "priceHigh": 数値
  }},
  "midTerm": {{
    "trend": "up" | "neutral" | "down",
    "priceLow": 数値,
    "priceHigh": 数値
  }},
  "longTerm": {{
    "trend": "up" | "neutral" | "down",
    "priceLow": 数値,
    "priceHigh": 数値
  }},
  "recommendation": "buy" | "hold" | "sell",
  "advice": "初心者向けのアドバイス（100文字以内、優しい言葉で、ニュース情報があれば参考にする）",
  "confidence": 0.0〜1.0の信頼度
}}

注意事項:
- 提供されたニュース情報を参考にしてください
- ニュースにない情報は推測や創作をしないでください
- 価格予測は現在価格とボラティリティを考慮した現実的な範囲にする
- アドバイスは具体的で分かりやすく
- 断定的な表現は避け、「〜が期待できます」「〜の可能性があります」など柔らかい表現を使う
- 投資判断は最終的にユーザー自身が行うことを前提にする
"""

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        temperature=0.7,
    )

    prediction = json.loads(response.choices[0].message.content)
    return prediction


def save_prediction(cur, stock_id, prediction):
    """予測をデータベースに保存"""

    cur.execute(
        """
        INSERT INTO "StockAnalysis" (
            id, "stockId",
            "shortTermTrend", "shortTermPriceLow", "shortTermPriceHigh",
            "midTermTrend", "midTermPriceLow", "midTermPriceHigh",
            "longTermTrend", "longTermPriceLow", "longTermPriceHigh",
            recommendation, advice, confidence,
            "analyzedAt", "createdAt"
        )
        VALUES (
            gen_random_uuid(), %s,
            %s, %s, %s,
            %s, %s, %s,
            %s, %s, %s,
            %s, %s, %s,
            NOW(), NOW()
        )
    """,
        (
            stock_id,
            prediction["shortTerm"]["trend"],
            prediction["shortTerm"]["priceLow"],
            prediction["shortTerm"]["priceHigh"],
            prediction["midTerm"]["trend"],
            prediction["midTerm"]["priceLow"],
            prediction["midTerm"]["priceHigh"],
            prediction["longTerm"]["trend"],
            prediction["longTerm"]["priceLow"],
            prediction["longTerm"]["priceHigh"],
            prediction["recommendation"],
            prediction["advice"],
            prediction["confidence"],
        ),
    )


def main():
    print("🚀 Starting stock predictions generation...")

    if not DATABASE_URL:
        print("❌ ERROR: DATABASE_URL not set")
        sys.exit(1)

    if not OPENAI_API_KEY:
        print("❌ ERROR: OPENAI_API_KEY not set")
        sys.exit(1)

    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

    try:
        # ユーザーが保有/ウォッチしている銘柄を取得
        cur.execute(
            """
            SELECT DISTINCT s.id, s."tickerCode", s.name, s.sector,
                   s."growthScore", s."stabilityScore", s."dividendScore"
            FROM "Stock" s
            WHERE s.id IN (
                SELECT "stockId" FROM "PortfolioStock"
                UNION
                SELECT "stockId" FROM "WatchlistStock"
            )
        """
        )

        stocks = cur.fetchall()
        total = len(stocks)

        if total == 0:
            print("⚠️  No stocks to analyze")
            return

        print(f"📊 Processing {total} stocks...")

        # 関連ニュースを一括取得
        ticker_codes = [s["tickerCode"] for s in stocks]
        sectors = list(set([s["sector"] for s in stocks if s["sector"]]))

        print(f"📰 Fetching related news for {len(ticker_codes)} stocks...")
        all_news = get_related_news(
            conn=conn,
            ticker_codes=ticker_codes,
            sectors=sectors,
            limit=30,  # 予測生成は多めに取得
            days_ago=7,
        )
        print(f"Found {len(all_news)} related news articles")

        success = 0
        failed = 0

        for i, stock in enumerate(stocks, 1):
            stock_dict = {
                "id": stock["id"],
                "ticker_code": stock["tickerCode"],
                "name": stock["name"],
                "sector": stock["sector"],
            }

            scores = {
                "growth": stock["growthScore"] or 50,
                "stability": stock["stabilityScore"] or 50,
                "dividend": stock["dividendScore"] or 50,
            }

            try:
                print(
                    f"[{i}/{total}] Processing {stock_dict['name']} ({stock_dict['ticker_code']})..."
                )

                # この銘柄に関連するニュースをフィルタリング
                stock_news = [
                    n for n in all_news
                    if (stock_dict['ticker_code'] in n['content'] or
                        stock_dict['ticker_code'].replace('.T', '') in n['content'] or
                        n['sector'] == stock_dict['sector'])
                ][:5]  # 最大5件

                print(f"  📰 Found {len(stock_news)} news for this stock")

                # 1. 基礎データ計算
                baseline = get_baseline_data(cur, stock_dict["id"])

                if not baseline:
                    print(f"  ⚠️  No price data available, skipping...")
                    failed += 1
                    continue

                # 2. AI予測生成（ニュース付き）
                prediction = generate_ai_prediction(stock_dict, baseline, scores, stock_news)

                # 3. データベースに保存
                save_prediction(cur, stock_dict["id"], prediction)

                conn.commit()
                success += 1
                print(f"  ✅ Saved (recommendation: {prediction['recommendation']})")

            except Exception as e:
                print(f"  ❌ Error: {e}")
                conn.rollback()
                failed += 1

        print(f"\n🎉 Completed!")
        print(f"  ✅ Success: {success}")
        print(f"  ❌ Failed: {failed}")
        print(f"  📊 Total: {total}")

        if failed > 0 and success == 0:
            sys.exit(1)

    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
