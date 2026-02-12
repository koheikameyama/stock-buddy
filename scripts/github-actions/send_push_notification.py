#!/usr/bin/env python3
"""プッシュ通知を送信するスクリプト"""

import argparse
import os
import sys
import requests


def send_push_notification(app_url: str, cron_secret: str, title: str, body: str, url: str) -> int:
    api_url = f"{app_url}/api/push/send"
    headers = {"Authorization": f"Bearer {cron_secret}", "Content-Type": "application/json"}
    payload = {"title": title, "body": body, "url": url}

    print(f"📡 Sending push notification...\n   Title: {title}\n   Body: {body}\n   URL: {url}")

    try:
        response = requests.post(api_url, json=payload, headers=headers, timeout=30)
        if not response.ok:
            print(f"❌ API Error: {response.status_code}\n   Response: {response.text}")
            sys.exit(1)

        result = response.json()
        print(f"✅ Push notification sent successfully\n   - Sent: {result.get('sent', 0)}\n   - Failed: {result.get('failed', 0)}")
        return 0

    except requests.exceptions.Timeout:
        print("❌ Error: API request timed out")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="Send push notification")
    parser.add_argument("--title", required=True)
    parser.add_argument("--body", required=True)
    parser.add_argument("--url", required=True)
    args = parser.parse_args()

    app_url = os.environ.get("APP_URL", "http://localhost:3000")
    cron_secret = os.environ.get("CRON_SECRET")
    if not cron_secret:
        print("❌ Error: CRON_SECRET environment variable is required")
        sys.exit(1)

    return send_push_notification(app_url, cron_secret, args.title, args.body, args.url)


if __name__ == "__main__":
    main()
