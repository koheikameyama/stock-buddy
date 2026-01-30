#!/usr/bin/env python3
"""
Check Price Alerts

ウォッチリスト銘柄の価格アラートをチェックし、
目標価格以下になった銘柄をユーザーに通知する
"""

import os
import sys
import requests
from typing import Dict, Any


def check_price_alerts() -> bool:
    """
    価格アラートをチェックしてプッシュ通知を送信

    Returns:
        bool: 成功した場合True、失敗した場合False
    """
    app_url = os.getenv("APP_URL")
    if not app_url:
        print("Error: APP_URL environment variable is not set", file=sys.stderr)
        return False

    api_url = f"{app_url}/api/watchlist/check-alerts"

    print(f"Checking watchlist price alerts...")
    print(f"URL: {api_url}")

    try:
        response = requests.post(api_url, timeout=300)  # 5分タイムアウト
        print(f"HTTP Status Code: {response.status_code}")

        if response.status_code == 200:
            data: Dict[str, Any] = response.json()
            print(f"✅ Success: {data.get('message', 'Unknown message')}")
            print(f"   Notified: {data.get('notifiedCount', 0)} users")
            print(f"   Skipped: {data.get('skippedCount', 0)} (no alert needed)")
            print(f"   Total: {data.get('totalCount', 0)} watchlist items with alerts")
            return True
        else:
            print(f"❌ Error: HTTP {response.status_code}", file=sys.stderr)
            print(f"Response: {response.text}", file=sys.stderr)
            return False

    except requests.exceptions.Timeout:
        print("❌ Error: Request timed out (5 minutes)", file=sys.stderr)
        return False
    except requests.exceptions.RequestException as e:
        print(f"❌ Error: Request failed - {e}", file=sys.stderr)
        return False
    except Exception as e:
        print(f"❌ Unexpected error: {e}", file=sys.stderr)
        return False


if __name__ == "__main__":
    success = check_price_alerts()
    sys.exit(0 if success else 1)
