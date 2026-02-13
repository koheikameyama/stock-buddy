#!/usr/bin/env python3
"""
購入判断分析を生成するスクリプト

ウォッチリスト（気になる銘柄）に対して、毎日AI分析を行い購入判断を生成します。
"""

import os
import sys
import uuid
import json
from datetime import datetime, timezone

import psycopg2
import yfinance as yf
from openai import OpenAI


TIME_CONTEXT = os.environ.get("TIME_CONTEXT", "morning")

TIME_CONTEXT_PROMPTS = {
    "morning": {"intro": "今日の取引開始前の購入判断です。", "focus": "今日の買いタイミングとチェックポイント"},
    "noon": {"intro": "前場の取引を踏まえた購入判断です。", "focus": "前場の動きを踏まえた後場の買いタイミング"},
    "close": {"intro": "本日の取引終了後の振り返りと明日への展望です。", "focus": "本日の値動きを踏まえた明日以降の買い時"},
}


def get_database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("Error: DATABASE_URL environment variable not set")
        sys.exit(1)
    return url


def fetch_watchlist_stocks(conn) -> list[dict]:
    with conn.cursor() as cur:
        cur.execute('''
            SELECT ws.id, ws."userId", ws."stockId", s."tickerCode", s.name, s.sector, s."latestPrice"
            FROM "WatchlistStock" ws
            JOIN "Stock" s ON ws."stockId" = s.id
        ''')
        rows = cur.fetchall()
    return [{"id": row[0], "userId": row[1], "stockId": row[2], "tickerCode": row[3], "name": row[4], "sector": row[5], "latestPrice": float(row[6]) if row[6] else None} for row in rows]


def fetch_recent_prices(ticker_code: str) -> list[dict]:
    try:
        symbol = ticker_code if ticker_code.endswith(".T") else f"{ticker_code}.T"
        ticker = yf.Ticker(symbol)
        hist = ticker.history(period="1mo")
        if hist.empty:
            return []
        prices = [{"date": date.strftime("%Y-%m-%d"), "open": float(row["Open"]), "high": float(row["High"]), "low": float(row["Low"]), "close": float(row["Close"]), "volume": int(row["Volume"])} for date, row in hist.iterrows()]
        return sorted(prices, key=lambda x: x["date"], reverse=True)
    except Exception as e:
        print(f"Error fetching prices for {ticker_code}: {e}")
        return []


def analyze_candlestick_pattern(candle: dict) -> dict:
    open_price, high, low, close = candle["open"], candle["high"], candle["low"], candle["close"]
    body, range_val = abs(close - open_price), high - low
    if range_val < 0.01:
        return {"description": "様子見", "signal": "neutral", "strength": 30}
    body_ratio = body / range_val if range_val > 0 else 0
    is_large_body, is_small_body = body_ratio >= 0.6, body_ratio <= 0.2
    upper_wick, lower_wick = high - max(open_price, close), min(open_price, close) - low
    has_long_upper = upper_wick / range_val >= 0.3 if range_val > 0 else False
    has_long_lower = lower_wick / range_val >= 0.3 if range_val > 0 else False
    is_up = close >= open_price
    if is_up:
        if is_large_body and not has_long_upper and not has_long_lower:
            return {"description": "強い上昇", "signal": "buy", "strength": 80}
        if has_long_lower and not has_long_upper:
            return {"description": "底打ち反発", "signal": "buy", "strength": 75}
        return {"description": "上昇", "signal": "buy", "strength": 55}
    else:
        if is_large_body and not has_long_upper and not has_long_lower:
            return {"description": "強い下落", "signal": "sell", "strength": 80}
        return {"description": "下落", "signal": "sell", "strength": 55}


def get_pattern_analysis(recent_prices: list[dict]) -> dict | None:
    if not recent_prices:
        return None
    latest = recent_prices[0]
    pattern = analyze_candlestick_pattern(latest)
    buy_signals, sell_signals = 0, 0
    for price in recent_prices[:5]:
        p = analyze_candlestick_pattern(price)
        if p["strength"] >= 60:
            if p["signal"] == "buy":
                buy_signals += 1
            elif p["signal"] == "sell":
                sell_signals += 1
    return {"latest": pattern, "recent_buy_signals": buy_signals, "recent_sell_signals": sell_signals}


def calculate_rsi(prices: list[dict], period: int = 14) -> float | None:
    """RSIを計算する"""
    if len(prices) < period + 1:
        return None
    # 古い順に並べ替え
    sorted_prices = sorted(prices, key=lambda x: x["date"])
    gains, losses = [], []
    for i in range(1, len(sorted_prices)):
        change = sorted_prices[i]["close"] - sorted_prices[i - 1]["close"]
        if change >= 0:
            gains.append(change)
            losses.append(0)
        else:
            gains.append(0)
            losses.append(abs(change))
    if len(gains) < period:
        return None
    avg_gain = sum(gains[-period:]) / period
    avg_loss = sum(losses[-period:]) / period
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))


def get_rsi_interpretation(rsi: float | None) -> str:
    """RSIの初心者向け解釈を返す"""
    if rsi is None:
        return ""
    if rsi <= 30:
        return f"{rsi:.1f}（売られすぎ → 反発の可能性あり）"
    elif rsi <= 40:
        return f"{rsi:.1f}（やや売られすぎ）"
    elif rsi >= 70:
        return f"{rsi:.1f}（買われすぎ → 下落の可能性あり）"
    elif rsi >= 60:
        return f"{rsi:.1f}（やや買われすぎ）"
    else:
        return f"{rsi:.1f}（通常範囲）"


def generate_recommendation(client: OpenAI, stock: dict, recent_prices: list[dict], pattern_analysis: dict | None, current_price: float | None) -> dict | None:
    prompts = TIME_CONTEXT_PROMPTS.get(TIME_CONTEXT, TIME_CONTEXT_PROMPTS["morning"])
    pattern_context = ""
    if pattern_analysis:
        pattern_context = f"""
【ローソク足パターン分析】
- 最新パターン: {pattern_analysis['latest']['description']}
- シグナル: {pattern_analysis['latest']['signal']}
- 強さ: {pattern_analysis['latest']['strength']}%
- 直近5日の買いシグナル: {pattern_analysis['recent_buy_signals']}回
- 直近5日の売りシグナル: {pattern_analysis['recent_sell_signals']}回
"""

    # テクニカル指標
    technical_context = ""
    if len(recent_prices) >= 15:
        rsi = calculate_rsi(recent_prices, 14)
        if rsi is not None:
            rsi_interpretation = get_rsi_interpretation(rsi)
            technical_context = f"""
【テクニカル指標】
- 売られすぎ/買われすぎ度合い: {rsi_interpretation}
"""

    # 価格データサマリー
    price_summary = ""
    if recent_prices:
        closes = [p["close"] for p in recent_prices[:30]]
        if closes:
            max_price = max(closes)
            min_price = min(closes)
            avg_price = sum(closes) / len(closes)
            price_summary = f"""
【直近30日の価格推移】
- 最高値: {max_price:,.0f}円
- 最安値: {min_price:,.0f}円
- 平均: {avg_price:,.0f}円
"""

    prompt = f"""あなたは投資を学びたい人向けのAIコーチです。
{prompts['intro']}
以下の銘柄について、詳細な購入判断をしてください。
テクニカル分析の結果を活用し、専門用語は解説を添えて使ってください。

【銘柄情報】
- 名前: {stock['name']}
- ティッカーコード: {stock['tickerCode']}
- セクター: {stock['sector'] or '不明'}
- 現在価格: {current_price or '不明'}円
{pattern_context}{technical_context}{price_summary}
【回答形式】
以下のJSON形式で回答してください。JSON以外のテキストは含めないでください。

{{
  "recommendation": "buy" | "hold",
  "confidence": 0.0から1.0の数値（小数点2桁）,
  "reason": "初心者に分かりやすい言葉で1-2文の理由",
  "caution": "注意点を1-2文",

  // A. 買い時判断
  "shouldBuyToday": true | false,
  "idealEntryPrice": 理想の買い値（整数）,
  "idealEntryPriceExpiry": "理想の買い値の有効期限（ISO 8601形式、例: 2026-02-20）",
  "priceGap": 現在価格との差（マイナス=割安、プラス=割高）,
  "buyTimingExplanation": "買い時の説明（例: あと50円下がったら最高の買い時です / 今が買い時です！）",

  // B. 深掘り評価
  "positives": "良いところを3つ、箇条書き（各項目は1行で簡潔に）",
  "concerns": "不安な点を2-3つ、箇条書き（各項目は1行で簡潔に）",
  "suitableFor": "こんな人におすすめ（1-2文で具体的に）"
}}

【制約】
- 専門用語（RSI、チャートパターン名など）は使ってOKだが、必ず簡単な解説を添える
  例: 「RSI（売られすぎ・買われすぎを判断する指標）が30を下回り…」
- positives、concernsは箇条書き形式（・で始める）
- idealEntryPriceは現実的な価格を設定（現在価格の±10%程度）
- idealEntryPriceExpiryは市場状況に応じて1日〜2週間程度の範囲で設定"""

    try:
        response = client.chat.completions.create(model="gpt-4o-mini", messages=[{"role": "system", "content": "You are a helpful investment coach for beginners. Always respond in JSON format."}, {"role": "user", "content": prompt}], temperature=0.7, max_tokens=800)
        content = response.choices[0].message.content.strip()
        if content.startswith("```json"):
            content = content[7:]
        elif content.startswith("```"):
            content = content[3:]
        if content.endswith("```"):
            content = content[:-3]
        return json.loads(content.strip())
    except Exception as e:
        print(f"Error generating recommendation: {e}")
        return None


def save_recommendation(conn, stock_id: str, recommendation: dict):
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    now = datetime.now(timezone.utc)

    # 有効期限をパース
    expiry = None
    if recommendation.get("idealEntryPriceExpiry"):
        try:
            expiry = datetime.fromisoformat(recommendation["idealEntryPriceExpiry"].replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            expiry = None

    with conn.cursor() as cur:
        cur.execute('SELECT id FROM "PurchaseRecommendation" WHERE "stockId" = %s AND date = %s', (stock_id, today))
        existing = cur.fetchone()
        if existing:
            cur.execute('''
                UPDATE "PurchaseRecommendation" SET
                    recommendation = %s, confidence = %s, reason = %s, caution = %s,
                    "shouldBuyToday" = %s, "idealEntryPrice" = %s, "idealEntryPriceExpiry" = %s,
                    "priceGap" = %s, "buyTimingExplanation" = %s,
                    positives = %s, concerns = %s, "suitableFor" = %s,
                    "updatedAt" = %s
                WHERE "stockId" = %s AND date = %s
            ''', (
                recommendation["recommendation"], recommendation["confidence"],
                recommendation["reason"], recommendation["caution"],
                recommendation.get("shouldBuyToday"), recommendation.get("idealEntryPrice"),
                expiry, recommendation.get("priceGap"), recommendation.get("buyTimingExplanation"),
                recommendation.get("positives"), recommendation.get("concerns"), recommendation.get("suitableFor"),
                now, stock_id, today
            ))
        else:
            cur.execute('''
                INSERT INTO "PurchaseRecommendation" (
                    id, "stockId", date, recommendation, confidence, reason, caution,
                    "shouldBuyToday", "idealEntryPrice", "idealEntryPriceExpiry",
                    "priceGap", "buyTimingExplanation",
                    positives, concerns, "suitableFor",
                    "createdAt", "updatedAt"
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ''', (
                str(uuid.uuid4().hex[:25]), stock_id, today,
                recommendation["recommendation"], recommendation["confidence"],
                recommendation["reason"], recommendation["caution"],
                recommendation.get("shouldBuyToday"), recommendation.get("idealEntryPrice"),
                expiry, recommendation.get("priceGap"), recommendation.get("buyTimingExplanation"),
                recommendation.get("positives"), recommendation.get("concerns"), recommendation.get("suitableFor"),
                now, now
            ))
    conn.commit()


def main():
    print("=== Starting Purchase Recommendation Generation (Python) ===")
    print(f"Time: {datetime.now().isoformat()}")

    openai_key = os.environ.get("OPENAI_API_KEY")
    if not openai_key:
        print("Error: OPENAI_API_KEY environment variable not set")
        sys.exit(1)

    client = OpenAI(api_key=openai_key)
    conn = psycopg2.connect(get_database_url())

    try:
        watchlist_stocks = fetch_watchlist_stocks(conn)
        print(f"Found {len(watchlist_stocks)} stocks in watchlist")

        if not watchlist_stocks:
            print("No stocks in watchlist. Exiting.")
            return

        success_count, error_count = 0, 0

        for ws in watchlist_stocks:
            print(f"\n--- Processing: {ws['name']} ({ws['tickerCode']}) ---")
            recent_prices = fetch_recent_prices(ws["tickerCode"])
            current_price = recent_prices[0]["close"] if recent_prices else ws["latestPrice"]
            pattern_analysis = get_pattern_analysis(recent_prices)

            recommendation = generate_recommendation(client, ws, recent_prices, pattern_analysis, current_price)

            if not recommendation:
                print(f"Failed to generate recommendation")
                error_count += 1
                continue

            ideal_price = recommendation.get("idealEntryPrice")
            ideal_price_str = f", 理想の買い値: {ideal_price:,}円" if ideal_price else ""
            print(f"Generated: {recommendation['recommendation']} (confidence: {recommendation['confidence']}{ideal_price_str})")
            save_recommendation(conn, ws["stockId"], recommendation)
            success_count += 1

        print(f"\n=== Summary ===")
        print(f"Success: {success_count}, Errors: {error_count}")

    finally:
        conn.close()


if __name__ == "__main__":
    main()
