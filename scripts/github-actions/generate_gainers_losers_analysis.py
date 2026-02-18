#!/usr/bin/env python3
"""
日次上昇/下落ランキング生成スクリプト

場後に実行し、その日の上昇トップ5・下落トップ5の銘柄を抽出して
AIで原因分析を行い、DailyMarketMoverテーブルに保存する。

APIエンドポイントを銘柄ごとに呼び出すことで、分析ロジックはAPI側で一元管理する。
"""

import json
import os
import sys
from datetime import datetime, timezone, timedelta

import psycopg2
import requests


MOVERS_COUNT = 5  # 上昇/下落それぞれ5銘柄


def get_database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("Error: DATABASE_URL environment variable not set")
        sys.exit(1)
    return url


def get_app_url() -> str:
    url = os.environ.get("APP_URL")
    if not url:
        print("Error: APP_URL environment variable not set")
        sys.exit(1)
    return url


def get_cron_secret() -> str:
    secret = os.environ.get("CRON_SECRET")
    if not secret:
        print("Error: CRON_SECRET environment variable not set")
        sys.exit(1)
    return secret


def get_today_jst() -> datetime:
    """JST 00:00:00 をUTCに変換した日付を返す"""
    jst_offset = timedelta(hours=9)
    now_utc = datetime.now(timezone.utc)
    now_jst = now_utc + jst_offset
    today_jst_midnight = now_jst.replace(hour=0, minute=0, second=0, microsecond=0)
    return today_jst_midnight - jst_offset


def get_top_movers(conn) -> tuple[list[dict], list[dict]]:
    """上昇/下落トップ銘柄を取得"""
    with conn.cursor() as cur:
        # 上昇銘柄
        cur.execute('''
            SELECT
                id,
                "tickerCode",
                name,
                "dailyChangeRate"
            FROM "Stock"
            WHERE "dailyChangeRate" IS NOT NULL
              AND "latestVolume" >= 100000
            ORDER BY "dailyChangeRate" DESC
            LIMIT %s
        ''', (MOVERS_COUNT,))

        gainers = [
            {
                "id": row[0],
                "tickerCode": row[1],
                "name": row[2],
                "dailyChangeRate": float(row[3]) if row[3] else 0,
            }
            for row in cur.fetchall()
        ]

        # 下落銘柄
        cur.execute('''
            SELECT
                id,
                "tickerCode",
                name,
                "dailyChangeRate"
            FROM "Stock"
            WHERE "dailyChangeRate" IS NOT NULL
              AND "latestVolume" >= 100000
            ORDER BY "dailyChangeRate" ASC
            LIMIT %s
        ''', (MOVERS_COUNT,))

        losers = [
            {
                "id": row[0],
                "tickerCode": row[1],
                "name": row[2],
                "dailyChangeRate": float(row[3]) if row[3] else 0,
            }
            for row in cur.fetchall()
        ]

    return gainers, losers


def analyze_mover(app_url: str, cron_secret: str, stock_id: str, mover_type: str) -> dict | None:
    """APIを呼び出して銘柄の変動分析を生成"""
    try:
        response = requests.post(
            f"{app_url}/api/stocks/{stock_id}/mover-analysis",
            headers={
                "Authorization": f"Bearer {cron_secret}",
                "Content-Type": "application/json",
            },
            json={"type": mover_type},
            timeout=120
        )

        if response.status_code == 200:
            return response.json()
        else:
            print(f"  Error: {response.status_code} - {response.text[:200]}")
            return None
    except requests.exceptions.Timeout:
        print("  Error: Request timed out")
        return None
    except Exception as e:
        print(f"  Error: {e}")
        return None


def delete_existing_movers(conn, today: datetime):
    """今日のデータを削除"""
    with conn.cursor() as cur:
        cur.execute('DELETE FROM "DailyMarketMover" WHERE date = %s', (today,))
        conn.commit()


def save_mover(conn, today: datetime, result: dict, mover_type: str, position: int):
    """分析結果をDBに保存（UPSERT）"""
    with conn.cursor() as cur:
        cur.execute('''
            INSERT INTO "DailyMarketMover" (
                id, date, "stockId", type, position, "changeRate", analysis, "relatedNews", "createdAt"
            ) VALUES (
                gen_random_uuid()::text, %s, %s, %s, %s, %s, %s, %s, NOW()
            )
            ON CONFLICT (date, type, position) DO UPDATE SET
                "stockId" = EXCLUDED."stockId",
                "changeRate" = EXCLUDED."changeRate",
                analysis = EXCLUDED.analysis,
                "relatedNews" = EXCLUDED."relatedNews"
        ''', (
            today,
            result["stockId"],
            mover_type,
            position,
            result["changeRate"],
            result["analysis"],
            json.dumps(result.get("relatedNews", []), ensure_ascii=False),
        ))
        conn.commit()


def main():
    print("=" * 60)
    print("Daily Gainers/Losers Analysis")
    print("=" * 60)
    print(f"Time: {datetime.now().isoformat()}")
    print()

    app_url = get_app_url()
    cron_secret = get_cron_secret()
    conn = psycopg2.connect(get_database_url())
    today = get_today_jst()

    try:
        # 1. 上昇/下落銘柄を取得
        print("1. Fetching top movers...")
        gainers, losers = get_top_movers(conn)
        print(f"   Gainers: {len(gainers)} stocks")
        print(f"   Losers: {len(losers)} stocks")

        if not gainers and not losers:
            print("Error: No stock data available")
            sys.exit(1)

        # 2. 既存データを削除
        print("\n2. Deleting existing data...")
        delete_existing_movers(conn, today)

        success_count = 0
        error_count = 0

        # 3. 上昇銘柄の分析
        print("\n3. Analyzing gainers...")
        for idx, stock in enumerate(gainers):
            print(f"   - {stock['name']} ({stock['tickerCode']}): {stock['dailyChangeRate']:+.2f}%")
            result = analyze_mover(app_url, cron_secret, stock["id"], "gainer")
            if result:
                save_mover(conn, today, result, "gainer", idx + 1)
                print(f"     -> {result['analysis'][:50]}...")
                success_count += 1
            else:
                print(f"     -> Failed to generate analysis")
                error_count += 1

        # 4. 下落銘柄の分析
        print("\n4. Analyzing losers...")
        for idx, stock in enumerate(losers):
            print(f"   - {stock['name']} ({stock['tickerCode']}): {stock['dailyChangeRate']:+.2f}%")
            result = analyze_mover(app_url, cron_secret, stock["id"], "loser")
            if result:
                save_mover(conn, today, result, "loser", idx + 1)
                print(f"     -> {result['analysis'][:50]}...")
                success_count += 1
            else:
                print(f"     -> Failed to generate analysis")
                error_count += 1

        print()
        print("=" * 60)
        print("Daily Gainers/Losers Analysis completed!")
        print("=" * 60)
        print(f"  - Success: {success_count}")
        print(f"  - Errors: {error_count}")
        print("=" * 60)

        # 全員失敗した場合はエラー終了
        if success_count == 0 and error_count > 0:
            sys.exit(1)

    finally:
        conn.close()


if __name__ == "__main__":
    main()
