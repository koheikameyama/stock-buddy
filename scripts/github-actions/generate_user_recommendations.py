#!/usr/bin/env python3
"""
ユーザーごとのAIおすすめ銘柄生成スクリプト

各ユーザーの投資スタイル（期間・リスク許容度）と投資資金に基づき、
DBの株価データを使って、パーソナライズされたおすすめ3銘柄を生成する。

前場終了後（11:35 JST）と後場終了後（15:35 JST）に実行。
"""

import json
import os
import sys
from datetime import datetime, timezone

import psycopg2
import psycopg2.extras
from openai import OpenAI

# 設定
CONFIG = {
    "MAX_PER_SECTOR": 5,       # 各セクターからの最大銘柄数
    "MAX_STOCKS_FOR_AI": 30,  # AIに渡す最大銘柄数
}

# 時間帯別のプロンプト設定
SESSION_PROMPTS = {
    "for_afternoon": {
        "intro": "前場の動きを踏まえたおすすめです。",
        "focus": "後場に注目したい銘柄",
    },
    "for_next_day": {
        "intro": "本日の取引を踏まえた明日へのおすすめです。",
        "focus": "明日以降に注目したい銘柄",
    },
}

PERIOD_LABELS = {
    "short": "短期（1年以内）",
    "medium": "中期（1〜3年）",
    "long": "長期（3年以上）",
}

RISK_LABELS = {
    "low": "低い（安定重視）",
    "medium": "普通（バランス）",
    "high": "高い（成長重視）",
}


def get_database_url() -> str:
    """データベースURLを取得"""
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("Error: DATABASE_URL environment variable not set")
        sys.exit(1)
    return url


def get_openai_client() -> OpenAI:
    """OpenAIクライアントを取得"""
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("Error: OPENAI_API_KEY environment variable not set")
        sys.exit(1)
    return OpenAI(api_key=api_key)


def get_users_with_settings(conn) -> list[dict]:
    """ユーザー設定を取得"""
    with conn.cursor() as cur:
        cur.execute('''
            SELECT "userId", "investmentPeriod", "riskTolerance", "investmentBudget"
            FROM "UserSettings"
        ''')
        rows = cur.fetchall()

    users = [
        {
            "userId": row[0],
            "investmentPeriod": row[1],
            "riskTolerance": row[2],
            "investmentBudget": row[3],
        }
        for row in rows
    ]
    print(f"Found {len(users)} users with settings")
    return users


def get_stocks_with_prices(conn) -> list[dict]:
    """DBから株価データを取得（Pythonスクリプトで事前に更新済み）"""
    with conn.cursor() as cur:
        cur.execute('''
            SELECT id, "tickerCode", name, sector, "latestPrice", "latestVolume", "weekChangeRate"
            FROM "Stock"
            WHERE "priceUpdatedAt" IS NOT NULL
              AND "latestPrice" IS NOT NULL
              AND "latestVolume" IS NOT NULL
            ORDER BY "latestVolume" DESC
        ''')
        rows = cur.fetchall()

    stocks = [
        {
            "id": row[0],
            "tickerCode": row[1],
            "name": row[2],
            "sector": row[3],
            "latestPrice": float(row[4]) if row[4] else 0,
            "volume": int(row[5]) if row[5] else 0,
            "weekChangeRate": float(row[6]) if row[6] else 0,
        }
        for row in rows
    ]

    print(f"Found {len(stocks)} stocks with price data")

    # セクター分散フィルタ
    sector_counts: dict[str, int] = {}
    diversified_stocks = []

    for stock in stocks:
        sector = stock["sector"] or "その他"
        count = sector_counts.get(sector, 0)

        if count < CONFIG["MAX_PER_SECTOR"]:
            diversified_stocks.append(stock)
            sector_counts[sector] = count + 1

    print(f"After sector diversification: {len(diversified_stocks)} stocks")
    return diversified_stocks


def filter_stocks_by_budget(stocks: list[dict], budget: int | None) -> list[dict]:
    """予算でフィルタ（100株購入を前提）"""
    if not budget:
        return stocks
    return [s for s in stocks if s["latestPrice"] * 100 <= budget]


def generate_recommendations_for_user(
    client: OpenAI,
    session: str,
    user: dict,
    stocks: list[dict]
) -> list[dict] | None:
    """AIでおすすめ銘柄を生成"""
    prompts = SESSION_PROMPTS.get(session, SESSION_PROMPTS["for_next_day"])

    period_label = PERIOD_LABELS.get(user["investmentPeriod"] or "", "不明")
    risk_label = RISK_LABELS.get(user["riskTolerance"] or "", "不明")
    budget_label = f"{user['investmentBudget']:,}円" if user["investmentBudget"] else "未設定"

    # 銘柄リスト（最大30件）
    stock_list = stocks[:CONFIG["MAX_STOCKS_FOR_AI"]]
    stock_summaries = [
        f"- {s['name']}（{s['tickerCode']}）: 株価{s['latestPrice']:,.0f}円, "
        f"1週間{'+' if s['weekChangeRate'] >= 0 else ''}{s['weekChangeRate']}%, "
        f"{s['sector'] or '不明'}"
        for s in stock_list
    ]

    prompt = f"""あなたは投資初心者を優しくサポートするAIコーチです。
{prompts['intro']}
以下のユーザーの投資スタイルに合った{prompts['focus']}を3つ選んでください。

【ユーザーの投資スタイル】
- 投資期間: {period_label}
- リスク許容度: {risk_label}
- 投資資金: {budget_label}

【選べる銘柄一覧】
{chr(10).join(stock_summaries)}

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
                {
                    "role": "system",
                    "content": "You are a helpful investment coach for beginners. Always respond in valid JSON format only.",
                },
                {"role": "user", "content": prompt},
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

        # バリデーション
        valid_results = [
            item for item in result
            if item.get("tickerCode") and item.get("reason")
        ][:3]

        return valid_results

    except Exception as e:
        print(f"  Error generating recommendations: {e}")
        return None


def save_user_recommendations(
    conn,
    user_id: str,
    recommendations: list[dict],
    stock_map: dict[str, str]
) -> int:
    """おすすめをDBに保存"""
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

    with conn.cursor() as cur:
        # 既存データを削除
        cur.execute(
            'DELETE FROM "UserDailyRecommendation" WHERE "userId" = %s AND date = %s',
            (user_id, today)
        )

        # 新しいデータを挿入
        saved = 0
        for idx, rec in enumerate(recommendations):
            stock_id = stock_map.get(rec["tickerCode"])

            if not stock_id:
                print(f"  Warning: Stock not found for ticker {rec['tickerCode']}")
                continue

            cur.execute(
                '''
                INSERT INTO "UserDailyRecommendation" (id, "userId", date, "stockId", position, reason, "createdAt")
                VALUES (gen_random_uuid(), %s, %s, %s, %s, %s, NOW())
                ''',
                (user_id, today, stock_id, idx + 1, rec["reason"])
            )
            saved += 1

    conn.commit()
    return saved


def main():
    session = os.environ.get("SESSION", "for_next_day")

    print("=" * 60)
    print("User Daily Recommendation Generation (AI) - Python")
    print("=" * 60)
    print(f"Time: {datetime.now().isoformat()}")
    print(f"Session: {session}")
    print(f"Config:")
    print(f"  - MAX_PER_SECTOR: {CONFIG['MAX_PER_SECTOR']}")
    print(f"  - MAX_STOCKS_FOR_AI: {CONFIG['MAX_STOCKS_FOR_AI']}")
    print()

    # クライアント初期化
    db_url = get_database_url()
    openai_client = get_openai_client()
    conn = psycopg2.connect(db_url)

    try:
        # データ取得
        users = get_users_with_settings(conn)
        all_stocks = get_stocks_with_prices(conn)

        if not users:
            print("No users with settings. Exiting.")
            return

        if not all_stocks:
            print("No stocks with price data. Exiting.")
            return

        # ticker → stockId のマップ
        stock_map = {s["tickerCode"]: s["id"] for s in all_stocks}

        success_count = 0
        error_count = 0

        for user in users:
            print(f"\n--- User: {user['userId']} (budget: {user['investmentBudget']}, "
                  f"period: {user['investmentPeriod']}, risk: {user['riskTolerance']}) ---")

            # 予算でフィルタ
            filtered = filter_stocks_by_budget(all_stocks, user["investmentBudget"])
            print(f"  Stocks after budget filter: {len(filtered)}/{len(all_stocks)}")

            if not filtered:
                print("  No stocks within budget. Skipping.")
                error_count += 1
                continue

            # AI生成
            recommendations = generate_recommendations_for_user(
                openai_client, session, user, filtered
            )

            if not recommendations:
                print("  Failed to generate recommendations.")
                error_count += 1
                continue

            # 保存
            saved = save_user_recommendations(conn, user["userId"], recommendations, stock_map)
            print(f"  Saved {saved} recommendations")

            if saved > 0:
                success_count += 1
            else:
                error_count += 1

        print()
        print("=" * 60)
        print(f"Completed: {success_count} users OK, {error_count} users failed")
        print("=" * 60)

        if error_count > 0 and success_count == 0:
            sys.exit(1)

    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
