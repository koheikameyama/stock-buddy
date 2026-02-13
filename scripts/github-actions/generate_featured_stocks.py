#!/usr/bin/env python3
"""
DailyFeaturedStock自動生成スクリプト

APIエンドポイントを呼び出すことで、手動実行と同じロジックを使用します。

毎日朝に実行され、各カテゴリTop 3を選出（合計9銘柄）
- surge（短期急騰）: 週間上昇率+5%以上
- stable（中長期安定）: ボラティリティ15%以下
- trending（話題）: 出来高比率1.5倍以上
"""

import os
import sys
from datetime import datetime

import requests


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


def generate_featured_stocks(app_url: str, cron_secret: str) -> dict | None:
    """APIを呼び出して注目銘柄を生成"""
    try:
        response = requests.post(
            f"{app_url}/api/featured-stocks/generate-for-user",
            headers={"Authorization": f"Bearer {cron_secret}"},
            timeout=180  # 株価データの取得に時間がかかる場合があるため長めに設定
        )

        if response.status_code == 200:
            return response.json()
        else:
            print(f"Error: {response.status_code} - {response.text[:200]}")
            return None
    except requests.exceptions.Timeout:
        print("Error: Request timed out")
        return None
    except Exception as e:
        print(f"Error: {e}")
        return None


def main():
    print("=" * 60)
    print("DailyFeaturedStock Generation")
    print("=" * 60)
    print(f"Time: {datetime.now().isoformat()}")
    print()

    app_url = get_app_url()
    cron_secret = get_cron_secret()

    print("Calling API to generate featured stocks...")
    result = generate_featured_stocks(app_url, cron_secret)

    if not result:
        print("Failed to generate featured stocks")
        sys.exit(1)

    print()
    print("=" * 60)
    print("DailyFeaturedStock generation completed")
    print("=" * 60)
    print(f"Total featured stocks: {result.get('count', 0)}")
    print(f"  - Surge: {result.get('surge', 0)}")
    print(f"  - Stable: {result.get('stable', 0)}")
    print(f"  - Trending: {result.get('trending', 0)}")
    print("=" * 60)


if __name__ == "__main__":
    main()
