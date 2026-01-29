#!/usr/bin/env python3
"""
株価データ取得スクリプト（Cron実行用）

毎日17:00 JSTに実行され、DBに登録された全銘柄の株価データを取得してPostgreSQLに保存する。
"""

import yfinance as yf
import psycopg2
from datetime import datetime, timedelta
import os
import sys


DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    print("ERROR: DATABASE_URL environment variable is not set")
    sys.exit(1)


def fetch_and_store():
    """
    1. DBから監視銘柄を取得
    2. yfinanceで株価データ取得
    3. PostgreSQLに保存
    """
    try:
        print(f"[{datetime.now()}] Starting stock data fetch...")
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()

        # 監視銘柄を取得
        cur.execute('SELECT id, "tickerCode", name FROM "Stock"')
        stocks = cur.fetchall()

        print(f"Fetching data for {len(stocks)} stocks...")

        success_count = 0
        error_count = 0

        for stock_id, ticker, name in stocks:
            try:
                print(f"Processing {ticker} ({name})...")
                stock = yf.Ticker(ticker)

                # 過去90日分取得（指標計算用に余裕を持たせる）
                hist = stock.history(period="90d")

                if hist.empty:
                    print(f"  ⚠️  No data available for {ticker}")
                    error_count += 1
                    continue

                # 最新データをINSERT（重複は無視）
                inserted_count = 0
                for date, row in hist.iterrows():
                    try:
                        cur.execute("""
                            INSERT INTO "StockPrice"
                            (id, "stockId", date, open, high, low, close, volume, "adjustedClose", "createdAt")
                            VALUES (gen_random_uuid(), %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                            ON CONFLICT ("stockId", date) DO NOTHING
                        """, (
                            stock_id,
                            date.date(),
                            float(row['Open']),
                            float(row['High']),
                            float(row['Low']),
                            float(row['Close']),
                            int(row['Volume']),
                            float(row['Close'])  # adjustedClose
                        ))
                        if cur.rowcount > 0:
                            inserted_count += 1
                    except Exception as e:
                        print(f"  ⚠️  Error inserting data for {date.date()}: {e}")
                        continue

                conn.commit()
                print(f"  ✓ {ticker} completed ({inserted_count} new records)")
                success_count += 1

            except Exception as e:
                print(f"  ✗ Error processing {ticker}: {e}")
                conn.rollback()
                error_count += 1
                continue

        cur.close()
        conn.close()

        print(f"\n[{datetime.now()}] Fetch completed!")
        print(f"  Success: {success_count}")
        print(f"  Errors: {error_count}")
        print(f"  Total: {len(stocks)}")

        # エラーが多すぎる場合は異常終了
        if error_count > len(stocks) * 0.5:
            print(f"\nERROR: Too many failures ({error_count}/{len(stocks)})")
            sys.exit(1)

    except Exception as e:
        print(f"Fatal error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    fetch_and_store()
