#!/usr/bin/env python3
"""
ユーザーごとのAIおすすめ銘柄生成スクリプト

各ユーザーの投資スタイル（期間・リスク許容度）と投資資金に基づき、
予算内の銘柄をOpenAI APIに渡して、パーソナライズされたおすすめ3銘柄を生成する。

毎日朝のバッチで実行。
"""

import os
import sys
import json
from datetime import datetime, timezone
from typing import List, Dict, Optional
import psycopg2
import psycopg2.extras
from openai import OpenAI
import yfinance as yf

# OpenAI クライアント初期化
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# 時間帯コンテキスト
TIME_CONTEXT = os.getenv("TIME_CONTEXT", "morning")

# 時間帯別のプロンプト設定
TIME_CONTEXT_PROMPTS = {
    "morning": {
        "intro": "今日の取引開始前のおすすめです。",
        "focus": "今日注目すべき銘柄",
    },
    "noon": {
        "intro": "前場の動きを踏まえたおすすめです。",
        "focus": "後場に注目したい銘柄",
    },
    "close": {
        "intro": "本日の取引を踏まえた明日へのおすすめです。",
        "focus": "明日以降に注目したい銘柄",
    },
}

# データベース接続
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("Error: DATABASE_URL environment variable not set")
    sys.exit(1)


def get_users_with_settings(conn) -> List[Dict]:
    """投資スタイルが設定されているユーザーを取得"""
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("""
            SELECT
                u.id as "userId",
                us."investmentPeriod",
                us."riskTolerance",
                us."investmentBudget"
            FROM "User" u
            JOIN "UserSettings" us ON u.id = us."userId"
        """)
        users = cur.fetchall()
        print(f"Found {len(users)} users with settings")
        return users
    finally:
        cur.close()


def get_stocks_with_prices(conn) -> List[Dict]:
    """全銘柄とyfinanceからリアルタイム株価を取得"""
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("""
            SELECT
                s.id,
                s."tickerCode",
                s.name,
                s.sector,
                s."beginnerScore",
                s."currentPrice"
            FROM "Stock" s
            WHERE s."beginnerScore" IS NOT NULL
            ORDER BY s."beginnerScore" DESC
        """)
        stocks = cur.fetchall()
        print(f"Found {len(stocks)} stocks from database")

        if not stocks:
            return []

        # ティッカーコードを正規化（.Tサフィックス付与）
        ticker_codes = []
        for s in stocks:
            code = s['tickerCode']
            if not code.endswith('.T'):
                code = code + '.T'
            ticker_codes.append(code)

        # yfinanceで一括取得（5日分）
        print(f"Fetching prices for {len(ticker_codes)} stocks from yfinance...")
        try:
            df = yf.download(ticker_codes, period="5d", group_by="ticker", threads=True, progress=False)
        except Exception as e:
            print(f"Error downloading prices: {e}")
            return []

        if df.empty:
            print("No price data returned from yfinance")
            return []

        is_multi = hasattr(df.columns, 'levels') and len(df.columns.levels) > 1

        stocks_with_prices = []
        for stock, code in zip(stocks, ticker_codes):
            try:
                if is_multi:
                    hist = df[code].dropna(how='all')
                else:
                    hist = df.dropna(how='all')

                if hist.empty or len(hist) == 0:
                    continue

                latest = float(hist.iloc[-1]['Close'])
                week_ago = float(hist.iloc[0]['Close']) if len(hist) > 1 else latest
                change_rate = ((latest - week_ago) / week_ago * 100) if week_ago > 0 else 0

                stocks_with_prices.append({
                    **stock,
                    'latestPrice': latest,
                    'weekChangeRate': round(change_rate, 1),
                })
            except Exception as e:
                # 個別銘柄のエラーはスキップ
                continue

        print(f"Found {len(stocks_with_prices)} stocks with price data")
        return stocks_with_prices
    finally:
        cur.close()


def filter_stocks_by_budget(stocks: List[Dict], budget: Optional[int]) -> List[Dict]:
    """予算内の銘柄をフィルタ（100株単位）"""
    if not budget:
        return stocks

    filtered = []
    for stock in stocks:
        price = stock.get('latestPrice') or (float(stock['currentPrice']) if stock.get('currentPrice') else None)
        if price is None:
            filtered.append(stock)  # 価格不明は含める
            continue
        if price * 100 <= budget:
            filtered.append(stock)

    return filtered


def generate_recommendations_for_user(
    user: Dict,
    stocks: List[Dict],
    time_context: str = None,
) -> Optional[List[Dict]]:
    """OpenAI APIでユーザーに合ったおすすめ3銘柄を生成"""

    # 時間帯に応じたプロンプト設定を取得
    context = time_context or TIME_CONTEXT
    prompts = TIME_CONTEXT_PROMPTS.get(context, TIME_CONTEXT_PROMPTS["morning"])

    period_label = {
        'short': '短期（1年以内）',
        'medium': '中期（1〜3年）',
        'long': '長期（3年以上）',
    }.get(user['investmentPeriod'], '不明')

    risk_label = {
        'low': '低い（安定重視）',
        'medium': '普通（バランス）',
        'high': '高い（成長重視）',
    }.get(user['riskTolerance'], '不明')

    budget_label = f"{user['investmentBudget']:,}円" if user.get('investmentBudget') else '未設定'

    # 銘柄リストを作成（最大30件に絞る）
    stock_list = stocks[:30]
    stock_summaries = []
    for s in stock_list:
        summary = f"- {s['name']}（{s['tickerCode']}）: 株価{s['latestPrice']:,.0f}円, 1週間{s['weekChangeRate']:+.1f}%, スコア{s['beginnerScore']}点, {s.get('sector') or '不明'}"
        stock_summaries.append(summary)

    stocks_text = "\n".join(stock_summaries)

    prompt = f"""あなたは投資初心者を優しくサポートするAIコーチです。
{prompts['intro']}
以下のユーザーの投資スタイルに合った{prompts['focus']}を3つ選んでください。

【ユーザーの投資スタイル】
- 投資期間: {period_label}
- リスク許容度: {risk_label}
- 投資資金: {budget_label}

【選べる銘柄一覧】
{stocks_text}

【回答ルール】
- 必ず3銘柄を選んでください（候補が3未満なら全て選ぶ）
- セクターが偏らないようにしてください
- 理由は中学生でも分かる言葉で書いてください
- 専門用語（ROE、PER、ボラティリティ等）は使わないでください
- 「安定している」「成長が期待できる」「みんなが知ってる会社」のような表現を使ってください

【回答形式】
以下のJSON配列で回答してください。JSON以外のテキストは含めないでください。

[
  {{
    "tickerCode": "銘柄コード",
    "reason": "おすすめ理由（1〜2文）"
  }},
  ...
]"""

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a helpful investment coach for beginners. Always respond in valid JSON format only."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            max_tokens=500,
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

        result = json.loads(content)

        if not isinstance(result, list):
            raise ValueError("Response is not a JSON array")

        # バリデーション: tickerCodeとreasonがあるか
        valid_results = []
        for item in result[:3]:
            if 'tickerCode' in item and 'reason' in item:
                valid_results.append(item)

        return valid_results

    except json.JSONDecodeError as e:
        print(f"  Error: Failed to parse JSON: {e}")
        print(f"  Content: {content}")
        return None
    except Exception as e:
        print(f"  Error generating recommendations: {e}")
        return None


def save_user_recommendations(conn, user_id: str, recommendations: List[Dict], stock_map: Dict):
    """ユーザーのおすすめをDBに保存"""
    cur = conn.cursor()
    try:
        today = datetime.now(timezone.utc).date()

        # 既存データを削除
        cur.execute("""
            DELETE FROM "UserDailyRecommendation"
            WHERE "userId" = %s AND date = %s
        """, (user_id, today))

        # 新しいデータを挿入
        saved = 0
        for idx, rec in enumerate(recommendations, 1):
            ticker = rec['tickerCode']
            stock_id = stock_map.get(ticker)
            if not stock_id:
                print(f"  Warning: Stock not found for ticker {ticker}")
                continue

            cur.execute("""
                INSERT INTO "UserDailyRecommendation"
                    (id, "userId", date, "stockId", position, reason, "createdAt")
                VALUES
                    (gen_random_uuid(), %s, %s, %s, %s, %s, NOW())
            """, (user_id, today, stock_id, idx, rec['reason']))
            saved += 1

        conn.commit()
        return saved

    except Exception as e:
        conn.rollback()
        print(f"  Error saving recommendations: {e}")
        return 0
    finally:
        cur.close()


def main():
    print("=" * 60)
    print("User Daily Recommendation Generation (AI)")
    print("=" * 60)
    print(f"Time: {datetime.now(timezone.utc).isoformat()}")

    if not os.getenv("OPENAI_API_KEY"):
        print("Error: OPENAI_API_KEY environment variable not set")
        sys.exit(1)

    conn = psycopg2.connect(DATABASE_URL)

    try:
        # ユーザーと銘柄データ取得
        users = get_users_with_settings(conn)
        all_stocks = get_stocks_with_prices(conn)

        if not users:
            print("No users with settings. Exiting.")
            sys.exit(0)

        if not all_stocks:
            print("No stocks with price data. Exiting.")
            sys.exit(0)

        # ticker → stockId のマップ
        stock_map = {s['tickerCode']: s['id'] for s in all_stocks}

        success_count = 0
        error_count = 0

        for user in users:
            user_id = user['userId']
            budget = user.get('investmentBudget')
            print(f"\n--- User: {user_id} (budget: {budget}, period: {user['investmentPeriod']}, risk: {user['riskTolerance']}) ---")

            # 予算でフィルタ
            filtered = filter_stocks_by_budget(all_stocks, budget)
            print(f"  Stocks after budget filter: {len(filtered)}/{len(all_stocks)}")

            if not filtered:
                print("  No stocks within budget. Skipping.")
                error_count += 1
                continue

            # AI生成（時間帯考慮）
            recommendations = generate_recommendations_for_user(user, filtered, TIME_CONTEXT)

            if not recommendations:
                print("  Failed to generate recommendations.")
                error_count += 1
                continue

            # 保存
            saved = save_user_recommendations(conn, user_id, recommendations, stock_map)
            print(f"  Saved {saved} recommendations")

            if saved > 0:
                success_count += 1
            else:
                error_count += 1

        print(f"\n{'=' * 60}")
        print(f"Completed: {success_count} users OK, {error_count} users failed")
        print(f"{'=' * 60}")

        if error_count > 0 and success_count == 0:
            sys.exit(1)

    finally:
        conn.close()


if __name__ == "__main__":
    main()
