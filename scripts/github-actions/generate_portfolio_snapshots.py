#!/usr/bin/env python3
"""
ポートフォリオスナップショットを記録するスクリプト

全ユーザーのポートフォリオ状態を日次で記録します。
取引時間終了後（15:30 JST以降）に実行を想定。
"""

import os
import sys
from datetime import datetime
from decimal import Decimal
from collections import defaultdict

import psycopg2
import psycopg2.extras

# scriptsディレクトリをパスに追加
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lib.date_utils import get_today_for_db


def get_database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("Error: DATABASE_URL environment variable not set")
        sys.exit(1)
    return url


def fetch_users_with_holdings(conn) -> list[str]:
    """保有銘柄があるユーザーIDを取得"""
    with conn.cursor() as cur:
        cur.execute('''
            SELECT DISTINCT t."userId"
            FROM "Transaction" t
            GROUP BY t."userId", t."stockId"
            HAVING SUM(CASE WHEN t.type = 'buy' THEN t.quantity ELSE -t.quantity END) > 0
        ''')
        return [row[0] for row in cur.fetchall()]


def fetch_user_holdings(conn, user_ids: list[str]) -> dict:
    """
    ユーザーごとの保有銘柄情報を一括取得
    N+1問題を避けるため、全ユーザーのデータを一括取得
    """
    if not user_ids:
        return {}

    with conn.cursor() as cur:
        # トランザクションから保有数と平均取得単価を計算
        cur.execute('''
            WITH holdings AS (
                SELECT
                    t."userId",
                    t."stockId",
                    SUM(CASE WHEN t.type = 'buy' THEN t.quantity ELSE -t.quantity END) AS quantity,
                    SUM(CASE WHEN t.type = 'buy' THEN t.quantity * t.price ELSE 0 END) AS total_buy_cost,
                    SUM(CASE WHEN t.type = 'buy' THEN t.quantity ELSE 0 END) AS total_buy_quantity
                FROM "Transaction" t
                WHERE t."userId" = ANY(%s)
                GROUP BY t."userId", t."stockId"
                HAVING SUM(CASE WHEN t.type = 'buy' THEN t.quantity ELSE -t.quantity END) > 0
            )
            SELECT
                h."userId",
                h."stockId",
                s.name,
                s."tickerCode",
                s.sector,
                s."latestPrice",
                h.quantity,
                CASE
                    WHEN h.total_buy_quantity > 0 THEN h.total_buy_cost / h.total_buy_quantity
                    ELSE 0
                END AS avg_price
            FROM holdings h
            JOIN "Stock" s ON h."stockId" = s.id
        ''', (user_ids,))

        # ユーザーごとにグループ化
        result = defaultdict(list)
        for row in cur.fetchall():
            user_id = row[0]
            result[user_id].append({
                "stockId": row[1],
                "name": row[2],
                "tickerCode": row[3],
                "sector": row[4] or "その他",
                "latestPrice": Decimal(str(row[5])) if row[5] else Decimal("0"),
                "quantity": row[6],
                "avgPrice": Decimal(str(row[7])) if row[7] else Decimal("0"),
            })

        return dict(result)


def calculate_snapshot(holdings: list[dict]) -> dict:
    """保有銘柄情報からスナップショットを計算"""
    total_value = Decimal("0")
    total_cost = Decimal("0")
    stock_breakdown = []
    sector_totals = defaultdict(Decimal)

    for h in holdings:
        current_value = h["latestPrice"] * h["quantity"]
        cost = h["avgPrice"] * h["quantity"]

        total_value += current_value
        total_cost += cost
        sector_totals[h["sector"]] += current_value

        stock_breakdown.append({
            "stockId": h["stockId"],
            "name": h["name"],
            "tickerCode": h["tickerCode"],
            "sector": h["sector"],
            "value": float(current_value),
            "cost": float(cost),
        })

    # 構成比率を計算
    if total_value > 0:
        for item in stock_breakdown:
            item["percent"] = round(float(Decimal(str(item["value"])) / total_value * 100), 2)

    # セクター別内訳
    sector_breakdown = []
    for sector, value in sector_totals.items():
        percent = round(float(value / total_value * 100), 2) if total_value > 0 else 0
        sector_breakdown.append({
            "sector": sector,
            "value": float(value),
            "percent": percent,
        })

    # 値でソート（降順）
    stock_breakdown.sort(key=lambda x: x["value"], reverse=True)
    sector_breakdown.sort(key=lambda x: x["value"], reverse=True)

    unrealized_gain = total_value - total_cost
    gain_percent = (unrealized_gain / total_cost * 100) if total_cost > 0 else Decimal("0")

    return {
        "totalValue": total_value,
        "totalCost": total_cost,
        "unrealizedGain": unrealized_gain,
        "unrealizedGainPercent": gain_percent,
        "stockCount": len(holdings),
        "stockBreakdown": stock_breakdown,
        "sectorBreakdown": sector_breakdown,
    }


def upsert_snapshots(conn, snapshots: list[dict], date: datetime):
    """スナップショットをバッチでUPSERT"""
    if not snapshots:
        return 0

    import json

    values = []
    for s in snapshots:
        values.append((
            s["userId"],
            date,
            float(s["totalValue"]),
            float(s["totalCost"]),
            float(s["unrealizedGain"]),
            float(s["unrealizedGainPercent"]),
            s["stockCount"],
            json.dumps(s["sectorBreakdown"], ensure_ascii=False),
            json.dumps(s["stockBreakdown"], ensure_ascii=False),
        ))

    with conn.cursor() as cur:
        psycopg2.extras.execute_values(
            cur,
            '''
            INSERT INTO "PortfolioSnapshot" (
                "id", "userId", "date", "totalValue", "totalCost",
                "unrealizedGain", "unrealizedGainPercent", "stockCount",
                "sectorBreakdown", "stockBreakdown", "createdAt"
            )
            VALUES %s
            ON CONFLICT ("userId", "date") DO UPDATE SET
                "totalValue" = EXCLUDED."totalValue",
                "totalCost" = EXCLUDED."totalCost",
                "unrealizedGain" = EXCLUDED."unrealizedGain",
                "unrealizedGainPercent" = EXCLUDED."unrealizedGainPercent",
                "stockCount" = EXCLUDED."stockCount",
                "sectorBreakdown" = EXCLUDED."sectorBreakdown",
                "stockBreakdown" = EXCLUDED."stockBreakdown"
            ''',
            values,
            template='''(
                gen_random_uuid()::text, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, NOW()
            )''',
            page_size=100
        )
        conn.commit()

    return len(values)


def main():
    print("=" * 60)
    print("Portfolio Snapshot Generation")
    print("=" * 60)
    print(f"Time: {datetime.now().isoformat()}")

    conn = psycopg2.connect(get_database_url())
    today = get_today_for_db()
    print(f"Snapshot date: {today.date()}")

    try:
        # 1. 保有銘柄があるユーザーを取得
        user_ids = fetch_users_with_holdings(conn)
        print(f"Found {len(user_ids)} users with holdings")

        if not user_ids:
            print("No users with holdings. Exiting.")
            return

        # 2. 全ユーザーの保有情報を一括取得
        all_holdings = fetch_user_holdings(conn, user_ids)
        print(f"Fetched holdings for {len(all_holdings)} users")

        # 3. 各ユーザーのスナップショットを計算
        snapshots = []
        for user_id, holdings in all_holdings.items():
            snapshot = calculate_snapshot(holdings)
            snapshot["userId"] = user_id
            snapshots.append(snapshot)
            print(f"  User {user_id[:8]}...: {snapshot['stockCount']} stocks, ¥{float(snapshot['totalValue']):,.0f}")

        # 4. バッチでUPSERT
        count = upsert_snapshots(conn, snapshots, today)

        print("=" * 60)
        print(f"SUCCESS: {count} snapshots saved")
        print("=" * 60)

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
