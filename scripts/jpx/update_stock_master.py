#!/usr/bin/env python3
"""
Stock マスタデータベース更新スクリプト

JPXからスクレイピングした銘柄データ（jpx_stocks.json）をPostgreSQLに反映する。

実行方法:
  DATABASE_URL="postgresql://..." python scripts/jpx/update_stock_master.py

前提条件:
  - scripts/jpx/jpx_stocks.json が存在すること
  - DATABASE_URL が設定されていること
"""

import json
import os
import re
import sys
from pathlib import Path

import psycopg2
import psycopg2.extras

# バッチサイズ
BATCH_SIZE = 100


def get_database_url() -> str:
    """データベースURLを取得"""
    url = os.environ.get("PRODUCTION_DATABASE_URL") or os.environ.get("DATABASE_URL")
    if not url:
        print("Error: DATABASE_URL environment variable not set")
        sys.exit(1)
    return url


def load_json_data(file_path: str) -> list[dict]:
    """JSONファイルからデータを読み込む"""
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            stocks = json.load(f)
        print(f"Loaded {len(stocks)} records from {file_path}")
        return stocks
    except FileNotFoundError:
        print(f"File not found: {file_path}")
        print("Run scrape_stocks.py first to generate the data file.")
        sys.exit(1)
    except Exception as e:
        print(f"Error loading JSON: {e}")
        sys.exit(1)


def update_stock_master(conn, stocks: list[dict]) -> dict:
    """銘柄マスタを更新"""
    if not stocks:
        print("No stocks to update")
        return {"added": 0, "updated": 0, "errors": 0}

    print("Processing stocks...")

    added = 0
    updated = 0
    errors = 0

    # 重複除去とバリデーション
    seen_tickers: set[str] = set()
    unique_stocks: list[dict] = []

    date_regex = re.compile(r"^\d{4}-\d{2}-\d{2}$")

    for stock in stocks:
        ticker = stock.get("ticker")
        name = stock.get("name")

        if not ticker or not name:
            print(f"  Skipping invalid record: {stock}")
            errors += 1
            continue

        if ticker in seen_tickers:
            print(f"  Skipping duplicate ticker: {ticker}")
            continue
        seen_tickers.add(ticker)

        # listedDate の検証
        listed_date = stock.get("listedDate")
        if listed_date and not date_regex.match(listed_date):
            print(f"  Invalid date format for {ticker}: {listed_date}")
            stock["listedDate"] = None

        unique_stocks.append(stock)

    print(f"Upserting {len(unique_stocks)} stocks to database...")

    with conn.cursor() as cur:
        for i in range(0, len(unique_stocks), BATCH_SIZE):
            batch = unique_stocks[i : i + BATCH_SIZE]

            try:
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
                        INSERT INTO "Stock" ("tickerCode", name, market, sector, "createdAt")
                        VALUES %s
                        ON CONFLICT ("tickerCode") DO NOTHING
                        """,
                        [
                            (
                                s["ticker"],
                                s["name"],
                                "TSE",
                                s.get("sector") or "その他",
                            )
                            for s in to_create
                        ],
                        template="(%s, %s, %s, %s, NOW())",
                        page_size=BATCH_SIZE,
                    )
                    added += len(to_create)

                # 更新
                for stock in to_update:
                    cur.execute(
                        """
                        UPDATE "Stock"
                        SET name = %s, sector = COALESCE(%s, sector)
                        WHERE "tickerCode" = %s
                        """,
                        (stock["name"], stock.get("sector"), stock["ticker"]),
                    )
                    updated += 1

                batch_num = i // BATCH_SIZE + 1
                print(f"  Batch {batch_num}: {len(to_create)} added, {len(to_update)} updated")

            except Exception as e:
                batch_num = i // BATCH_SIZE + 1
                print(f"  Error in batch {batch_num}: {e}")
                errors += len(batch)

    conn.commit()

    print()
    print("=" * 60)
    print("Database update completed:")
    print(f"  Added: {added}")
    print(f"  Updated: {updated}")
    print(f"  Errors: {errors}")
    print("=" * 60)

    return {"added": added, "updated": updated, "errors": errors}


def main() -> int:
    print("=" * 60)
    print("Stock Master Update Script")
    print("=" * 60)
    print()

    # JSONファイルのパス
    script_dir = Path(__file__).parent
    json_file = script_dir / "jpx_stocks.json"

    # JSONデータを読み込み
    stocks = load_json_data(str(json_file))
    print()

    if not stocks:
        print("No stocks to process. Exiting.")
        return 0

    # DB接続
    db_url = get_database_url()
    conn = psycopg2.connect(db_url)

    try:
        # データベースを更新
        stats = update_stock_master(conn, stocks)

        # 終了コードを決定
        if stats["errors"] > len(stocks) * 0.5:
            print(f"\nToo many errors ({stats['errors']}/{len(stocks)})")
            return 1

        print("\nUpdate completed successfully!")
        return 0

    except Exception as e:
        print(f"Error: {e}")
        return 1
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
