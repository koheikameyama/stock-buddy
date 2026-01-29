#!/usr/bin/env python3
"""
Daily Report Generator
毎日のレポートを生成するスクリプト
"""

import os
import sys
import requests
from typing import Dict, Any
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()


def generate_daily_reports(app_url: str, cron_secret: str) -> Dict[str, Any]:
    """
    全ユーザーの日次レポートを生成

    Args:
        app_url: アプリケーションのベースURL
        cron_secret: Cron認証シークレット

    Returns:
        レスポンスデータ

    Raises:
        SystemExit: API呼び出しに失敗した場合
    """
    url = f"{app_url}/api/reports/generate-all"

    print(f"Generating daily reports for all users...")
    print(f"URL: {url}")

    try:
        response = requests.post(
            url,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {cron_secret}"
            },
            timeout=180  # レポート生成は時間がかかるので180秒
        )

        print(f"HTTP Status Code: {response.status_code}")

        if response.status_code not in [200, 201]:
            print(f"Error: {response.text}")
            return {"success": False, "status_code": response.status_code}

        data = response.json()

        # 結果を表示
        if "message" in data:
            print(f"\n✅ {data['message']}")

        if "results" in data:
            print(f"Generated reports: {len(data['results'])}")

        return {"success": True, "status_code": response.status_code, "data": data}

    except requests.Timeout:
        print("Error: Request timed out")
        return {"success": False, "status_code": 0, "error": "timeout"}
    except requests.RequestException as e:
        print(f"Error: {str(e)}")
        return {"success": False, "status_code": 0, "error": str(e)}


def send_push_notification(app_url: str, cron_secret: str) -> Dict[str, Any]:
    """
    プッシュ通知を送信

    Args:
        app_url: アプリケーションのベースURL
        cron_secret: Cron認証シークレット

    Returns:
        レスポンスデータ
    """
    url = f"{app_url}/api/push/send"

    print(f"\nSending push notification...")
    print(f"URL: {url}")

    try:
        response = requests.post(
            url,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {cron_secret}"
            },
            json={
                "title": "今日の振り返りレポートが準備できました",
                "body": "ポートフォリオの状況を確認しましょう",
                "url": "/dashboard/reports"
            },
            timeout=30
        )

        print(f"HTTP Status Code: {response.status_code}")

        if response.status_code not in [200, 201]:
            print(f"Warning: Push notification failed: {response.text}")
            return {"success": False, "status_code": response.status_code}

        return {"success": True, "status_code": response.status_code}

    except Exception as e:
        print(f"Warning: Push notification error: {str(e)}")
        return {"success": False, "error": str(e)}


def main():
    """メイン処理"""
    app_url = os.environ.get("APP_URL")
    cron_secret = os.environ.get("CRON_SECRET")

    if not app_url:
        print("Error: APP_URL environment variable is not set")
        sys.exit(1)

    if not cron_secret:
        print("Error: CRON_SECRET environment variable is not set")
        sys.exit(1)

    # 末尾のスラッシュを削除
    app_url = app_url.rstrip("/")

    # レポート生成
    result = generate_daily_reports(app_url, cron_secret)

    if not result.get("success"):
        print("\n❌ Daily report generation failed")
        sys.exit(1)

    # プッシュ通知を送信
    push_result = send_push_notification(app_url, cron_secret)
    if push_result.get("success"):
        print("  ✅ Push notification sent")
    else:
        print("  ⚠️  Push notification failed (non-critical)")

    print("\n✅ Daily report generation completed successfully")


if __name__ == "__main__":
    main()
