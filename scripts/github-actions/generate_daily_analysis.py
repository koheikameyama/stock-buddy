#!/usr/bin/env python3
"""
Daily Analysis Generator
毎日の銘柄分析とコーチメッセージを生成するスクリプト
"""

import os
import sys
import requests
from typing import Dict, Any


def call_api(app_url: str, endpoint: str, description: str) -> Dict[str, Any]:
    """
    APIを呼び出す

    Args:
        app_url: アプリケーションのベースURL
        endpoint: APIエンドポイント
        description: 処理の説明

    Returns:
        レスポンスデータ

    Raises:
        SystemExit: API呼び出しに失敗した場合
    """
    url = f"{app_url}{endpoint}"

    print(f"\n{description}...")
    print(f"URL: {url}")

    try:
        response = requests.post(
            url,
            headers={"Content-Type": "application/json"},
            timeout=120  # 分析は時間がかかるので120秒
        )

        print(f"HTTP Status Code: {response.status_code}")

        if response.status_code not in [200, 201]:
            print(f"Error: {response.text}")
            return {"success": False, "status_code": response.status_code}

        data = response.json()
        return {"success": True, "status_code": response.status_code, "data": data}

    except requests.Timeout:
        print(f"Error: Request timed out for {endpoint}")
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
                "title": "新しい分析が準備できました",
                "body": "今日の銘柄分析とコーチメッセージをチェックしましょう",
                "url": "/dashboard"
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
    cron_secret = os.environ.get("CRON_SECRET", "")

    if not app_url:
        print("Error: APP_URL environment variable is not set")
        sys.exit(1)

    # 末尾のスラッシュを削除
    app_url = app_url.rstrip("/")

    # 各種分析を実行
    results = {}

    # 1. ポートフォリオ銘柄分析
    results["portfolio_analysis"] = call_api(
        app_url,
        "/api/analyses/portfolio/generate",
        "Generating portfolio stock analysis"
    )

    # 2. コーチメッセージ生成
    results["coach_messages"] = call_api(
        app_url,
        "/api/coach-messages/generate",
        "Generating coach messages"
    )

    # 結果の確認
    all_success = all(r.get("success", False) for r in results.values())

    if not all_success:
        print("\n❌ Some analyses failed:")
        for name, result in results.items():
            status = "✅" if result.get("success") else "❌"
            print(f"  {status} {name}: {result.get('status_code', 'N/A')}")
        sys.exit(1)

    print("\n✅ All analyses completed successfully:")
    for name, result in results.items():
        print(f"  ✅ {name}: {result.get('status_code')}")

    # プッシュ通知を送信
    if cron_secret:
        push_result = send_push_notification(app_url, cron_secret)
        if push_result.get("success"):
            print("  ✅ Push notification sent")
        else:
            print("  ⚠️  Push notification failed (non-critical)")
    else:
        print("  ⚠️  CRON_SECRET not set, skipping push notification")

    print("\n✅ Daily analysis generation completed successfully")


if __name__ == "__main__":
    main()
