#!/usr/bin/env python3
"""
Update Watchlist Buy-Timing Scores

ウォッチリスト銘柄の買い時スコアを更新する
ユーザーの投資スタイル（投資期間・リスク許容度）に基づいて
買い時スコアを計算し、データベースに保存する
"""

import os
import sys
import requests
from typing import Dict, Any


def update_watchlist_scores() -> bool:
    """
    ウォッチリスト銘柄の買い時スコアを更新

    Returns:
        bool: 成功した場合True、失敗した場合False
    """
    app_url = os.getenv("APP_URL")
    if not app_url:
        print("Error: APP_URL environment variable is not set", file=sys.stderr)
        return False

    api_url = f"{app_url}/api/watchlist/update-scores"

    print(f"Updating watchlist buy-timing scores...")
    print(f"URL: {api_url}")

    try:
        response = requests.post(api_url, timeout=300)  # 5分タイムアウト
        print(f"HTTP Status Code: {response.status_code}")

        if response.status_code == 200:
            data: Dict[str, Any] = response.json()
            print(f"✅ Success: {data.get('message', 'Unknown message')}")
            print(f"   Updated: {data.get('updatedCount', 0)} watchlist items")
            print(f"   Skipped: {data.get('skippedCount', 0)} (no user settings)")
            print(f"   Total: {data.get('totalCount', 0)} watchlist items")
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
    success = update_watchlist_scores()
    sys.exit(0 if success else 1)
