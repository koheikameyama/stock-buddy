#!/usr/bin/env python3
"""
日次上昇/下落ランキング生成スクリプト

場後に実行し、その日の上昇トップ5・下落トップ5の銘柄を抽出して
AIで原因分析を行い、DailyMarketMoverテーブルに保存する。

APIエンドポイントを呼び出すことで、分析ロジックはAPI側で一元管理する。
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


def generate_gainers_losers(app_url: str, cron_secret: str) -> dict | None:
    """APIを呼び出して上昇/下落ランキングを生成"""
    try:
        response = requests.post(
            f"{app_url}/api/market-analysis/gainers-losers",
            headers={"Authorization": f"Bearer {cron_secret}"},
            timeout=300,
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
    print("Daily Gainers/Losers Analysis")
    print("=" * 60)
    print(f"Time: {datetime.now().isoformat()}")
    print()

    app_url = get_app_url()
    cron_secret = get_cron_secret()

    print("Calling API to generate gainers/losers analysis...")
    result = generate_gainers_losers(app_url, cron_secret)

    if not result:
        print("Failed to generate gainers/losers analysis")
        sys.exit(1)

    print()
    print("=" * 60)
    print("Daily Gainers/Losers Analysis completed")
    print("=" * 60)
    print(f"  - Gainers: {result.get('gainers', 0)}")
    print(f"  - Losers: {result.get('losers', 0)}")
    print("=" * 60)


if __name__ == "__main__":
    main()
