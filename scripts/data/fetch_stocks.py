#!/usr/bin/env python3
"""
株価データ取得スクリプト（Cron実行用）

毎日17:00 JSTに実行され、DBに登録された全銘柄の株価データを取得してPostgreSQLに保存する。
並列処理により高速化。
"""

import yfinance as yf
import psycopg2
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed
import os
import sys


DATABASE_URL = os.getenv("DATABASE_URL")
MAX_WORKERS = 15  # 並列実行数

if not DATABASE_URL:
    print("ERROR: DATABASE_URL environment variable is not set")
    sys.exit(1)


def fetch_single_stock(stock_data):
    """
    1銘柄の株価データを取得してDBに保存
    """
    stock_id, ticker, name = stock_data

    try:
        # スレッドごとにDB接続を作成
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()

        print(f"Processing {ticker} ({name})...")
        stock = yf.Ticker(ticker)

        # 過去90日分取得（指標計算用に余裕を持たせる）
        hist = stock.history(period="90d")

        if hist.empty:
            print(f"  ⚠️  No data available for {ticker}")
            cur.close()
            conn.close()
            return {"ticker": ticker, "success": False, "error": "No data"}

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
                print(f"  ⚠️  {ticker}: Error inserting data for {date.date()}: {e}")
                continue

        # 財務指標を取得・更新
        try:
            info = stock.info
            cur.execute("""
                UPDATE "Stock"
                SET
                    pbr = %s,
                    per = %s,
                    roe = %s,
                    "operatingCF" = %s,
                    "freeCF" = %s,
                    "currentPrice" = %s,
                    "fiftyTwoWeekHigh" = %s,
                    "fiftyTwoWeekLow" = %s,
                    "financialDataUpdatedAt" = NOW()
                WHERE id = %s
            """, (
                info.get('priceToBook'),
                info.get('trailingPE'),
                info.get('returnOnEquity'),
                info.get('operatingCashflow'),
                info.get('freeCashflow'),
                info.get('currentPrice'),
                info.get('fiftyTwoWeekHigh'),
                info.get('fiftyTwoWeekLow'),
                stock_id
            ))
        except Exception as e:
            print(f"  ⚠️  {ticker}: Error updating financial metrics: {e}")

        conn.commit()
        cur.close()
        conn.close()

        print(f"  ✓ {ticker} completed ({inserted_count} new records)")
        return {"ticker": ticker, "success": True, "inserted": inserted_count}

    except Exception as e:
        print(f"  ✗ Error processing {ticker}: {e}")
        return {"ticker": ticker, "success": False, "error": str(e)}


def fetch_and_store():
    """
    1. DBから監視銘柄を取得
    2. yfinanceで株価データを並列取得
    3. PostgreSQLに保存
    """
    try:
        print(f"[{datetime.now()}] Starting stock data fetch (parallel mode)...")
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()

        # 監視銘柄を取得
        cur.execute('SELECT id, "tickerCode", name FROM "Stock"')
        stocks = cur.fetchall()
        cur.close()
        conn.close()

        print(f"Fetching data for {len(stocks)} stocks with {MAX_WORKERS} workers...")

        success_count = 0
        error_count = 0
        results = []

        # 並列処理で株価取得
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            futures = {executor.submit(fetch_single_stock, stock): stock for stock in stocks}

            for future in as_completed(futures):
                result = future.result()
                results.append(result)

                if result["success"]:
                    success_count += 1
                else:
                    error_count += 1

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
