#!/usr/bin/env python3
"""
ユーザーごとのAIおすすめ銘柄生成スクリプト

TypeScript API を呼び出すだけのシンプルなスクリプト。
実際のロジックは /api/recommendations/generate-daily に移行済み。
"""

import os
import sys
import requests
from datetime import datetime


def main():
    session = os.environ.get("SESSION", "evening")
    app_url = os.environ.get("APP_URL")
    cron_secret = os.environ.get("CRON_SECRET")

    if not app_url:
        print("Error: APP_URL environment variable not set")
        sys.exit(1)

    if not cron_secret:
        print("Error: CRON_SECRET environment variable not set")
        sys.exit(1)

    print("=" * 60)
    print("User Daily Recommendation Generation (Python -> TypeScript API)")
    print("=" * 60)
    print(f"Time: {datetime.now().isoformat()}")
    print(f"Session: {session}")
    print(f"API URL: {app_url}/api/recommendations/generate-daily")
    print()

    try:
        response = requests.post(
            f"{app_url}/api/recommendations/generate-daily",
            headers={
                "Authorization": f"Bearer {cron_secret}",
                "Content-Type": "application/json",
            },
            json={"session": session},
            timeout=300,  # 5分タイムアウト
        )

        if response.status_code not in [200, 201]:
            print(f"Error: API returned status {response.status_code}")
            print(f"Response: {response.text}")
            sys.exit(1)

        result = response.json()
        print(f"Success: {result.get('processed', 0)} users processed")
        print(f"Failed: {result.get('failed', 0)} users failed")

        if result.get('failed', 0) > 0 and result.get('processed', 0) == 0:
            sys.exit(1)

    except requests.exceptions.Timeout:
        print("Error: Request timed out")
        sys.exit(1)
    except requests.exceptions.RequestException as e:
        print(f"Error: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"Unexpected error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
