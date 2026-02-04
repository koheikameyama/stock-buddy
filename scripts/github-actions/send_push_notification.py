#!/usr/bin/env python3
"""
プッシュ通知を送信するスクリプト

Usage:
    APP_URL="https://..." CRON_SECRET="..." python scripts/github-actions/send_push_notification.py \
        --title "通知タイトル" \
        --body "通知本文" \
        --url "/path"
"""

import sys
import os
import argparse
import requests


def send_push_notification(app_url: str, cron_secret: str, title: str, body: str, url: str):
    """
    プッシュ通知を送信する

    Args:
        app_url: アプリケーションURL
        cron_secret: CRON認証シークレット
        title: 通知タイトル
        body: 通知本文
        url: 通知クリック時のURL
    """
    api_url = f"{app_url}/api/push/send"
    headers = {
        "Authorization": f"Bearer {cron_secret}",
        "Content-Type": "application/json",
    }
    payload = {
        "title": title,
        "body": body,
        "url": url,
    }

    try:
        print(f"📡 Sending push notification...")
        print(f"   Title: {title}")
        print(f"   Body: {body}")
        print(f"   URL: {url}")

        response = requests.post(
            api_url,
            headers=headers,
            json=payload,
            timeout=30
        )

        if response.status_code not in [200, 201]:
            print(f"❌ API Error: {response.status_code}")
            print(f"   Response: {response.text}")
            sys.exit(1)

        result = response.json()
        print(f"✅ Push notification sent successfully")
        print(f"   - Sent: {result.get('sent', 0)}")
        print(f"   - Failed: {result.get('failed', 0)}")

        if result.get('errors'):
            print(f"⚠️  Errors:")
            for error in result['errors'][:5]:
                print(f"   - {error}")

        return 0

    except requests.exceptions.Timeout:
        print(f"❌ Error: API request timed out")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Error sending push notification: {e}")
        sys.exit(1)


def main():
    """メイン処理"""
    parser = argparse.ArgumentParser(description="Send push notification")
    parser.add_argument("--title", required=True, help="Notification title")
    parser.add_argument("--body", required=True, help="Notification body")
    parser.add_argument("--url", required=True, help="URL to open when clicked")

    args = parser.parse_args()

    # 環境変数チェック
    app_url = os.getenv("APP_URL", "http://localhost:3000")
    cron_secret = os.getenv("CRON_SECRET")

    if not cron_secret:
        print("❌ Error: CRON_SECRET environment variable is required")
        sys.exit(1)

    return send_push_notification(
        app_url=app_url,
        cron_secret=cron_secret,
        title=args.title,
        body=args.body,
        url=args.url
    )


if __name__ == "__main__":
    sys.exit(main())
