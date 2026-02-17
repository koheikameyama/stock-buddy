#!/usr/bin/env python3
"""
購入判断分析を生成するスクリプト

ウォッチリスト（気になる銘柄）に対して、毎日AI分析を行い購入判断を生成します。
APIエンドポイントを呼び出すことで、手動実行と同じロジックを使用します。

買い推奨（recommendation='buy' かつ confidence>=0.6）の場合、
該当ユーザーに通知を送信します。
"""

import os
import sys
from datetime import datetime

import psycopg2
import requests

# 買い推奨通知の閾値
BUY_RECOMMENDATION_CONFIDENCE_THRESHOLD = 0.6


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
    """ウォッチリストの銘柄IDを取得（重複排除）"""
    with conn.cursor() as cur:
        cur.execute('''
            SELECT DISTINCT ws."stockId", s.name, s."tickerCode"
            FROM "WatchlistStock" ws
            JOIN "Stock" s ON ws."stockId" = s.id
        ''')
        rows = cur.fetchall()
    return [{"stockId": row[0], "name": row[1], "tickerCode": row[2]} for row in rows]


def fetch_watchlist_users_for_stock(conn, stock_id: str) -> list[str]:
    """指定銘柄をウォッチしているユーザーIDを取得"""
    with conn.cursor() as cur:
        cur.execute('''
            SELECT "userId" FROM "WatchlistStock" WHERE "stockId" = %s
        ''', (stock_id,))
        rows = cur.fetchall()
    return [row[0] for row in rows]


def send_buy_recommendation_notifications(
    app_url: str,
    cron_secret: str,
    notifications: list[dict]
) -> dict:
    """買い推奨通知を送信"""
    if not notifications:
        return {"created": 0, "pushSent": 0, "skipped": 0, "errors": []}

    api_url = f"{app_url}/api/notifications/send"
    headers = {
        "Authorization": f"Bearer {cron_secret}",
        "Content-Type": "application/json"
    }

    try:
        response = requests.post(
            api_url,
            json={"notifications": notifications},
            headers=headers,
            timeout=60
        )

        if not response.ok:
            print(f"  Notification API error: {response.status_code} - {response.text[:200]}")
            return {"created": 0, "pushSent": 0, "skipped": 0, "errors": [response.text]}

        return response.json()
    except Exception as e:
        print(f"  Failed to send notifications: {e}")
        return {"created": 0, "pushSent": 0, "skipped": 0, "errors": [str(e)]}


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
        buy_notifications = []

        for ws in watchlist_stocks:
            print(f"\n--- Processing: {ws['name']} ({ws['tickerCode']}) ---")

            result = generate_recommendation_for_stock(app_url, cron_secret, ws["stockId"])

            if not result:
                print("  Failed to generate recommendation")
                error_count += 1
                continue

            recommendation = result.get("recommendation", "")
            confidence = result.get("confidence", 0)
            reason = result.get("reason", "")

            print(f"  Generated: {recommendation} (confidence: {confidence})")
            success_count += 1

            # 買い推奨の場合、該当ユーザーへの通知を準備
            if (
                recommendation == "buy"
                and confidence >= BUY_RECOMMENDATION_CONFIDENCE_THRESHOLD
            ):
                user_ids = fetch_watchlist_users_for_stock(conn, ws["stockId"])
                print(f"  Buy recommendation! Notifying {len(user_ids)} users")

                for user_id in user_ids:
                    confidence_pct = int(confidence * 100)
                    reason_short = reason[:50] + "..." if len(reason) > 50 else reason
                    buy_notifications.append({
                        "userId": user_id,
                        "type": "buy_recommendation",
                        "stockId": ws["stockId"],
                        "title": f"📊 {ws['name']}が買い推奨です",
                        "body": f"AIが買い推奨と判断しました（確信度{confidence_pct}%）。{reason_short}",
                        "url": f"/stocks/{ws['stockId']}",
                    })

        # 買い推奨通知を送信
        if buy_notifications:
            print(f"\n=== Sending {len(buy_notifications)} buy recommendation notifications ===")
            notify_result = send_buy_recommendation_notifications(
                app_url, cron_secret, buy_notifications
            )
            print(f"  Created: {notify_result.get('created', 0)}")
            print(f"  Push sent: {notify_result.get('pushSent', 0)}")
            print(f"  Skipped (duplicate): {notify_result.get('skipped', 0)}")
            if notify_result.get("errors"):
                print(f"  Errors: {notify_result['errors']}")

        print(f"\n=== Summary ===")
        print(f"Success: {success_count}, Errors: {error_count}")
        print(f"Buy notifications queued: {len(buy_notifications)}")

        # 全員失敗した場合はエラー終了
        if success_count == 0 and error_count > 0:
            sys.exit(1)

    finally:
        conn.close()


if __name__ == "__main__":
    main()
