#!/usr/bin/env python3
"""
ポートフォリオ総評分析を生成するスクリプト

ポートフォリオ + ウォッチリスト >= 3銘柄のユーザーに対して、
全体の分析（セクター分散度、ボラティリティなど）を生成します。

実行タイミング: 8:00 JST、15:30 JST
"""

import json
import os
import sys
from datetime import datetime

import psycopg2
import psycopg2.extras
import yfinance as yf
from openai import OpenAI


# 環境変数
TIME_CONTEXT = os.environ.get("TIME_CONTEXT", "morning")


def get_database_url() -> str:
    """データベースURLを取得"""
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("Error: DATABASE_URL environment variable not set")
        sys.exit(1)
    return url


def should_run() -> bool:
    """実行すべき時間帯かどうかを判定（8:00または15:30のみ）"""
    # TIME_CONTEXTで判定
    # morning = 8:00, close = 15:30
    return TIME_CONTEXT in ("morning", "close")


def fetch_eligible_users(conn) -> list[dict]:
    """対象ユーザーを取得（ポートフォリオ+ウォッチリスト >= 3銘柄）"""
    with conn.cursor() as cur:
        cur.execute('''
            SELECT
                u.id,
                (SELECT COUNT(*) FROM "PortfolioStock" ps WHERE ps."userId" = u.id) as portfolio_count,
                (SELECT COUNT(*) FROM "WatchlistStock" ws WHERE ws."userId" = u.id) as watchlist_count
            FROM "User" u
            WHERE
                (SELECT COUNT(*) FROM "PortfolioStock" ps WHERE ps."userId" = u.id) +
                (SELECT COUNT(*) FROM "WatchlistStock" ws WHERE ws."userId" = u.id) >= 3
        ''')
        rows = cur.fetchall()
        return [
            {
                "userId": row[0],
                "portfolioCount": row[1],
                "watchlistCount": row[2],
            }
            for row in rows
        ]


def fetch_user_stocks(conn, user_id: str) -> tuple[list[dict], list[dict]]:
    """ユーザーのポートフォリオとウォッチリストを取得"""
    with conn.cursor() as cur:
        # ポートフォリオ
        cur.execute('''
            SELECT
                ps."stockId",
                s."tickerCode",
                s.name,
                s.sector,
                s.volatility
            FROM "PortfolioStock" ps
            JOIN "Stock" s ON ps."stockId" = s.id
            WHERE ps."userId" = %s
        ''', (user_id,))
        portfolio_rows = cur.fetchall()

        portfolio_stocks = []
        for row in portfolio_rows:
            stock_id = row[0]

            # 取引履歴を取得
            cur.execute('''
                SELECT type, quantity, price
                FROM "Transaction"
                WHERE "stockId" = %s AND "userId" = %s
                ORDER BY "transactionDate" ASC
            ''', (stock_id, user_id))
            transactions = cur.fetchall()

            # 保有数量と平均取得単価を計算
            total_quantity = 0
            total_cost = 0.0
            for tx in transactions:
                tx_type, quantity, price = tx
                price = float(price) if price else 0
                if tx_type == "buy":
                    total_cost += price * quantity
                    total_quantity += quantity
                elif tx_type == "sell" and total_quantity > 0:
                    avg_price = total_cost / total_quantity
                    total_cost -= avg_price * quantity
                    total_quantity -= quantity

            if total_quantity > 0:
                avg_price = total_cost / total_quantity
                portfolio_stocks.append({
                    "stockId": stock_id,
                    "tickerCode": row[1],
                    "name": row[2],
                    "sector": row[3],
                    "volatility": float(row[4]) if row[4] else None,
                    "quantity": total_quantity,
                    "averagePrice": avg_price,
                })

        # ウォッチリスト
        cur.execute('''
            SELECT
                ws."stockId",
                s."tickerCode",
                s.name,
                s.sector
            FROM "WatchlistStock" ws
            JOIN "Stock" s ON ws."stockId" = s.id
            WHERE ws."userId" = %s
        ''', (user_id,))
        watchlist_rows = cur.fetchall()

        watchlist_stocks = [
            {
                "stockId": row[0],
                "tickerCode": row[1],
                "name": row[2],
                "sector": row[3],
            }
            for row in watchlist_rows
        ]

        return portfolio_stocks, watchlist_stocks


def fetch_current_prices(ticker_codes: list[str]) -> dict[str, float]:
    """現在の株価を取得"""
    prices = {}
    for ticker in ticker_codes:
        try:
            stock = yf.Ticker(ticker)
            info = stock.info
            price = info.get("currentPrice") or info.get("regularMarketPrice")
            if price:
                prices[ticker] = float(price)
        except Exception as e:
            print(f"Warning: Failed to fetch price for {ticker}: {e}")
    return prices


def calculate_metrics(
    portfolio_stocks: list[dict],
    prices: dict[str, float]
) -> dict:
    """指標を計算"""
    # 評価額を計算
    for stock in portfolio_stocks:
        current_price = prices.get(stock["tickerCode"], 0)
        stock["currentPrice"] = current_price
        stock["value"] = current_price * stock["quantity"]
        stock["cost"] = stock["averagePrice"] * stock["quantity"]

    total_value = sum(s["value"] for s in portfolio_stocks)
    total_cost = sum(s["cost"] for s in portfolio_stocks)
    unrealized_gain = total_value - total_cost
    unrealized_gain_percent = (unrealized_gain / total_cost * 100) if total_cost > 0 else 0

    # セクター分散度
    sector_map = {}
    for stock in portfolio_stocks:
        sector = stock["sector"] or "その他"
        if sector not in sector_map:
            sector_map[sector] = {"count": 0, "value": 0}
        sector_map[sector]["count"] += 1
        sector_map[sector]["value"] += stock["value"]

    sector_breakdown = []
    for sector, data in sector_map.items():
        percentage = (data["value"] / total_value * 100) if total_value > 0 else 0
        sector_breakdown.append({
            "sector": sector,
            "count": data["count"],
            "value": data["value"],
            "percentage": percentage,
        })
    sector_breakdown.sort(key=lambda x: x["percentage"], reverse=True)

    max_concentration = sector_breakdown[0]["percentage"] if sector_breakdown else 0

    # ボラティリティ（加重平均）
    weighted_volatility = 0
    has_volatility = False
    for stock in portfolio_stocks:
        if stock["volatility"] is not None and total_value > 0:
            weight = stock["value"] / total_value
            weighted_volatility += stock["volatility"] * weight
            has_volatility = True

    portfolio_volatility = weighted_volatility if has_volatility else None

    return {
        "totalValue": total_value,
        "totalCost": total_cost,
        "unrealizedGain": unrealized_gain,
        "unrealizedGainPercent": unrealized_gain_percent,
        "sectorBreakdown": sector_breakdown,
        "sectorConcentration": max_concentration,
        "sectorCount": len(sector_breakdown),
        "portfolioVolatility": portfolio_volatility,
    }


def generate_analysis_with_ai(
    portfolio_stocks: list[dict],
    watchlist_stocks: list[dict],
    metrics: dict,
) -> dict:
    """OpenAI APIで総評分析を生成"""
    client = OpenAI()

    sector_text = "\n".join(
        f"{s['sector']}: {s['percentage']:.1f}%（{s['count']}銘柄）"
        for s in metrics["sectorBreakdown"]
    )

    portfolio_text = "\n".join(
        f"- {s['name']}（{s['tickerCode']}）: {s['sector'] or 'その他'}、"
        f"評価額 ¥{int(s['value']):,}"
        for s in portfolio_stocks
    )

    watchlist_text = "\n".join(
        f"- {s['name']}（{s['tickerCode']}）: {s['sector'] or 'その他'}"
        for s in watchlist_stocks
    ) if watchlist_stocks else "なし"

    time_intro = "朝の分析です。" if TIME_CONTEXT == "morning" else "取引終了後のまとめです。"

    prompt = f"""あなたは投資初心者向けのAIコーチです。
{time_intro}以下のポートフォリオ情報を分析し、総評と指標別の解説を提供してください。

【ポートフォリオ情報】
- 保有銘柄数: {len(portfolio_stocks)}銘柄
- ウォッチリスト銘柄数: {len(watchlist_stocks)}銘柄
- 総資産額: ¥{int(metrics['totalValue']):,}
- 総投資額: ¥{int(metrics['totalCost']):,}
- 含み損益: ¥{int(metrics['unrealizedGain']):,}（{'+' if metrics['unrealizedGainPercent'] >= 0 else ''}{metrics['unrealizedGainPercent']:.1f}%）

【保有銘柄】
{portfolio_text}

【セクター構成】
{sector_text}

【ボラティリティ】
- ポートフォリオ全体: {f"{metrics['portfolioVolatility']:.1f}%" if metrics['portfolioVolatility'] else "データなし"}

【ウォッチリスト銘柄】
{watchlist_text}

【回答形式】
以下のJSON形式で回答してください。

{{
  "overallSummary": "全体の総評を初心者向けに2-3文で。専門用語を使う場合は括弧で解説を添える",
  "overallStatus": "好調/順調/様子見/注意/要確認のいずれか",
  "overallStatusType": "excellent/good/neutral/caution/warningのいずれか",
  "metricsAnalysis": {{
    "sectorDiversification": {{
      "value": "最も比率の高いセクターと比率",
      "explanation": "セクター分散の意味と重要性を1-2文",
      "evaluation": "評価（優秀/適正/注意など）",
      "evaluationType": "good/neutral/warning",
      "action": "具体的な改善アクション"
    }},
    "profitLoss": {{
      "value": "含み損益額と率",
      "explanation": "損益状況の解説を1-2文",
      "evaluation": "評価",
      "evaluationType": "good/neutral/warning",
      "action": "アドバイス"
    }},
    "volatility": {{
      "value": "ボラティリティ値",
      "explanation": "ボラティリティの意味と評価を1-2文",
      "evaluation": "評価",
      "evaluationType": "good/neutral/warning",
      "action": "アドバイス"
    }}
  }},
  "actionSuggestions": [
    {{
      "priority": 1,
      "title": "アクションタイトル",
      "description": "説明",
      "type": "diversify/rebalance/hold/take_profit/cut_loss"
    }}
  ],
  "watchlistSimulation": {json.dumps([{"stockId": s["stockId"], "stockName": s["name"], "tickerCode": s["tickerCode"], "sector": s["sector"] or "その他"} for s in watchlist_stocks]) if watchlist_stocks else "null"}
}}

【表現の指針】
- 専門用語には必ず解説を添える
- 数値の基準を具体的に説明する
- 行動につながる具体的なアドバイスを含める
- ネガティブな内容も前向きな表現で伝える"""

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": "あなたは投資初心者向けのAIコーチです。JSONのみで回答してください。",
            },
            {"role": "user", "content": prompt},
        ],
        temperature=0.7,
        response_format={"type": "json_object"},
    )

    content = response.choices[0].message.content
    return json.loads(content)


def save_analysis(conn, user_id: str, metrics: dict, ai_result: dict):
    """分析結果をDBに保存"""
    now = datetime.utcnow()

    with conn.cursor() as cur:
        # UPSERT
        cur.execute('''
            INSERT INTO "PortfolioOverallAnalysis" (
                id, "userId", "analyzedAt",
                "sectorConcentration", "sectorCount",
                "totalValue", "totalCost", "unrealizedGain", "unrealizedGainPercent",
                "portfolioVolatility",
                "overallSummary", "overallStatus", "overallStatusType",
                "metricsAnalysis", "actionSuggestions", "watchlistSimulation",
                "createdAt", "updatedAt"
            ) VALUES (
                gen_random_uuid(), %s, %s,
                %s, %s,
                %s, %s, %s, %s,
                %s,
                %s, %s, %s,
                %s, %s, %s,
                %s, %s
            )
            ON CONFLICT ("userId") DO UPDATE SET
                "analyzedAt" = EXCLUDED."analyzedAt",
                "sectorConcentration" = EXCLUDED."sectorConcentration",
                "sectorCount" = EXCLUDED."sectorCount",
                "totalValue" = EXCLUDED."totalValue",
                "totalCost" = EXCLUDED."totalCost",
                "unrealizedGain" = EXCLUDED."unrealizedGain",
                "unrealizedGainPercent" = EXCLUDED."unrealizedGainPercent",
                "portfolioVolatility" = EXCLUDED."portfolioVolatility",
                "overallSummary" = EXCLUDED."overallSummary",
                "overallStatus" = EXCLUDED."overallStatus",
                "overallStatusType" = EXCLUDED."overallStatusType",
                "metricsAnalysis" = EXCLUDED."metricsAnalysis",
                "actionSuggestions" = EXCLUDED."actionSuggestions",
                "watchlistSimulation" = EXCLUDED."watchlistSimulation",
                "updatedAt" = EXCLUDED."updatedAt"
        ''', (
            user_id, now,
            metrics["sectorConcentration"], metrics["sectorCount"],
            metrics["totalValue"], metrics["totalCost"],
            metrics["unrealizedGain"], metrics["unrealizedGainPercent"],
            metrics["portfolioVolatility"],
            ai_result["overallSummary"],
            ai_result["overallStatus"],
            ai_result["overallStatusType"],
            json.dumps(ai_result["metricsAnalysis"]),
            json.dumps(ai_result["actionSuggestions"]),
            json.dumps(ai_result.get("watchlistSimulation")),
            now, now,
        ))

    conn.commit()


def main():
    print("=" * 60)
    print("ポートフォリオ総評分析の生成を開始")
    print(f"TIME_CONTEXT: {TIME_CONTEXT}")
    print("=" * 60)

    # 実行時間帯チェック
    if not should_run():
        print(f"スキップ: TIME_CONTEXT={TIME_CONTEXT}は実行対象外です")
        print("実行対象: morning (8:00), close (15:30)")
        return

    conn = psycopg2.connect(get_database_url())

    try:
        # 対象ユーザーを取得
        users = fetch_eligible_users(conn)
        print(f"\n対象ユーザー数: {len(users)}")

        if not users:
            print("対象ユーザーがいません")
            return

        success_count = 0
        error_count = 0

        for user in users:
            user_id = user["userId"]
            print(f"\n処理中: {user_id[:8]}... (P:{user['portfolioCount']}, W:{user['watchlistCount']})")

            try:
                # ユーザーの銘柄を取得
                portfolio_stocks, watchlist_stocks = fetch_user_stocks(conn, user_id)

                if not portfolio_stocks:
                    print("  -> 保有銘柄なし、スキップ")
                    continue

                # 株価を取得
                ticker_codes = [s["tickerCode"] for s in portfolio_stocks]
                prices = fetch_current_prices(ticker_codes)

                # 指標を計算
                metrics = calculate_metrics(portfolio_stocks, prices)

                # AI分析を生成
                ai_result = generate_analysis_with_ai(
                    portfolio_stocks, watchlist_stocks, metrics
                )

                # 保存
                save_analysis(conn, user_id, metrics, ai_result)

                print(f"  -> 完了: {ai_result['overallStatus']}")
                success_count += 1

            except Exception as e:
                print(f"  -> エラー: {e}")
                error_count += 1

        print("\n" + "=" * 60)
        print(f"完了: 成功={success_count}, エラー={error_count}")
        print("=" * 60)

    finally:
        conn.close()


if __name__ == "__main__":
    main()
