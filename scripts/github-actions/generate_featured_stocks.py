#!/usr/bin/env python3
"""
Daily Featured Stocks Generator
毎日の注目銘柄を生成するスクリプト
"""

import os
import sys
import requests
from typing import Dict, Any
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()


def generate_featured_stocks(app_url: str) -> Dict[str, Any]:
    """
    注目銘柄を生成

    Args:
        app_url: アプリケーションのベースURL

    Returns:
        レスポンスデータ

    Raises:
        requests.RequestException: API呼び出しに失敗した場合
    """
    url = f"{app_url}/api/featured-stocks/generate"

    print(f"Generating featured stocks...")
    print(f"URL: {url}")

    try:
        response = requests.post(
            url,
            headers={"Content-Type": "application/json"},
            timeout=30
        )

        print(f"HTTP Status Code: {response.status_code}")

        if response.status_code not in [200, 201]:
            print(f"Error: {response.text}")
            sys.exit(1)

        data = response.json()

        # 結果を表示
        if "featuredStocks" in data:
            print(f"\n✅ Successfully generated {len(data['featuredStocks'])} featured stocks:")
            for stock in data["featuredStocks"]:
                stock_info = stock.get("stock", {})
                print(f"  {stock['position']}. {stock_info.get('name')} ({stock_info.get('tickerCode')}) - Score: {stock['score']}")

        return data

    except requests.Timeout:
        print("Error: Request timed out")
        sys.exit(1)
    except requests.RequestException as e:
        print(f"Error: {str(e)}")
        sys.exit(1)


def main():
    """メイン処理"""
    app_url = os.environ.get("APP_URL")

    if not app_url:
        print("Error: APP_URL environment variable is not set")
        sys.exit(1)

    # 末尾のスラッシュを削除
    app_url = app_url.rstrip("/")

    # 注目銘柄を生成
    result = generate_featured_stocks(app_url)

    print("\n✅ Daily featured stocks generation completed successfully")


if __name__ == "__main__":
    main()
