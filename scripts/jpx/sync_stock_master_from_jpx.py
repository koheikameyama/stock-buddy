#!/usr/bin/env python3
"""
JPX公式から全銘柄マスタを同期

JPXの公式サイトから東証上場銘柄一覧（Excelファイル）をダウンロードし、
全銘柄のマスタデータをPostgreSQLに同期する。

実行方法:
  DATABASE_URL="postgresql://..." python scripts/jpx/sync_stock_master_from_jpx.py
"""

import os
import re
import sys
import time
from io import BytesIO

import pandas as pd
import psycopg2
import psycopg2.extras
import requests

# scriptsディレクトリをPythonパスに追加
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from lib.constants import DB_BATCH_SIZE, YFINANCE_BATCH_SLEEP_SECONDS

# JPXの東証上場銘柄一覧Excelファイル
JPX_EXCEL_URL = "https://www.jpx.co.jp/markets/statistics-equities/misc/tvdivq0000001vg2-att/data_j.xls"

BATCH_SIZE = DB_BATCH_SIZE


def get_database_url() -> str:
    """データベースURLを取得"""
    url = os.environ.get("PRODUCTION_DATABASE_URL") or os.environ.get("DATABASE_URL")
    if not url:
        print("Error: DATABASE_URL environment variable not set")
        sys.exit(1)
    return url


def download_jpx_excel() -> bytes:
    """JPXからExcelファイルをダウンロード"""
    print(f"Downloading JPX stock list from: {JPX_EXCEL_URL}")

    response = requests.get(
        JPX_EXCEL_URL,
        headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"},
        timeout=60,
    )
    response.raise_for_status()

    print(f"  Downloaded {len(response.content):,} bytes")
    return response.content


def parse_jpx_excel(excel_data: bytes) -> list[dict]:
    """ExcelファイルをパースしてStockデータを抽出"""
    print("Parsing Excel file...")

    df = pd.read_excel(BytesIO(excel_data))
    print(f"  Found {len(df)} rows in Excel")
    print(f"  Columns: {', '.join(df.columns.tolist())}")

    stocks = []

    # カラム名のマッピング
    code_cols = ["コード", "銘柄コード", "Code", "ticker"]
    name_cols = ["銘柄名", "会社名", "Name", "name"]
    market_cols = ["市場・商品区分", "市場", "Market"]
    sector_cols = ["33業種区分", "業種", "Sector", "業種名"]

    def find_column(candidates: list[str]) -> str | None:
        for col in candidates:
            if col in df.columns:
                return col
        return None

    code_col = find_column(code_cols)
    name_col = find_column(name_cols)
    market_col = find_column(market_cols)
    sector_col = find_column(sector_cols)

    if not code_col or not name_col:
        print("Error: Required columns not found")
        return []

    for _, row in df.iterrows():
        try:
            ticker_code = str(row[code_col]).strip() if pd.notna(row[code_col]) else None
            stock_name = str(row[name_col]).strip() if pd.notna(row[name_col]) else None

            # バリデーション
            if not ticker_code or ticker_code == "nan":
                continue
            if not stock_name or stock_name == "nan":
                continue

            # 市場区分
            market = "TSE"
            if market_col and pd.notna(row[market_col]):
                market_str = str(row[market_col]).strip()
                if any(x in market_str for x in ["プライム", "スタンダード", "グロース"]):
                    market = "TSE"

            # 業種
            sector = None
            if sector_col and pd.notna(row[sector_col]):
                sector_val = str(row[sector_col]).strip()
                if sector_val and sector_val not in ["nan", "-"]:
                    sector = sector_val

            # DBにはサフィックス付きで保存する（ない場合は .T を補完。JPX Excelは東証銘柄のみのため）
            if "." not in ticker_code:
                ticker_code = f"{ticker_code}.T"

            stocks.append({
                "ticker": ticker_code,
                "name": stock_name,
                "market": market,
                "sector": sector,
            })
        except Exception as e:
            print(f"  Warning: Error parsing row: {e}")
            continue

    print(f"  Parsed {len(stocks)} valid stocks")
    
    # Yahoo Financeでの実在確認（サフィックス判別も含む）
    print("Verifying stocks on Yahoo Finance...")
    from python.fetch_stock_prices import fetch_prices_bulk
    
    verified_stocks = []
    # 50銘柄ずつのバッチで確認
    CHUNK_SIZE = 50
    total_batches = (len(stocks) + CHUNK_SIZE - 1) // CHUNK_SIZE
    for i in range(0, len(stocks), CHUNK_SIZE):
        chunk = stocks[i:i + CHUNK_SIZE]
        tickers = [s["ticker"] for s in chunk]
        batch_num = i // CHUNK_SIZE + 1

        print(f"  Verifying batch {batch_num}/{total_batches}...")
        try:
            result = fetch_prices_bulk(tickers)

            if result.get("error"):
                # エラー時（レート制限リトライ上限超過など）は元のデータを維持
                print(f"  Warning: verification failed, keeping original data: {result['error']}")
                verified_stocks.extend(chunk)
            else:
                valid_results = {p["tickerCode"]: p["actualTicker"] for p in result["prices"]}
                for stock in chunk:
                    if stock["ticker"] in valid_results:
                        # 正しいサフィックスに更新（例: .T か .NG か）
                        stock["ticker"] = valid_results[stock["ticker"]]
                        verified_stocks.append(stock)
        except Exception as e:
            print(f"  Error verifying batch: {e}")
            verified_stocks.extend(chunk)

        # レート制限を避けるため、バッチ間にスリープ
        if i + CHUNK_SIZE < len(stocks):
            time.sleep(YFINANCE_BATCH_SLEEP_SECONDS)

    print(f"  {len(verified_stocks)} stocks verified and kept")
    return verified_stocks


def upsert_stocks_to_db(conn, stocks: list[dict]) -> dict:
    """銘柄データをDBにUPSERT"""
    if not stocks:
        print("No stocks to upsert")
        return {"added": 0, "updated": 0}

    print(f"\nUpserting {len(stocks)} stocks to database...")

    added = 0
    updated = 0

    with conn.cursor() as cur:
        for i in range(0, len(stocks), BATCH_SIZE):
            batch = stocks[i : i + BATCH_SIZE]
            tickers = [s["ticker"] for s in batch]

            # 既存のtickerCodeを確認
            cur.execute(
                'SELECT "tickerCode" FROM "Stock" WHERE "tickerCode" = ANY(%s)',
                (tickers,),
            )
            existing_tickers = {row[0] for row in cur.fetchall()}

            to_create = [s for s in batch if s["ticker"] not in existing_tickers]
            to_update = [s for s in batch if s["ticker"] in existing_tickers]

            # 新規追加
            if to_create:
                psycopg2.extras.execute_values(
                    cur,
                    """
                    INSERT INTO "Stock" (id, "tickerCode", name, market, sector, "createdAt")
                    VALUES %s
                    ON CONFLICT ("tickerCode") DO NOTHING
                    """,
                    [(s["ticker"], s["name"], s["market"], s["sector"]) for s in to_create],
                    template="(gen_random_uuid(), %s, %s, %s, %s, NOW())",
                    page_size=BATCH_SIZE,
                )
                added += len(to_create)

            # 更新
            for stock in to_update:
                cur.execute(
                    """
                    UPDATE "Stock"
                    SET name = %s, market = COALESCE(%s, market), sector = COALESCE(%s, sector)
                    WHERE "tickerCode" = %s
                    """,
                    (stock["name"], stock["market"], stock["sector"], stock["ticker"]),
                )
                updated += 1

            batch_num = i // BATCH_SIZE + 1
            print(f"  Batch {batch_num}: {len(to_create)} added, {len(to_update)} updated")

    conn.commit()
    return {"added": added, "updated": updated}


def main() -> int:
    print("=" * 60)
    print("JPX Stock Master Sync")
    print("=" * 60)
    print()

    try:
        # 1. JPXからExcelをダウンロード
        excel_data = download_jpx_excel()
        print()

        # 2. Excelをパース
        stocks = parse_jpx_excel(excel_data)
        print()

        if not stocks:
            print("No stocks found in Excel file")
            return 1

        # 3. DB接続
        db_url = get_database_url()
        conn = psycopg2.connect(db_url)

        try:
            # 4. DBにUPSERT
            stats = upsert_stocks_to_db(conn, stocks)

            print()
            print("=" * 60)
            print("Summary:")
            print(f"  Added: {stats['added']}")
            print(f"  Updated: {stats['updated']}")
            print(f"  Total: {len(stocks)}")
            print("=" * 60)
            print()
            print("Stock master sync completed successfully!")
        finally:
            conn.close()

        return 0

    except Exception as e:
        print(f"Error: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
