#!/usr/bin/env python3
"""
JPX（日本取引所グループ）から新規上場・上場廃止銘柄をスクレイピング

実行方法:
  python scripts/jpx/scrape_stocks.py

出力:
  scripts/jpx/jpx_stocks.json
"""

import json
import re
import sys
import time
from pathlib import Path
from typing import Optional

import requests
from bs4 import BeautifulSoup


def parse_japanese_date(date_str: str) -> Optional[str]:
    """
    日本語の日付を ISO 8601 形式に変換

    例:
      "2025年2月1日" -> "2025-02-01"
      "2025/02/01" -> "2025-02-01"
      "2025/02/01（2025/01/15）" -> "2025-02-01"
    """
    try:
        # 括弧がある場合は最初の日付部分のみ抽出
        date_str = date_str.split("（")[0].strip()

        # スラッシュ形式: "2025/02/01"
        if "/" in date_str:
            parts = date_str.split("/")
            if len(parts) >= 3:
                year = parts[0].strip()
                month = parts[1].strip().zfill(2)
                day = parts[2].strip().zfill(2)
                return f"{year}-{month}-{day}"

        # 日本語形式: "2025年2月1日"
        if "年" in date_str and "月" in date_str:
            cleaned = date_str.replace("年", "-").replace("月", "-").replace("日", "")
            parts = cleaned.split("-")
            if len(parts) >= 3:
                year = parts[0].strip()
                month = parts[1].strip().zfill(2)
                day = parts[2].strip().zfill(2)
                return f"{year}-{month}-{day}"

        return None
    except Exception:
        return None


def scrape_new_listings() -> list[dict]:
    """
    JPXの新規上場ページから銘柄情報を取得

    JPXテーブル構造:
      cols[0]: 上場日（上場承認日）
      cols[1]: 会社名
      cols[2]: コード（ティッカー）
      cols[3]: 会社概要
      ...

    Returns:
        List of dict containing: ticker, name, sector, listedDate
    """
    url = "https://www.jpx.co.jp/listing/stocks/new/index.html"

    try:
        print(f"Fetching new listings from: {url}")
        response = requests.get(
            url,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"},
            timeout=30,
        )
        response.raise_for_status()

        soup = BeautifulSoup(response.content, "html.parser")
        stocks = []

        for table in soup.find_all("table"):
            rows = table.find_all("tr")
            for row in rows[1:]:  # ヘッダー行をスキップ
                cols = row.find_all("td")
                if len(cols) >= 3:
                    try:
                        date_text = cols[0].get_text(strip=True)
                        name = cols[1].get_text(strip=True)
                        ticker_text = cols[2].get_text(strip=True)

                        # ティッカーコードを抽出（数字+アルファベットのパターン）
                        ticker_match = re.match(r"^[\dA-Z]+", ticker_text)
                        if not ticker_match:
                            continue
                        ticker = ticker_match.group()

                        if not ticker or not name:
                            continue

                        # サフィックスがない場合は .T を付加
                        if "." not in ticker:
                            ticker = f"{ticker}.T"

                        listed_date = parse_japanese_date(date_text)

                        stocks.append({
                            "ticker": ticker,
                            "name": name,
                            "sector": "その他",
                            "listedDate": listed_date,
                            "source": "new_listing",
                        })
                    except Exception as e:
                        print(f"  Warning: Error parsing row: {e}")
                        continue

        print(f"  Found {len(stocks)} new listings")
        return stocks

    except requests.RequestException as e:
        print(f"  Error fetching new listings: {e}")
        return []


def scrape_delisted_stocks() -> list[dict]:
    """
    JPXの上場廃止ページから銘柄情報を取得

    Returns:
        List of dict containing: ticker, name, delistedDate
    """
    url = "https://www.jpx.co.jp/listing/stocks/delisted/index.html"

    try:
        print(f"Fetching delisted stocks from: {url}")
        response = requests.get(
            url,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"},
            timeout=30,
        )
        response.raise_for_status()

        soup = BeautifulSoup(response.content, "html.parser")
        stocks = []

        for table in soup.find_all("table"):
            rows = table.find_all("tr")
            for row in rows[1:]:
                cols = row.find_all("td")
                if len(cols) >= 3:
                    try:
                        # 上場廃止ページの構造も確認が必要（新規上場と異なる可能性）
                        # 一旦、同じ構造と仮定
                        date_text = cols[0].get_text(strip=True)
                        name = cols[1].get_text(strip=True)
                        ticker_text = cols[2].get_text(strip=True)

                        ticker_match = re.match(r"^[\dA-Z]+", ticker_text)
                        if not ticker_match:
                            continue
                        ticker = ticker_match.group()

                        if not ticker or not name:
                            continue

                        # サフィックスがない場合は .T を付加
                        if "." not in ticker:
                            ticker = f"{ticker}.T"

                        delisted_date = parse_japanese_date(date_text)

                        stocks.append({
                            "ticker": ticker,
                            "name": name,
                            "sector": None,
                            "delistedDate": delisted_date,
                            "source": "delisted",
                        })
                    except Exception as e:
                        print(f"  Warning: Error parsing row: {e}")
                        continue

        print(f"  Found {len(stocks)} delisted stocks")
        return stocks

    except requests.RequestException as e:
        print(f"  Error fetching delisted stocks: {e}")
        return []


def main() -> int:
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

    # 重複除去
    seen_tickers: set[str] = set()
    unique_stocks: list[dict] = []
    for stock in all_stocks:
        ticker = stock.get("ticker")
        if ticker and ticker not in seen_tickers:
            seen_tickers.add(ticker)
            unique_stocks.append(stock)

    if len(all_stocks) != len(unique_stocks):
        print(f"Removed {len(all_stocks) - len(unique_stocks)} duplicates")

    # Yahoo Financeでの実在確認（サフィックス判別含む）
    print("Verifying stocks on Yahoo Finance...")
    # scripts/python/fetch_stock_prices.py の fetch_prices_bulk をインポート
    # PYTHONPATHの調整が必要な場合があるが、ここでは直接インポート（cwd想定）
    sys.path.append(str(Path(__file__).parent.parent.parent))
    from scripts.python.fetch_stock_prices import fetch_prices_bulk
    from scripts.lib.constants import YFINANCE_BATCH_SLEEP_SECONDS

    verified_stocks = []
    CHUNK_SIZE = 50
    total_batches = (len(unique_stocks) + CHUNK_SIZE - 1) // CHUNK_SIZE
    for i in range(0, len(unique_stocks), CHUNK_SIZE):
        chunk = unique_stocks[i:i + CHUNK_SIZE]
        tickers = [s["ticker"] for s in chunk]
        batch_num = i // CHUNK_SIZE + 1

        print(f"  Verifying batch {batch_num}/{total_batches}...")
        try:
            result = fetch_prices_bulk(tickers)
            valid_results = {p["tickerCode"]: p["actualTicker"] for p in result["prices"]}

            for stock in chunk:
                if stock["ticker"] in valid_results:
                    # 正しいサフィックスに更新
                    stock["ticker"] = valid_results[stock["ticker"]]
                    verified_stocks.append(stock)
        except Exception as e:
            print(f"  Error verifying batch: {e}")
            # エラーの場合はパス（または元のデータを維持）
            verified_stocks.extend(chunk)

        # レート制限を避けるため、バッチ間にスリープ
        if i + CHUNK_SIZE < len(unique_stocks):
            time.sleep(YFINANCE_BATCH_SLEEP_SECONDS)

    all_stocks = verified_stocks
    print(f"  {len(all_stocks)} stocks verified and kept")

    if not all_stocks:
        print("No data retrieved. This might be due to:")
        print("   - JPX website structure has changed")
        print("   - Network issues")
        print("   - No new/delisted stocks currently listed")
        print()
        print("Creating empty output file...")

    # JSONに保存
    script_dir = Path(__file__).parent
    output_path = script_dir / "jpx_stocks.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(all_stocks, f, ensure_ascii=False, indent=2)
    print(f"Data saved to: {output_path}")

    print()
    print("=" * 60)
    print("Summary:")
    print(f"  New listings: {len(new_listings)}")
    print(f"  Delisted: {len(delisted_stocks)}")
    print(f"  Total: {len(all_stocks)}")
    print("=" * 60)

    return 0


if __name__ == "__main__":
    sys.exit(main())
