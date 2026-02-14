#!/usr/bin/env python3
"""
ユーザーごとのAIおすすめ銘柄生成スクリプト

各ユーザーの投資スタイル（期間・リスク許容度）と投資資金に基づき、
DBの株価データを使って、パーソナライズされたおすすめ3銘柄を生成する。

寄り前（08:00 JST）、前場終了後（11:35 JST）、後場終了後（15:35 JST）に実行。
"""

import json
import os
import sys
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import psycopg2
import psycopg2.extras
from openai import OpenAI

# 設定
CONFIG = {
    "MAX_PER_SECTOR": 5,       # 各セクターからの最大銘柄数
    "MAX_STOCKS_FOR_AI": 30,   # AIに渡す最大銘柄数
    "MAX_VOLATILITY": 50,      # ボラティリティ上限（%）- 赤字 AND 高ボラの組み合わせでペナルティ
}

# 赤字 AND 高ボラティリティ銘柄へのスコアペナルティ（投資スタイル別）
RISK_PENALTY = {
    "high": -10,    # 高リスク志向: -10点（軽めのペナルティ）
    "medium": -15,  # 中リスク志向: -15点
    "low": -30,     # 低リスク志向: -30点
}

# 黒字・増益銘柄へのスコアボーナス（投資スタイル別）
PROFITABILITY_BONUS = {
    "high": {"profitable": 3, "increasing": 5},      # 高リスク志向: 小さめのボーナス
    "medium": {"profitable": 5, "increasing": 8},     # 中リスク志向: 中程度のボーナス
    "low": {"profitable": 8, "increasing": 12},       # 低リスク志向: 大きめのボーナス
}

# 投資スタイル別のスコア配分（period × risk）
# 各指標の重み（合計100）
# 改善: dividendYieldを追加し、短期モメンタム偏重を是正
SCORE_WEIGHTS = {
    # 短期
    ("short", "high"): {
        "weekChangeRate": 30,  # モメンタム（40→30に抑制: 過度なモメンタム追従を緩和）
        "volumeRatio": 25,     # 注目度
        "volatility": 20,      # 高ボラ歓迎
        "marketCap": 15,       # 安定性（10→15に増加）
        "dividendYield": 10,   # 配当（短期でも最低限考慮）
    },
    ("short", "medium"): {
        "weekChangeRate": 25,  # 35→25に抑制
        "volumeRatio": 20,
        "volatility": 15,
        "marketCap": 25,
        "dividendYield": 15,
    },
    ("short", "low"): {
        "weekChangeRate": 15,  # 25→15に抑制
        "volumeRatio": 15,
        "volatility": 15,      # 低ボラ重視（反転）
        "marketCap": 35,
        "dividendYield": 20,   # 低リスクは配当重視
    },
    # 中期
    ("medium", "high"): {
        "weekChangeRate": 20,  # 30→20に抑制
        "volumeRatio": 20,
        "volatility": 20,
        "marketCap": 25,
        "dividendYield": 15,
    },
    ("medium", "medium"): {
        "weekChangeRate": 15,  # 25→15に抑制
        "volumeRatio": 20,
        "volatility": 20,
        "marketCap": 25,
        "dividendYield": 20,
    },
    ("medium", "low"): {
        "weekChangeRate": 10,  # 15→10に抑制
        "volumeRatio": 10,
        "volatility": 25,      # 低ボラ重視（反転）
        "marketCap": 30,
        "dividendYield": 25,   # 中期低リスクは配当重視
    },
    # 長期
    ("long", "high"): {
        "weekChangeRate": 10,  # 20→10に抑制（長期は短期モメンタム不要）
        "volumeRatio": 15,
        "volatility": 20,
        "marketCap": 30,
        "dividendYield": 25,
    },
    ("long", "medium"): {
        "weekChangeRate": 5,   # 15→5に大幅抑制
        "volumeRatio": 10,
        "volatility": 25,      # 低ボラ重視（反転）
        "marketCap": 30,
        "dividendYield": 30,   # 長期は配当最重視
    },
    ("long", "low"): {
        "weekChangeRate": 5,   # 10→5に抑制
        "volumeRatio": 5,
        "volatility": 25,      # 低ボラ最重視（反転）
        "marketCap": 30,
        "dividendYield": 35,   # 長期低リスクは配当最重視
    },
}

# 時間帯別のプロンプト設定
SESSION_PROMPTS = {
    "morning": {
        "intro": "前日の動きを踏まえた今日のおすすめです。",
        "focus": "今日注目したい銘柄",
    },
    "afternoon": {
        "intro": "前場の動きを踏まえたおすすめです。",
        "focus": "後場に注目したい銘柄",
    },
    "evening": {
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


def get_all_user_registered_stock_ids(conn) -> dict[str, set[str]]:
    """全ユーザーのポートフォリオとウォッチリストにある銘柄IDを一括取得"""
    result: dict[str, set[str]] = {}

    with conn.cursor() as cur:
        # ポートフォリオの銘柄を一括取得
        cur.execute('SELECT "userId", "stockId" FROM "PortfolioStock"')
        for row in cur.fetchall():
            user_id, stock_id = row[0], row[1]
            if user_id not in result:
                result[user_id] = set()
            result[user_id].add(stock_id)

        # ウォッチリストの銘柄を一括取得
        cur.execute('SELECT "userId", "stockId" FROM "WatchlistStock"')
        for row in cur.fetchall():
            user_id, stock_id = row[0], row[1]
            if user_id not in result:
                result[user_id] = set()
            result[user_id].add(stock_id)

    return result


def get_stocks_with_prices(conn) -> list[dict]:
    """DBから株価データを取得（スコアリング用の指標を含む）"""
    with conn.cursor() as cur:
        cur.execute('''
            SELECT
                id,
                "tickerCode",
                name,
                sector,
                "latestPrice",
                "latestVolume",
                "weekChangeRate",
                "marketCap",
                "volatility",
                "volumeRatio",
                "dividendYield",
                "isProfitable",
                "profitTrend"
            FROM "Stock"
            WHERE "priceUpdatedAt" IS NOT NULL
              AND "latestPrice" IS NOT NULL
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
            "marketCap": float(row[7]) if row[7] else 0,
            "volatility": float(row[8]) if row[8] else None,
            "volumeRatio": float(row[9]) if row[9] else None,
            "dividendYield": float(row[10]) if row[10] else 0,
            "isProfitable": row[11],
            "profitTrend": row[12],
        }
        for row in rows
    ]

    print(f"Found {len(stocks)} stocks with price data")
    return stocks


def normalize_values(stocks: list[dict], key: str, reverse: bool = False) -> dict[str, float]:
    """指標を0-100に正規化する"""
    values = [(s["id"], s.get(key)) for s in stocks if s.get(key) is not None]
    if not values:
        return {}

    vals = [v for _, v in values]
    min_val, max_val = min(vals), max(vals)

    if max_val == min_val:
        return {stock_id: 50.0 for stock_id, _ in values}

    normalized = {}
    for stock_id, val in values:
        score = (val - min_val) / (max_val - min_val) * 100
        if reverse:
            score = 100 - score
        normalized[stock_id] = score

    return normalized


def calculate_stock_scores(
    stocks: list[dict],
    period: str | None,
    risk: str | None
) -> list[dict]:
    """投資スタイルに基づいてスコアを計算"""
    # デフォルトはバランス型
    weights = SCORE_WEIGHTS.get(
        (period or "medium", risk or "medium"),
        SCORE_WEIGHTS[("medium", "medium")]
    )

    # 各指標を正規化
    # volatilityは低リスク志向の場合は低い方が良いので反転
    is_low_risk = risk == "low" or (risk == "medium" and period == "long")
    normalized = {
        "weekChangeRate": normalize_values(stocks, "weekChangeRate"),
        "volumeRatio": normalize_values(stocks, "volumeRatio"),
        "volatility": normalize_values(stocks, "volatility", reverse=is_low_risk),
        "marketCap": normalize_values(stocks, "marketCap"),
        "dividendYield": normalize_values(stocks, "dividendYield"),
    }

    # 赤字 AND 高ボラ銘柄へのペナルティ
    max_vol = CONFIG["MAX_VOLATILITY"]
    penalty = RISK_PENALTY.get(risk or "medium", -15)
    penalty_count = 0
    excluded_count = 0
    bonus_count = 0

    # 収益性ボーナスの設定
    profit_bonus = PROFITABILITY_BONUS.get(risk or "medium", PROFITABILITY_BONUS["medium"])

    # スコア計算
    scored_stocks = []
    for stock in stocks:
        stock_id = stock["id"]
        total_score = 0.0
        score_breakdown = {}

        for key, weight in weights.items():
            val = normalized.get(key, {}).get(stock_id)
            if val is not None:
                component_score = val * (weight / 100)
                total_score += component_score
                score_breakdown[key] = round(component_score, 1)
            else:
                # 値がない場合は中間値を使用
                component_score = 50 * (weight / 100)
                total_score += component_score
                score_breakdown[key] = round(component_score, 1)

        # 異常な急騰（週間+50%超）は無条件で除外
        # 例: 地盤ネットHD (6072) - 週間+214%
        week_change = stock.get("weekChangeRate")
        if week_change is not None and week_change > 50:
            excluded_count += 1
            continue

        # 赤字 AND 高ボラティリティ AND 急騰の場合も除外（投機的すぎる）
        # 例: 窪田製薬 (4596) - 赤字、ボラ60%、週間+52%
        is_speculative_stock = (
            stock.get("isProfitable") is False
            and stock.get("volatility") is not None
            and stock["volatility"] > max_vol
            and week_change is not None
            and week_change > 30  # 週間+30%超
        )
        if is_speculative_stock:
            # スキップ（scored_stocksに追加しない）
            excluded_count += 1
            continue

        # 赤字 AND 高ボラティリティの場合はペナルティを適用
        is_high_risk_stock = (
            stock.get("isProfitable") is False
            and stock.get("volatility") is not None
            and stock["volatility"] > max_vol
        )
        if is_high_risk_stock and penalty != 0:
            total_score += penalty
            score_breakdown["riskPenalty"] = penalty
            penalty_count += 1

        # 黒字・増益銘柄へのボーナス（リスクとリターンのバランス改善）
        if stock.get("isProfitable") is True:
            if stock.get("profitTrend") == "increasing":
                # 黒字+増益: 最大ボーナス
                bonus = profit_bonus["increasing"]
                total_score += bonus
                score_breakdown["profitBonus"] = bonus
            else:
                # 黒字のみ: 基本ボーナス
                bonus = profit_bonus["profitable"]
                total_score += bonus
                score_breakdown["profitBonus"] = bonus
            bonus_count += 1

        scored_stocks.append({
            **stock,
            "score": round(total_score, 2),
            "scoreBreakdown": score_breakdown,
        })

    if excluded_count > 0:
        print(f"  Excluded {excluded_count} speculative stocks (weekChange>50% OR unprofitable+highVol+surge)")
    if penalty_count > 0:
        print(f"  Applied risk penalty ({penalty}) to {penalty_count} stocks (unprofitable AND volatility>{max_vol}%)")
    if bonus_count > 0:
        print(f"  Applied profitability bonus to {bonus_count} stocks")

    # スコア順にソート
    scored_stocks.sort(key=lambda x: x["score"], reverse=True)
    return scored_stocks


def apply_sector_diversification(stocks: list[dict]) -> list[dict]:
    """セクター分散を適用（各セクターから最大N銘柄）"""
    sector_counts: dict[str, int] = {}
    diversified = []

    for stock in stocks:
        sector = stock["sector"] or "その他"
        count = sector_counts.get(sector, 0)

        if count < CONFIG["MAX_PER_SECTOR"]:
            diversified.append(stock)
            sector_counts[sector] = count + 1

    return diversified


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
    prompts = SESSION_PROMPTS.get(session, SESSION_PROMPTS["evening"])

    period_label = PERIOD_LABELS.get(user["investmentPeriod"] or "", "不明")
    risk_label = RISK_LABELS.get(user["riskTolerance"] or "", "不明")
    budget_label = f"{user['investmentBudget']:,}円" if user["investmentBudget"] else "未設定"

    # 銘柄リスト（最大30件）
    stock_list = stocks[:CONFIG["MAX_STOCKS_FOR_AI"]]
    stock_summaries = []
    for s in stock_list:
        summary = (
            f"- {s['name']}（{s['tickerCode']}）: 株価{s['latestPrice']:,.0f}円, "
            f"1週間{'+' if s['weekChangeRate'] >= 0 else ''}{s['weekChangeRate']}%, "
            f"{s['sector'] or '不明'}"
        )
        extras = []
        if s.get("dividendYield") and s["dividendYield"] > 0:
            extras.append(f"配当{s['dividendYield']:.1f}%")
        if s.get("isProfitable") is True:
            if s.get("profitTrend") == "increasing":
                extras.append("黒字+増益")
            else:
                extras.append("黒字")
        elif s.get("isProfitable") is False:
            extras.append("赤字")
        if s.get("volatility") is not None:
            extras.append(f"変動率{s['volatility']:.0f}%")
        if extras:
            summary += f" ({', '.join(extras)})"
        stock_summaries.append(summary)

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
- ボラティリティが高い銘柄（変動率30%以上）は、リターンが期待できても損失リスクも大きいことを考慮してください
- 赤字企業よりも黒字・増益企業を優先してください
- 配当がある銘柄は中長期投資のユーザーに適しています

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
            temperature=0.5,
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
    # フロントエンドと同じ日付計算: JSTの今日00:00をUTCに変換
    jst = ZoneInfo("Asia/Tokyo")
    today_jst = datetime.now(jst).replace(hour=0, minute=0, second=0, microsecond=0)
    today = today_jst.astimezone(timezone.utc)

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
    session = os.environ.get("SESSION", "evening")

    print("=" * 60)
    print("User Daily Recommendation Generation (AI) - Python")
    print("=" * 60)
    print(f"Time: {datetime.now().isoformat()}")
    print(f"Session: {session}")
    print(f"Config:")
    print(f"  - MAX_PER_SECTOR: {CONFIG['MAX_PER_SECTOR']}")
    print(f"  - MAX_STOCKS_FOR_AI: {CONFIG['MAX_STOCKS_FOR_AI']}")
    print(f"  - MAX_VOLATILITY: {CONFIG['MAX_VOLATILITY']}% (threshold for risk penalty)")
    print(f"  - RISK_PENALTY: {RISK_PENALTY}")
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

        # 全ユーザーの登録済み銘柄を一括取得
        all_registered = get_all_user_registered_stock_ids(conn)
        print(f"Loaded registered stocks for {len(all_registered)} users")

        success_count = 0
        error_count = 0

        for user in users:
            period = user["investmentPeriod"]
            risk = user["riskTolerance"]
            print(f"\n--- User: {user['userId']} (budget: {user['investmentBudget']}, "
                  f"period: {period}, risk: {risk}) ---")

            # 1. 予算でフィルタ
            filtered = filter_stocks_by_budget(all_stocks, user["investmentBudget"])
            print(f"  Stocks after budget filter: {len(filtered)}/{len(all_stocks)}")

            if not filtered:
                print("  No stocks available. Skipping.")
                error_count += 1
                continue

            # 2. 投資スタイルに基づいてスコア計算（赤字 AND 高ボラにはペナルティ適用）
            scored = calculate_stock_scores(filtered, period, risk)
            print(f"  Top 3 scores: {[(s['tickerCode'], s['score']) for s in scored[:3]]}")

            # 3. セクター分散を適用
            diversified = apply_sector_diversification(scored)
            print(f"  After sector diversification: {len(diversified)} stocks")

            # 4. ポートフォリオ・ウォッチリストの銘柄を除外（3件以下なら除外しない）
            registered_ids = all_registered.get(user["userId"], set())
            if registered_ids:
                candidates = [s for s in diversified if s["id"] not in registered_ids]
                if len(candidates) > 5:
                    diversified = candidates
                    print(f"  After excluding registered: {len(diversified)} stocks (excluded {len(registered_ids)})")
                else:
                    print(f"  Keeping registered stocks (would be {len(candidates)} after exclusion)")

            # AI生成
            recommendations = generate_recommendations_for_user(
                openai_client, session, user, diversified
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
