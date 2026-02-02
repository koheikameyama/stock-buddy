#!/usr/bin/env python3
"""
Daily Featured Stocks Generator
毎日の注目銘柄を生成するスクリプト
"""

import os
import sys
import json
import requests
from typing import Dict, Any


def load_twitter_data(file_path: str) -> Dict[str, Any]:
    """
    Twitter データを読み込む

    Args:
        file_path: twitter_tweets.json のパス

    Returns:
        Twitter データ

    Raises:
        FileNotFoundError: ファイルが見つからない場合
        json.JSONDecodeError: JSON パースに失敗した場合
    """
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            print(f"✅ Loaded Twitter data: {data.get('total_tweets', 0)} tweets, {data.get('unique_tickers', 0)} unique tickers")
            return data
    except FileNotFoundError:
        print(f"Error: Twitter data file not found: {file_path}")
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"Error: Failed to parse Twitter data: {str(e)}")
        sys.exit(1)


def generate_featured_stocks(app_url: str, cron_secret: str, twitter_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    注目銘柄を生成

    Args:
        app_url: アプリケーションのベースURL
        cron_secret: CRON_SECRET（認証用）
        twitter_data: Twitter データ

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
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {cron_secret}",
            },
            json={"twitterData": twitter_data},
            timeout=180  # OpenAI呼び出しを含むため長めに設定
        )

        print(f"HTTP Status Code: {response.status_code}")

        if response.status_code not in [200, 201]:
            print(f"Error: {response.text}")
            sys.exit(1)

        data = response.json()

        # 結果を表示
        if "stats" in data:
            stats = data["stats"]
            print(f"\n✅ Successfully generated featured stocks:")
            print(f"  Added: {stats.get('added', 0)}")
            print(f"  Updated: {stats.get('updated', 0)}")
            print(f"  Errors: {len(stats.get('errors', []))}")

            if stats.get('errors'):
                print("\nErrors:")
                for error in stats['errors']:
                    print(f"  - {error}")

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
    cron_secret = os.environ.get("CRON_SECRET")

    if not app_url:
        print("Error: APP_URL environment variable is not set")
        sys.exit(1)

    if not cron_secret:
        print("Error: CRON_SECRET environment variable is not set")
        sys.exit(1)

    # 末尾のスラッシュを削除
    app_url = app_url.rstrip("/")

    # Twitter データを読み込み
    twitter_data_path = os.path.join(
        os.path.dirname(os.path.dirname(__file__)),
        "twitter",
        "twitter_tweets.json"
    )
    twitter_data = load_twitter_data(twitter_data_path)

    # 注目銘柄を生成
    result = generate_featured_stocks(app_url, cron_secret, twitter_data)

    print("\n✅ Daily featured stocks generation completed successfully")


if __name__ == "__main__":
    main()
