#!/usr/bin/env python3
"""
GitHub Actions: プッシュ通知送信
バッチ分析完了後に全ユーザーにプッシュ通知を送信
"""

import os
import sys
import requests
from datetime import datetime

def send_push_notifications(app_url: str, cron_secret: str):
    """全ユーザーにプッシュ通知を送信"""
    print(f"[{datetime.now()}] プッシュ通知送信開始")

    url = f"{app_url}/api/push/send"
    headers = {
        "Authorization": f"Bearer {cron_secret}",
        "Content-Type": "application/json"
    }

    payload = {
        "title": "今日の投資分析が完了しました",
        "body": "ポートフォリオと注目銘柄の分析結果をチェックしましょう",
        "url": "/dashboard"
    }

    try:
        response = requests.post(url, json=payload, headers=headers, timeout=30)
        response.raise_for_status()

        result = response.json()
        print(f"✅ プッシュ通知送信完了")
        print(f"   - 送信成功: {result.get('sent', 0)}件")
        print(f"   - 送信失敗: {result.get('failed', 0)}件")

        if result.get('errors'):
            print(f"   - エラー: {result['errors']}")

        return result

    except requests.exceptions.Timeout:
        print(f"❌ エラー: タイムアウト")
        sys.exit(1)
    except requests.exceptions.RequestException as e:
        print(f"❌ エラー: {e}")
        if hasattr(e.response, 'text'):
            print(f"   レスポンス: {e.response.text}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ 予期しないエラー: {e}")
        sys.exit(1)

def main():
    app_url = os.getenv("APP_URL")
    cron_secret = os.getenv("CRON_SECRET")

    if not app_url:
        print("❌ APP_URL環境変数が設定されていません")
        sys.exit(1)

    if not cron_secret:
        print("❌ CRON_SECRET環境変数が設定されていません")
        sys.exit(1)

    send_push_notifications(app_url, cron_secret)
    print("✅ 全ての処理が完了しました")

if __name__ == "__main__":
    main()
