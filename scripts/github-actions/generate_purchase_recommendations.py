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


def generate_recommendation(client: OpenAI, stock: dict, recent_prices: list[dict], pattern_analysis: dict | None, current_price: float | None) -> dict | None:
    prompts = TIME_CONTEXT_PROMPTS.get(TIME_CONTEXT, TIME_CONTEXT_PROMPTS["morning"])
    pattern_context = ""
    if pattern_analysis:
        pattern_context = f"\n【ローソク足パターン分析】\n- 最新パターン: {pattern_analysis['latest']['description']}\n- シグナル: {pattern_analysis['latest']['signal']}\n- 強さ: {pattern_analysis['latest']['strength']}%\n"

    prompt = f"""あなたは投資初心者向けのAIコーチです。
{prompts['intro']}
以下の銘柄について、{prompts['focus']}を判断してください。

【銘柄情報】
- 名前: {stock['name']}
- ティッカーコード: {stock['tickerCode']}
- セクター: {stock['sector'] or '不明'}
- 現在価格: {current_price or '不明'}円
{pattern_context}
【回答形式】JSON形式で回答してください。
{{"recommendation": "buy" | "hold", "confidence": 0.0-1.0, "reason": "理由1-2文", "recommendedQuantity": 100株単位（buyのみ）, "recommendedPrice": 目安価格（buyのみ）, "estimatedAmount": 必要金額（buyのみ）, "caution": "注意点1-2文"}}

【制約】専門用語は使わない。中学生でも理解できる表現にする。"""

    try:
        response = client.chat.completions.create(model="gpt-4o-mini", messages=[{"role": "system", "content": "You are a helpful investment coach. Respond in JSON format."}, {"role": "user", "content": prompt}], temperature=0.7, max_tokens=500)
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
    with conn.cursor() as cur:
        cur.execute('SELECT id FROM "PurchaseRecommendation" WHERE "stockId" = %s AND date = %s', (stock_id, today))
        existing = cur.fetchone()
        if existing:
            cur.execute('UPDATE "PurchaseRecommendation" SET recommendation = %s, confidence = %s, "recommendedQuantity" = %s, "recommendedPrice" = %s, "estimatedAmount" = %s, reason = %s, caution = %s, "updatedAt" = %s WHERE "stockId" = %s AND date = %s',
                (recommendation["recommendation"], recommendation["confidence"], recommendation.get("recommendedQuantity"), recommendation.get("recommendedPrice"), recommendation.get("estimatedAmount"), recommendation["reason"], recommendation["caution"], datetime.now(timezone.utc), stock_id, today))
        else:
            cur.execute('INSERT INTO "PurchaseRecommendation" (id, "stockId", date, recommendation, confidence, "recommendedQuantity", "recommendedPrice", "estimatedAmount", reason, caution, "createdAt", "updatedAt") VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)',
                (str(uuid.uuid4().hex[:25]), stock_id, today, recommendation["recommendation"], recommendation["confidence"], recommendation.get("recommendedQuantity"), recommendation.get("recommendedPrice"), recommendation.get("estimatedAmount"), recommendation["reason"], recommendation["caution"], datetime.now(timezone.utc), datetime.now(timezone.utc)))
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

            print(f"Generated: {recommendation['recommendation']} (confidence: {recommendation['confidence']})")
            save_recommendation(conn, ws["stockId"], recommendation)
            success_count += 1

        print(f"\n=== Summary ===")
        print(f"Success: {success_count}, Errors: {error_count}")

    finally:
        conn.close()


if __name__ == "__main__":
    main()
