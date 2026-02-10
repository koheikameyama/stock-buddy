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
import yfinance as yf

# Add path to lib directory for news fetcher
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from lib.news_fetcher import get_related_news, format_news_for_prompt

# OpenAI クライアント初期化
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# 時間帯コンテキスト
TIME_CONTEXT = os.getenv("TIME_CONTEXT", "morning")

# 時間帯別のプロンプト設定
TIME_CONTEXT_PROMPTS = {
    "morning": {
        "intro": "今日の取引開始前の購入判断です。",
        "focus": "今日の買いタイミングとチェックポイント",
    },
    "noon": {
        "intro": "前場の取引を踏まえた購入判断です。",
        "focus": "前場の動きを踏まえた後場の買いタイミング",
    },
    "close": {
        "intro": "本日の取引終了後の振り返りと明日への展望です。",
        "focus": "本日の値動きを踏まえた明日以降の買い時",
    },
}

# データベース接続
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("Error: DATABASE_URL environment variable not set")
    sys.exit(1)


def get_user_settings(conn, user_id):
    """ユーザーの投資スタイル設定を取得"""
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("""
            SELECT
                "investmentPeriod",
                "riskTolerance"
            FROM "UserSettings"
            WHERE "userId" = %s
        """, (user_id,))
        return cur.fetchone()
    finally:
        cur.close()


def format_investment_style(settings):
    """投資スタイルを文字列にフォーマット"""
    if not settings:
        return None

    period_label = {
        'short': '短期（1年以内）',
        'medium': '中期（1〜3年）',
        'long': '長期（3年以上）',
    }.get(settings.get('investmentPeriod'), None)

    risk_label = {
        'low': '低い（安定重視）',
        'medium': '普通（バランス）',
        'high': '高い（成長重視）',
    }.get(settings.get('riskTolerance'), None)

    if not period_label and not risk_label:
        return None

    lines = []
    if period_label:
        lines.append(f"- 投資期間: {period_label}")
    if risk_label:
        lines.append(f"- リスク許容度: {risk_label}")

    return "\n".join(lines)


def get_watchlist_stocks(conn):
    """ウォッチリスト（気になる銘柄）を取得（ユーザー情報付き）"""
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    try:
        # WatchlistStockから銘柄を取得（ユーザー情報付き）
        cur.execute("""
            SELECT
                s.id,
                s."tickerCode",
                s.name,
                s.sector,
                s."currentPrice",
                ws."userId"
            FROM "WatchlistStock" ws
            JOIN "Stock" s ON ws."stockId" = s.id
            ORDER BY ws."userId", s.name
        """)

        stocks = cur.fetchall()
        print(f"Found {len(stocks)} stocks in watchlist")
        return stocks
    finally:
        cur.close()


def get_stock_prediction(conn, stock_id):
    """既存の株価予測データを取得"""
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    try:
        cur.execute("""
            SELECT
                "advice" as "shortTerm",
                "advice" as "mediumTerm",
                "advice" as "longTerm"
            FROM "StockAnalysis"
            WHERE "stockId" = %s
            ORDER BY "analyzedAt" DESC
            LIMIT 1
        """, (stock_id,))

        result = cur.fetchone()
        return result if result else {}
    finally:
        cur.close()


def get_recent_prices(ticker_code):
    """yfinanceから直近30日の株価データを取得（OHLC含む）"""
    try:
        # ティッカーコードを正規化
        code = ticker_code if ticker_code.endswith('.T') else ticker_code + '.T'
        stock = yf.Ticker(code)
        hist = stock.history(period="1mo")

        if hist.empty:
            return []

        prices = []
        for date, row in hist.iterrows():
            prices.append({
                'date': date.strftime('%Y-%m-%d'),
                'open': float(row['Open']),
                'high': float(row['High']),
                'low': float(row['Low']),
                'close': float(row['Close']),
                'volume': int(row['Volume']),
            })

        # 新しい順にソート
        prices.reverse()
        return prices
    except Exception as e:
        print(f"Error fetching prices for {ticker_code}: {e}")
        return []


def analyze_candlestick_pattern(candle):
    """単一ローソク足パターンを分析"""
    open_price = float(candle['open'])
    high = float(candle['high'])
    low = float(candle['low'])
    close = float(candle['close'])

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


def get_pattern_analysis(recent_prices):
    """直近のローソク足パターンを分析"""
    if not recent_prices or len(recent_prices) < 1:
        return None

    # 最新のローソク足を分析
    latest = recent_prices[0]
    pattern = analyze_candlestick_pattern(latest)

    # 直近5日のシグナルをカウント
    buy_signals = 0
    sell_signals = 0

    for price in recent_prices[:5]:
        p = analyze_candlestick_pattern(price)
        if p['strength'] >= 60:
            if p['signal'] == 'buy':
                buy_signals += 1
            elif p['signal'] == 'sell':
                sell_signals += 1

    return {
        "latest": pattern,
        "recent_buy_signals": buy_signals,
        "recent_sell_signals": sell_signals,
    }


def generate_recommendation(stock, prediction, recent_prices, related_news=None, pattern_analysis=None, time_context=None, investment_style=None):
    """OpenAI APIを使って購入判断を生成"""

    # 時間帯に応じたプロンプト設定を取得
    context = time_context or TIME_CONTEXT
    prompts = TIME_CONTEXT_PROMPTS.get(context, TIME_CONTEXT_PROMPTS["morning"])

    # 投資スタイルをフォーマット
    style_context = ""
    if investment_style:
        style_context = f"""

【ユーザーの投資スタイル】
{investment_style}
※ ユーザーの投資スタイルに合わせた購入判断をしてください。"""

    # ニュース情報をフォーマット
    news_context = ""
    if related_news:
        news_context = f"""

【最新のニュース情報】
{format_news_for_prompt(related_news)}
"""

    # ローソク足パターン情報
    pattern_context = ""
    if pattern_analysis:
        latest = pattern_analysis.get('latest', {})
        pattern_context = f"""

【ローソク足パターン分析】
- 最新パターン: {latest.get('description', '不明')}
- シグナル: {latest.get('signal', 'neutral')}
- 強さ: {latest.get('strength', 0)}%
- 直近5日の買いシグナル: {pattern_analysis.get('recent_buy_signals', 0)}回
- 直近5日の売りシグナル: {pattern_analysis.get('recent_sell_signals', 0)}回
"""

    # プロンプト構築
    prompt = f"""あなたは投資初心者向けのAIコーチです。
{prompts['intro']}
以下の銘柄について、{prompts['focus']}を判断してください。

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
{pattern_context}{news_context}{style_context}
【回答形式】
以下のJSON形式で回答してください。JSON以外のテキストは含めないでください。

{{
  "recommendation": "buy" | "hold" | "pass",
  "confidence": 0.0から1.0の数値（小数点2桁）,
  "reason": "初心者に分かりやすい言葉で1-2文の理由（ニュース情報があれば参考にする）",
  "recommendedQuantity": 100株単位の整数（buyの場合のみ、それ以外はnull）,
  "recommendedPrice": 目安価格の整数（buyの場合のみ、それ以外はnull）,
  "estimatedAmount": 必要金額の整数（buyの場合のみ、それ以外はnull）,
  "caution": "注意点を1-2文"
}}

【制約】
- 提供されたニュース情報を参考にしてください
- ニュースにない情報は推測や創作をしないでください
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

        # マークダウンコードブロックを削除
        if content.startswith("```json"):
            content = content[7:]  # "```json" を削除
        elif content.startswith("```"):
            content = content[3:]  # "```" を削除
        if content.endswith("```"):
            content = content[:-3]  # 末尾の "```" を削除
        content = content.strip()

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


def save_recommendation(conn, stock_id, recommendation_data):
    """購入判断をデータベースに保存（upsert）"""
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


def main():
    """メイン処理"""
    print("=== Starting Purchase Recommendation Generation ===")
    print(f"Time: {datetime.now(timezone.utc).isoformat()}")

    # OpenAI APIキーの確認
    if not os.getenv("OPENAI_API_KEY"):
        print("Error: OPENAI_API_KEY environment variable not set")
        sys.exit(1)

    # データベース接続
    conn = psycopg2.connect(DATABASE_URL)

    try:
        # ウォッチリスト取得
        stocks = get_watchlist_stocks(conn)

        if not stocks:
            print("No stocks in watchlist. Exiting.")
            sys.exit(0)

        # 関連ニュースを一括取得
        ticker_codes = [s['tickerCode'] for s in stocks]
        sectors = list(set([s['sector'] for s in stocks if s['sector']]))

        print(f"Fetching related news for {len(ticker_codes)} stocks...")
        all_news = get_related_news(
            conn=conn,
            ticker_codes=ticker_codes,
            sectors=sectors,
            limit=20,  # 購入判断は多めに取得
            days_ago=7,
        )
        print(f"Found {len(all_news)} related news articles")

        success_count = 0
        error_count = 0

        # ユーザーの投資スタイルをキャッシュ
        user_styles = {}

        for stock in stocks:
            print(f"\n--- Processing: {stock['name']} ({stock['tickerCode']}) ---")

            # ユーザーの投資スタイルを取得（キャッシュ）
            user_id = stock.get('userId')
            investment_style = None
            if user_id:
                if user_id not in user_styles:
                    settings = get_user_settings(conn, user_id)
                    user_styles[user_id] = format_investment_style(settings)
                investment_style = user_styles[user_id]

            # この銘柄に関連するニュースをフィルタリング
            stock_news = [
                n for n in all_news
                if (stock['tickerCode'] in n['content'] or
                    stock['tickerCode'].replace('.T', '') in n['content'] or
                    n['sector'] == stock['sector'])
            ][:5]  # 最大5件

            print(f"Found {len(stock_news)} news for this stock")

            # 予測データ取得
            prediction = get_stock_prediction(conn, stock['id'])

            # 直近価格取得（yfinanceから）
            recent_prices = get_recent_prices(stock['tickerCode'])

            # ローソク足パターン分析
            pattern_analysis = get_pattern_analysis(recent_prices)
            if pattern_analysis:
                print(f"Pattern analysis: {pattern_analysis['latest']['description']} ({pattern_analysis['latest']['signal']})")

            # 購入判断生成（ニュース・パターン分析付き、時間帯考慮、投資スタイル考慮）
            recommendation = generate_recommendation(stock, prediction, recent_prices, stock_news, pattern_analysis, TIME_CONTEXT, investment_style)

            if not recommendation:
                print(f"❌ Failed to generate recommendation for {stock['name']}")
                error_count += 1
                continue

            print(f"Generated recommendation: {recommendation['recommendation']}")
            print(f"Confidence: {recommendation['confidence']}")
            print(f"Reason: {recommendation['reason']}")

            # データベース保存
            if save_recommendation(conn, stock['id'], recommendation):
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
