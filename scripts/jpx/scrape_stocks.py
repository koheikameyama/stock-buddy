#!/usr/bin/env python3
"""
JPX（日本取引所グループ）から新規上場・上場廃止銘柄をスクレイピング

実行方法:
  python scripts/jpx/scrape_stocks.py

出力:
  scripts/jpx/jpx_stocks.json
"""

import requests
from bs4 import BeautifulSoup
import json
import sys
from datetime import datetime
from typing import List, Dict, Optional


def scrape_new_listings() -> List[Dict[str, Optional[str]]]:
    """
    JPXの新規上場ページから銘柄情報を取得

    Returns:
        List of dict containing: ticker, name, sector, listedDate
    """
    url = "https://www.jpx.co.jp/listing/stocks/new/index.html"

    try:
        print(f"ℹ️  Fetching new listings from: {url}")
        response = requests.get(url, timeout=30)
        response.raise_for_status()

        soup = BeautifulSoup(response.content, 'html.parser')
        stocks = []

        # JPXのHTMLテーブル構造に応じて解析
        # 注意: JPXのページ構造が変わる可能性があるため、複数のセレクタを試行

        # パターン1: テーブルから取得
        tables = soup.find_all('table')
        for table in tables:
            rows = table.find_all('tr')
            for row in rows[1:]:  # ヘッダー行をスキップ
                cols = row.find_all('td')
                if len(cols) >= 3:
                    try:
                        ticker_text = cols[0].get_text(strip=True)
                        name = cols[1].get_text(strip=True)
                        date_text = cols[2].get_text(strip=True) if len(cols) > 2 else None
                        sector = cols[3].get_text(strip=True) if len(cols) > 3 else None

                        # ティッカーコードを抽出（例: "9999" or "9999.T"）
                        ticker = ticker_text.split()[0] if ticker_text else None

                        if ticker and name:
                            # .T サフィックスを追加（Yahoo Finance形式）
                            if not ticker.endswith('.T'):
                                ticker = f"{ticker}.T"

                            # 日付をパース
                            listed_date = None
                            if date_text:
                                try:
                                    # 例: "2025年2月1日" -> "2025-02-01"
                                    listed_date = parse_japanese_date(date_text)
                                except:
                                    pass

                            stocks.append({
                                'ticker': ticker,
                                'name': name,
                                'sector': sector or "その他",
                                'listedDate': listed_date,
                                'source': 'new_listing'
                            })
                    except Exception as e:
                        print(f"⚠️  Error parsing row: {e}")
                        continue

        print(f"✅ Found {len(stocks)} new listings")
        return stocks

    except requests.RequestException as e:
        print(f"❌ Error fetching new listings: {e}")
        return []
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        return []


def scrape_delisted_stocks() -> List[Dict[str, Optional[str]]]:
    """
    JPXの上場廃止ページから銘柄情報を取得

    Returns:
        List of dict containing: ticker, name, sector, delistedDate
    """
    url = "https://www.jpx.co.jp/listing/stocks/delisted/index.html"

    try:
        print(f"ℹ️  Fetching delisted stocks from: {url}")
        response = requests.get(url, timeout=30)
        response.raise_for_status()

        soup = BeautifulSoup(response.content, 'html.parser')
        stocks = []

        # JPXのHTMLテーブル構造に応じて解析
        tables = soup.find_all('table')
        for table in tables:
            rows = table.find_all('tr')
            for row in rows[1:]:  # ヘッダー行をスキップ
                cols = row.find_all('td')
                if len(cols) >= 3:
                    try:
                        ticker_text = cols[0].get_text(strip=True)
                        name = cols[1].get_text(strip=True)
                        date_text = cols[2].get_text(strip=True) if len(cols) > 2 else None

                        # ティッカーコードを抽出
                        ticker = ticker_text.split()[0] if ticker_text else None

                        if ticker and name:
                            # .T サフィックスを追加
                            if not ticker.endswith('.T'):
                                ticker = f"{ticker}.T"

                            # 廃止日をパース
                            delisted_date = None
                            if date_text:
                                try:
                                    delisted_date = parse_japanese_date(date_text)
                                except:
                                    pass

                            stocks.append({
                                'ticker': ticker,
                                'name': name,
                                'sector': None,
                                'delistedDate': delisted_date,
                                'source': 'delisted'
                            })
                    except Exception as e:
                        print(f"⚠️  Error parsing row: {e}")
                        continue

        print(f"✅ Found {len(stocks)} delisted stocks")
        return stocks

    except requests.RequestException as e:
        print(f"❌ Error fetching delisted stocks: {e}")
        return []
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        return []


def parse_japanese_date(date_str: str) -> Optional[str]:
    """
    日本語の日付を ISO 8601 形式に変換

    例:
      "2025年2月1日" -> "2025-02-01"
      "令和7年2月1日" -> "2025-02-01"

    Args:
        date_str: 日本語の日付文字列

    Returns:
        ISO 8601形式の日付文字列、またはNone
    """
    try:
        # 西暦形式: "2025年2月1日"
        if '年' in date_str and '月' in date_str:
            date_str = date_str.replace('年', '-').replace('月', '-').replace('日', '')
            parts = date_str.split('-')
            if len(parts) >= 3:
                year = parts[0].strip()
                month = parts[1].strip().zfill(2)
                day = parts[2].strip().zfill(2)
                return f"{year}-{month}-{day}"

        # 元号形式は複雑なので省略（必要に応じて追加）
        return None

    except Exception as e:
        print(f"⚠️  Date parsing error: {e}")
        return None


def save_to_json(output_path: str, stocks: List[Dict]):
    """
    銘柄データをJSONファイルに保存

    Args:
        output_path: 出力先ファイルパス
        stocks: 銘柄データのリスト
    """
    try:
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(stocks, f, ensure_ascii=False, indent=2)
        print(f"✅ Data saved to: {output_path}")
    except Exception as e:
        print(f"❌ Error saving JSON: {e}")
        sys.exit(1)


def main():
    """
    メイン処理: JPXから銘柄をスクレイピングしてJSONに保存
    """
    print("=" * 60)
    print("JPX Stock Scraper")
    print("=" * 60)
    print()

    # 新規上場銘柄を取得
    new_listings = scrape_new_listings()
    print()

    # 上場廃止銘柄を取得
    delisted_stocks = scrape_delisted_stocks()
    print()

    # データを統合
    all_stocks = new_listings + delisted_stocks

    if not all_stocks:
        print("⚠️  No data retrieved. This might be due to:")
        print("   - JPX website structure has changed")
        print("   - Network issues")
        print("   - No new/delisted stocks currently listed")
        print()
        print("ℹ️  Creating empty output file...")
        all_stocks = []

    # JSONに保存
    from pathlib import Path
    script_dir = Path(__file__).parent
    output_path = script_dir / 'jpx_stocks.json'
    save_to_json(str(output_path), all_stocks)

    print()
    print("=" * 60)
    print(f"Summary:")
    print(f"  New listings: {len(new_listings)}")
    print(f"  Delisted: {len(delisted_stocks)}")
    print(f"  Total: {len(all_stocks)}")
    print("=" * 60)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n⚠️  Interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n\n❌ Fatal error: {e}")
        sys.exit(1)
