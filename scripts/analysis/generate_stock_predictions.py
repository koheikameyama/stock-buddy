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
import yfinance as yf

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


def get_baseline_data(ticker_code):
    """yfinanceからルールベースで基礎データを計算"""
    try:
        # ティッカーコードを正規化
        code = ticker_code if ticker_code.endswith('.T') else ticker_code + '.T'
        stock = yf.Ticker(code)
        hist = stock.history(period="3mo")

        if hist.empty:
            return None

        # OHLCデータを取得（新しい順）
        price_history = []
        for date, row in hist.iterrows():
            price_history.append((
                float(row['Open']),
                float(row['High']),
                float(row['Low']),
                float(row['Close']),
                date.strftime('%Y-%m-%d'),
            ))
        price_history.reverse()

        if not price_history:
            return None

        current_price = price_history[0][3]  # close is index 3
        week_ago = price_history[5][3] if len(price_history) > 5 else None
        month_ago = price_history[20][3] if len(price_history) > 20 else None
        three_months_ago = (
            price_history[60][3] if len(price_history) > 60 else None
        )

        # トレンド計算
        weekly_trend = calculate_trend(current_price, week_ago)
        monthly_trend = calculate_trend(current_price, month_ago)
        quarterly_trend = calculate_trend(current_price, three_months_ago)

        # ボラティリティ計算（直近30日）
        prices = [p[3] for p in price_history[:30]]  # close is index 3
        volatility = calculate_volatility(prices)

        # ローソク足パターン分析
        candlestick_pattern = analyze_candlestick(price_history[0]) if price_history else None
        recent_patterns = get_recent_pattern_summary(price_history[:5]) if len(price_history) >= 5 else None

        return {
            "current_price": current_price,
            "weekly_trend": weekly_trend,
            "monthly_trend": monthly_trend,
            "quarterly_trend": quarterly_trend,
            "volatility": volatility,
            "candlestick_pattern": candlestick_pattern,
            "recent_patterns": recent_patterns,
        }
    except Exception as e:
        print(f"Error fetching baseline data for {ticker_code}: {e}")
        return None


def analyze_candlestick(candle):
    """単一ローソク足パターンを分析"""
    open_price = float(candle[0])
    high = float(candle[1])
    low = float(candle[2])
    close = float(candle[3])

    body = abs(close - open_price)
    range_val = high - low

    if range_val < 0.01:
        return {"description": "様子見", "signal": "neutral", "strength": 30}

    body_ratio = body / range_val if range_val > 0 else 0
    is_large_body = body_ratio >= 0.6
    is_small_body = body_ratio <= 0.2

    upper_wick = high - max(open_price, close)
    lower_wick = min(open_price, close) - low
    has_long_upper = (upper_wick / range_val >= 0.3) if range_val > 0 else False
    has_long_lower = (lower_wick / range_val >= 0.3) if range_val > 0 else False

    is_up = close >= open_price

    if is_up:
        if is_large_body and not has_long_upper and not has_long_lower:
            return {"description": "強い上昇", "signal": "buy", "strength": 80}
        if has_long_lower and not has_long_upper:
            return {"description": "底打ち反発", "signal": "buy", "strength": 75}
        if has_long_upper and not has_long_lower:
            return {"description": "押し目", "signal": "buy", "strength": 60}
        if is_small_body:
            return {"description": "じわじわ上昇", "signal": "buy", "strength": 50}
        return {"description": "上昇", "signal": "buy", "strength": 55}
    else:
        if is_large_body and not has_long_upper and not has_long_lower:
            return {"description": "強い下落", "signal": "sell", "strength": 80}
        if has_long_upper and not has_long_lower:
            return {"description": "戻り売り", "signal": "sell", "strength": 75}
        if has_long_lower and not has_long_upper:
            return {"description": "高値からの下落", "signal": "sell", "strength": 65}
        if is_small_body:
            return {"description": "下落の始まり", "signal": "sell", "strength": 50}
        return {"description": "下落", "signal": "sell", "strength": 55}


def get_recent_pattern_summary(price_history):
    """直近数日のパターンサマリーを取得"""
    buy_signals = 0
    sell_signals = 0

    for candle in price_history:
        p = analyze_candlestick(candle)
        if p['strength'] >= 60:
            if p['signal'] == 'buy':
                buy_signals += 1
            elif p['signal'] == 'sell':
                sell_signals += 1

    return {
        "buy_signals": buy_signals,
        "sell_signals": sell_signals,
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

    # ローソク足パターン情報
    pattern_context = ""
    candlestick = baseline.get('candlestick_pattern')
    recent = baseline.get('recent_patterns')
    if candlestick:
        pattern_context = f"""

【ローソク足パターン分析】
- 最新パターン: {candlestick.get('description', '不明')}
- シグナル: {candlestick.get('signal', 'neutral')}
- 強さ: {candlestick.get('strength', 0)}%"""
        if recent:
            pattern_context += f"""
- 直近5日の買いシグナル: {recent.get('buy_signals', 0)}回
- 直近5日の売りシグナル: {recent.get('sell_signals', 0)}回"""

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
{pattern_context}{news_context}
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

                # 1. 基礎データ計算（yfinanceから）
                baseline = get_baseline_data(stock_dict["ticker_code"])

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
