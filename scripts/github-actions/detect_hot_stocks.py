#!/usr/bin/env python3
"""
チャンス銘柄検出スクリプト

ルールベースのスクリーニング + AI分析のハイブリッドアプローチで
短期的なチャンス銘柄を検出します。

実行: python scripts/github-actions/detect_hot_stocks.py
"""

import os
import sys
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
import psycopg2
import psycopg2.extras
from openai import OpenAI

# 環境変数
DATABASE_URL = os.getenv("PRODUCTION_DATABASE_URL") or os.getenv("DATABASE_URL")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

# 検出パラメータ
MIN_SCORE = 50  # スコア閾値
MAX_HOT_STOCKS = 5  # 最大選出数
VALID_DAYS = 7  # 有効期限（日数）
MIN_CONFIDENCE = 0.6  # 最小信頼度

# スコアリング重み
WEIGHTS = {
    "price_jump": 30,      # 価格上昇
    "volume_increase": 25,  # 出来高増加
    "volatility": 20,       # ボラティリティ
    "momentum": 15,         # モメンタム
    "news_sentiment": 10,   # ニュースセンチメント
}


def connect_db():
    """データベース接続"""
    try:
        conn = psycopg2.connect(DATABASE_URL)
        print("✅ データベース接続成功")
        return conn
    except Exception as e:
        print(f"❌ データベース接続エラー: {e}")
        sys.exit(1)


def fetch_candidate_stocks(cur) -> List[Dict[str, Any]]:
    """
    候補銘柄を取得
    - 過去30日間の価格データがある銘柄
    - 初心者向けスコアが50以上
    """
    query = """
        SELECT DISTINCT ON (s.id)
            s.id,
            s."tickerCode" as ticker,
            s.name,
            s.sector,
            s."beginnerScore",
            s."currentPrice",
            sp.close as latest_close,
            sp.volume as latest_volume,
            sp.date as latest_date
        FROM "Stock" s
        LEFT JOIN "StockPrice" sp ON s.id = sp."stockId"
        WHERE s."beginnerScore" >= 50
        AND sp.date >= NOW() - INTERVAL '30 days'
        ORDER BY s.id, sp.date DESC
    """

    cur.execute(query)
    stocks = cur.fetchall()

    print(f"✅ 候補銘柄取得: {len(stocks)}銘柄")
    return [dict(row) for row in stocks]


def fetch_price_history(cur, stock_id: str, days: int = 30) -> List[Dict[str, Any]]:
    """株価履歴を取得"""
    query = """
        SELECT date, close, volume, high, low
        FROM "StockPrice"
        WHERE "stockId" = %s
        AND date >= NOW() - INTERVAL '%s days'
        ORDER BY date DESC
    """

    cur.execute(query, (stock_id, days))
    return [dict(row) for row in cur.fetchall()]


def calculate_price_jump_score(prices: List[Dict]) -> tuple[float, List[str]]:
    """
    価格上昇スコアを計算
    - 1週間で +10%以上: 高スコア
    - 1ヶ月で +20%以上: 高スコア
    """
    if len(prices) < 7:
        return 0.0, []

    latest = prices[0]["close"]
    week_ago = prices[6]["close"] if len(prices) > 6 else latest
    month_ago = prices[-1]["close"] if len(prices) >= 20 else week_ago

    week_change = ((latest - week_ago) / week_ago) * 100
    month_change = ((latest - month_ago) / month_ago) * 100

    score = 0.0
    reasons = []

    if week_change >= 10:
        score += 0.8
        reasons.append(f"先週から+{week_change:.1f}%の上昇")
    elif week_change >= 5:
        score += 0.5
        reasons.append(f"先週から+{week_change:.1f}%の上昇")

    if month_change >= 20:
        score += 0.2
        reasons.append(f"先月から+{month_change:.1f}%の上昇")

    return min(score, 1.0), reasons


def calculate_volume_score(prices: List[Dict]) -> tuple[float, List[str]]:
    """
    出来高増加スコアを計算
    - 直近3日の平均出来高が過去20日平均の1.5倍以上
    """
    if len(prices) < 20:
        return 0.0, []

    recent_volumes = [p["volume"] for p in prices[:3] if p["volume"]]
    past_volumes = [p["volume"] for p in prices[3:20] if p["volume"]]

    if not recent_volumes or not past_volumes:
        return 0.0, []

    recent_avg = sum(recent_volumes) / len(recent_volumes)
    past_avg = sum(past_volumes) / len(past_volumes)

    ratio = recent_avg / past_avg if past_avg > 0 else 0
    reasons = []

    if ratio >= 2.0:
        score = 1.0
        reasons.append(f"出来高が平均の{ratio:.1f}倍に急増")
    elif ratio >= 1.5:
        score = 0.7
        reasons.append(f"出来高が平均の{ratio:.1f}倍に増加")
    else:
        score = 0.0

    return score, reasons


def calculate_volatility_score(prices: List[Dict]) -> tuple[float, List[str]]:
    """
    ボラティリティスコアを計算
    - 適度なボラティリティ（5-15%）を評価
    """
    if len(prices) < 20:
        return 0.0, []

    daily_changes = []
    for i in range(len(prices) - 1):
        change = abs(prices[i]["close"] - prices[i + 1]["close"]) / prices[i + 1]["close"]
        daily_changes.append(change)

    avg_volatility = (sum(daily_changes) / len(daily_changes)) * 100
    reasons = []

    if 5 <= avg_volatility <= 15:
        score = 0.8
        reasons.append(f"適度なボラティリティ({avg_volatility:.1f}%)")
    elif avg_volatility > 15:
        score = 0.3
        reasons.append(f"高ボラティリティ({avg_volatility:.1f}%)")
    else:
        score = 0.2

    return score, reasons


def calculate_momentum_score(prices: List[Dict]) -> tuple[float, List[str]]:
    """
    モメンタムスコアを計算
    - 連続上昇日数を評価
    """
    if len(prices) < 5:
        return 0.0, []

    consecutive_ups = 0
    for i in range(len(prices) - 1):
        if prices[i]["close"] > prices[i + 1]["close"]:
            consecutive_ups += 1
        else:
            break

    reasons = []
    if consecutive_ups >= 3:
        score = 0.8
        reasons.append(f"{consecutive_ups}日連続上昇")
    elif consecutive_ups >= 2:
        score = 0.5
        reasons.append(f"{consecutive_ups}日連続上昇")
    else:
        score = 0.0

    return score, reasons


def calculate_hot_score(stock: Dict, prices: List[Dict]) -> Dict[str, Any]:
    """
    ホットスコアを総合的に計算
    """
    price_score, price_reasons = calculate_price_jump_score(prices)
    volume_score, volume_reasons = calculate_volume_score(prices)
    volatility_score, volatility_reasons = calculate_volatility_score(prices)
    momentum_score, momentum_reasons = calculate_momentum_score(prices)

    # 重み付けスコア計算
    total_score = (
        price_score * WEIGHTS["price_jump"] +
        volume_score * WEIGHTS["volume_increase"] +
        volatility_score * WEIGHTS["volatility"] +
        momentum_score * WEIGHTS["momentum"]
    )

    # 理由とリスクをまとめる
    reasons = price_reasons + volume_reasons + volatility_reasons + momentum_reasons

    risks = []
    if volatility_score < 0.5:
        risks.append("ボラティリティが低く、大きな値動きは期待薄")
    if volatility_score > 0.8:
        risks.append("ボラティリティが高く、短期的に大きく変動する可能性")
    if not momentum_reasons:
        risks.append("上昇トレンドが弱い")

    return {
        "stock_id": stock["id"],
        "ticker": stock["ticker"],
        "name": stock["name"],
        "hot_score": int(total_score),
        "reasons": reasons,
        "risks": risks,
        "raw_scores": {
            "price": price_score,
            "volume": volume_score,
            "volatility": volatility_score,
            "momentum": momentum_score,
        }
    }


def enhance_with_ai(candidates: List[Dict]) -> List[Dict]:
    """
    AI分析で候補を強化
    """
    if not OPENAI_API_KEY:
        print("⚠️  OPENAI_API_KEYが設定されていません。AI分析をスキップします。")
        return candidates

    client = OpenAI(api_key=OPENAI_API_KEY)

    enhanced = []
    for candidate in candidates[:10]:  # 上位10件のみAI分析
        try:
            prompt = f"""
あなたは投資初心者向けのアドバイザーです。以下の銘柄が短期的なチャンス銘柄として適切か分析してください。

銘柄情報:
- ティッカー: {candidate['ticker']}
- 名前: {candidate['name']}
- スコア: {candidate['hot_score']}/100
- 理由: {', '.join(candidate['reasons'])}
- リスク: {', '.join(candidate['risks'])}

以下の形式でJSON形式で回答してください:
{{
  "confidence": 0.0-1.0,
  "recommendation": "初心者向けの簡潔なコメント（50文字以内）",
  "recommended_budget_percent": 10-20,
  "additional_reasons": ["追加の理由1", "追加の理由2"],
  "additional_risks": ["追加のリスク1", "追加のリスク2"]
}}
"""

            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are a financial advisor for beginner investors in Japan."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3,
                response_format={"type": "json_object"}
            )

            ai_result = eval(response.choices[0].message.content)

            # AI分析結果をマージ
            candidate["confidence"] = ai_result["confidence"]
            candidate["recommendation"] = ai_result["recommendation"]
            candidate["recommended_budget_percent"] = ai_result["recommended_budget_percent"]
            candidate["reasons"].extend(ai_result.get("additional_reasons", []))
            candidate["risks"].extend(ai_result.get("additional_risks", []))

            enhanced.append(candidate)
            print(f"  ✅ AI分析完了: {candidate['ticker']} (信頼度: {candidate['confidence']})")

        except Exception as e:
            print(f"  ⚠️  AI分析エラー ({candidate['ticker']}): {e}")
            # AI分析失敗時はデフォルト値を設定
            candidate["confidence"] = 0.6
            candidate["recommendation"] = "短期的なチャンスが見込まれる銘柄です"
            candidate["recommended_budget_percent"] = 15
            enhanced.append(candidate)

    return enhanced


def save_hot_stocks(cur, hot_stocks: List[Dict]):
    """
    チャンス銘柄をDBに保存
    """
    valid_until = datetime.now() + timedelta(days=VALID_DAYS)
    analyzed_at = datetime.now()

    values = []
    for stock in hot_stocks:
        values.append((
            stock["stock_id"],
            stock["hot_score"],
            stock["reasons"],
            stock["risks"],
            stock["recommended_budget_percent"],
            stock["recommendation"],
            stock["confidence"],
            valid_until,
            analyzed_at,
        ))

    # 既存の有効なレコードを削除
    cur.execute("""
        DELETE FROM "HotStock"
        WHERE "validUntil" >= NOW()
    """)

    # 一括INSERT
    psycopg2.extras.execute_values(
        cur,
        """
        INSERT INTO "HotStock" (
            "stockId", "hotScore", reasons, risks,
            "recommendedBudgetPercent", recommendation, confidence,
            "validUntil", "analyzedAt", "createdAt", "updatedAt"
        ) VALUES %s
        """,
        [(v[0], v[1], v[2], v[3], v[4], v[5], v[6], v[7], v[8], v[8], v[8]) for v in values],
    )

    print(f"✅ チャンス銘柄を保存: {len(hot_stocks)}銘柄")


def main():
    """メイン処理"""
    print("=" * 60)
    print("チャンス銘柄検出スクリプト開始")
    print("=" * 60)

    conn = connect_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    try:
        # 1. 候補銘柄を取得
        print("\n[1/5] 候補銘柄を取得中...")
        stocks = fetch_candidate_stocks(cur)

        if not stocks:
            print("⚠️  候補銘柄が見つかりませんでした")
            return

        # 2. スコアリング
        print("\n[2/5] スコアリング中...")
        scored_stocks = []
        for stock in stocks:
            prices = fetch_price_history(cur, stock["id"])
            if len(prices) >= 20:  # 最低20日分のデータが必要
                score_result = calculate_hot_score(stock, prices)
                if score_result["hot_score"] >= MIN_SCORE:
                    scored_stocks.append(score_result)

        print(f"  → スコア{MIN_SCORE}以上: {len(scored_stocks)}銘柄")

        if not scored_stocks:
            print("⚠️  基準を満たす銘柄が見つかりませんでした")
            return

        # 3. スコア順にソート
        print("\n[3/5] ランキング作成中...")
        scored_stocks.sort(key=lambda x: x["hot_score"], reverse=True)

        # 4. AI分析
        print("\n[4/5] AI分析中...")
        enhanced_stocks = enhance_with_ai(scored_stocks[:10])

        # 信頼度でフィルタリング
        filtered = [s for s in enhanced_stocks if s["confidence"] >= MIN_CONFIDENCE]
        print(f"  → 信頼度{MIN_CONFIDENCE}以上: {len(filtered)}銘柄")

        if not filtered:
            print("⚠️  信頼度基準を満たす銘柄が見つかりませんでした")
            return

        # 5. 上位N件を保存
        print("\n[5/5] DB保存中...")
        top_stocks = filtered[:MAX_HOT_STOCKS]
        save_hot_stocks(cur, top_stocks)

        conn.commit()

        # 結果サマリー
        print("\n" + "=" * 60)
        print("✅ チャンス銘柄検出完了")
        print("=" * 60)
        for i, stock in enumerate(top_stocks, 1):
            print(f"\n{i}. {stock['ticker']} - {stock['name']}")
            print(f"   スコア: {stock['hot_score']}/100")
            print(f"   信頼度: {stock['confidence']}")
            print(f"   推奨予算: {stock['recommended_budget_percent']}%")
            print(f"   理由: {', '.join(stock['reasons'][:2])}")

    except Exception as e:
        print(f"\n❌ エラー: {e}")
        conn.rollback()
        sys.exit(1)
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
