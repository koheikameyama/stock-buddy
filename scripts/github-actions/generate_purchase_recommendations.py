#!/usr/bin/env python3
"""
購入判断分析を生成するスクリプト

ウォッチリスト（気になる銘柄）に対して、毎日AI分析を行い購入判断を生成します。
APIエンドポイントを呼び出すことで、手動実行と同じロジックを使用します。
"""

import os
import sys
from datetime import datetime

import psycopg2
import requests


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


def fetch_watchlist_stocks(conn) -> list[dict]:
    """ウォッチリストの銘柄IDを取得"""
    with conn.cursor() as cur:
        cur.execute('''
            SELECT DISTINCT ws."stockId", s.name, s."tickerCode"
            FROM "WatchlistStock" ws
            JOIN "Stock" s ON ws."stockId" = s.id
        ''')
        rows = cur.fetchall()
    return [{"stockId": row[0], "name": row[1], "tickerCode": row[2]} for row in rows]


def generate_recommendation_for_stock(app_url: str, cron_secret: str, stock_id: str) -> dict | None:
    """APIを呼び出して購入判断を生成"""
    try:
        response = requests.post(
            f"{app_url}/api/stocks/{stock_id}/purchase-recommendation",
            headers={"Authorization": f"Bearer {cron_secret}"},
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


def main():
    print("=== Starting Purchase Recommendation Generation ===")
    print(f"Time: {datetime.now().isoformat()}")

    app_url = get_app_url()
    cron_secret = get_cron_secret()
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

            result = generate_recommendation_for_stock(app_url, cron_secret, ws["stockId"])

            if not result:
                print("  Failed to generate recommendation")
                error_count += 1
                continue

            ideal_price = result.get("idealEntryPrice")
            ideal_price_str = f", 理想の買い値: {ideal_price:,}円" if ideal_price else ""
            print(f"  Generated: {result['recommendation']} (confidence: {result['confidence']}{ideal_price_str})")
            success_count += 1

        print(f"\n=== Summary ===")
        print(f"Success: {success_count}, Errors: {error_count}")

    finally:
        conn.close()


if __name__ == "__main__":
    main()
