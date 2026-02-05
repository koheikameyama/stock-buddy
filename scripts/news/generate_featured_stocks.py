#!/usr/bin/env python3
"""
ニュースから抽出された話題の銘柄を分析してFeaturedStockに登録するスクリプト

フロー:
1. trending_stock_codes.jsonから銘柄コードを読み取る
2. マスターにない銘柄はJPXデータから取得して追加
3. 話題の銘柄のみをOpenAI APIで分析
4. FeaturedStockに登録（APIエンドポイント経由）

Usage:
    APP_URL="https://..." CRON_SECRET="..." python scripts/news/generate_featured_stocks.py
"""

import sys
import os
import json
import requests
from typing import List, Dict

# 環境変数
APP_URL = os.getenv("APP_URL", "http://localhost:3000")
CRON_SECRET = os.getenv("CRON_SECRET")

if not CRON_SECRET:
    print("❌ Error: CRON_SECRET environment variable is required")
    sys.exit(1)


def load_trending_codes(file_path: str = "scripts/news/trending_stock_codes.json") -> List[str]:
    """話題の銘柄コードを読み込む"""
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data.get("stock_codes", [])
    except FileNotFoundError:
        print(f"❌ Error: {file_path} not found. Run fetch_news.py first.")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Error loading trending codes: {e}")
        sys.exit(1)


def generate_featured_stocks(stock_codes: List[str]) -> Dict:
    """
    APIエンドポイントを呼び出して注目銘柄を生成

    Args:
        stock_codes: 話題の銘柄コードリスト

    Returns:
        API レスポンス
    """
    url = f"{APP_URL}/api/featured-stocks/generate"
    headers = {
        "Authorization": f"Bearer {CRON_SECRET}",
        "Content-Type": "application/json",
    }
    payload = {
        "stock_codes": stock_codes,
    }

    try:
        print(f"📡 Calling API: {url}")
        print(f"   Stock codes: {len(stock_codes)}")

        response = requests.post(
            url,
            headers=headers,
            json=payload,
            timeout=300  # 5分タイムアウト
        )

        if response.status_code not in [200, 201]:
            print(f"❌ API Error: {response.status_code}")
            print(f"   Response: {response.text}")
            sys.exit(1)

        result = response.json()
        print(f"✅ API call successful")
        return result

    except requests.exceptions.Timeout:
        print(f"❌ Error: API request timed out (300s)")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Error calling API: {e}")
        sys.exit(1)


def main():
    """メイン処理"""
    print("=" * 60)
    print("Featured Stocks Generation")
    print("=" * 60)

    # 話題の銘柄コードを読み込む
    trending_codes = load_trending_codes()
    print(f"\nℹ️  Trending stock codes: {len(trending_codes)}")

    if not trending_codes:
        print("⚠️  No trending stocks found. Exiting.")
        return 0

    print(f"   Codes: {trending_codes[:10]}...")  # 最初の10個を表示

    # APIを呼び出して注目銘柄を生成
    print(f"\n🤖 Generating featured stocks from {len(trending_codes)} trending stocks...")
    result = generate_featured_stocks(trending_codes)

    # 結果を表示
    print(f"\n{'=' * 60}")
    print(f"✅ Featured stocks generation completed")
    print(f"{'=' * 60}")
    print(f"   - Added to master: {result.get('added_to_master', 0)}")
    print(f"   - Analyzed stocks: {result.get('analyzed_count', 0)}")
    print(f"   - Featured stocks created: {result.get('featured_count', 0)}")
    print(f"   - Errors: {result.get('error_count', 0)}")

    if result.get("errors"):
        print(f"\n⚠️  Errors occurred:")
        for error in result["errors"][:5]:  # 最初の5個のみ表示
            print(f"   - {error}")

    print(f"{'=' * 60}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
