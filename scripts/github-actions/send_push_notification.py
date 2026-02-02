#!/usr/bin/env python3
"""
全ユーザーにプッシュ通知を送信するスクリプト
GitHub Actionsから呼び出される

使い方:
  python send_push_notification.py "タイトル" "本文"
"""

import os
import sys
import requests

def send_push_notification(title: str, body: str) -> bool:
    """
    プッシュ通知APIを呼び出して全ユーザーに通知を送信

    Args:
        title: 通知のタイトル
        body: 通知の本文

    Returns:
        成功したらTrue、失敗したらFalse
    """
    app_url = os.getenv("APP_URL")
    cron_secret = os.getenv("CRON_SECRET")

    if not app_url:
        print("❌ APP_URL環境変数が設定されていません")
        return False

    if not cron_secret:
        print("❌ CRON_SECRET環境変数が設定されていません")
        return False

    # プッシュ通知送信API
    url = f"{app_url}/api/push/send"

    payload = {
        "title": title,
        "body": body,
        "data": {
            "url": "/dashboard"
        }
    }

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {cron_secret}"
    }

    try:
        print(f"📱 プッシュ通知を送信中...")
        print(f"   タイトル: {title}")
        print(f"   本文: {body}")

        response = requests.post(
            url,
            json=payload,
            headers=headers,
            timeout=30
        )

        if response.status_code in [200, 201]:
            result = response.json()
            print(f"✅ プッシュ通知を送信しました")
            print(f"   送信成功: {result.get('sent', 0)}件")
            print(f"   送信失敗: {result.get('failed', 0)}件")
            return True
        else:
            print(f"❌ プッシュ通知の送信に失敗しました")
            print(f"   ステータスコード: {response.status_code}")
            print(f"   レスポンス: {response.text}")
            return False

    except Exception as e:
        print(f"❌ エラーが発生しました: {e}")
        return False


def main():
    if len(sys.argv) < 3:
        print("使い方: python send_push_notification.py <タイトル> <本文>")
        sys.exit(1)

    title = sys.argv[1]
    body = sys.argv[2]

    success = send_push_notification(title, body)

    if not success:
        sys.exit(1)


if __name__ == "__main__":
    main()
