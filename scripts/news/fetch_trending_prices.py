#!/usr/bin/env python3
"""
トレンド銘柄の株価取得スクリプト

注目銘柄生成前に、株価データがない銘柄の株価を取得する。
"""

import yfinance as yf
import psycopg2
import psycopg2.extras
from datetime import datetime
import os
import sys
import time

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    print("ERROR: DATABASE_URL environment variable is not set")
    sys.exit(1)


def fetch_trending_prices():
    """
    株価データがない銘柄の株価を取得
    """
    print("=" * 60)
    print("Trending Stocks Price Fetch")
    print("=" * 60)

    try:
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()

        # 株価データがない銘柄を取得
        cur.execute("""
            SELECT s.id, s."tickerCode", s.name
            FROM "Stock" s
            LEFT JOIN "StockPrice" sp ON s.id = sp."stockId"
            WHERE sp.id IS NULL
        """)
        stocks_without_prices = cur.fetchall()

        if not stocks_without_prices:
            print("✅ All stocks have price data")
            cur.close()
            conn.close()
            return

        print(f"📊 Found {len(stocks_without_prices)} stocks without price data")

        success_count = 0
        error_count = 0

        for stock_id, ticker, name in stocks_without_prices:
            try:
                print(f"  Processing {ticker} ({name})...")

                stock = yf.Ticker(ticker)
                hist = stock.history(period="30d")

                if hist.empty:
                    print(f"    ⚠️ No data available")
                    error_count += 1
                    continue

                # 株価データを挿入
                inserted = 0
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
                            float(row['Close'])
                        ))
                        if cur.rowcount > 0:
                            inserted += 1
                    except Exception as e:
                        print(f"    ⚠️ Error inserting: {e}")
                        continue

                # 財務指標を更新
                try:
                    info = stock.info
                    cur.execute("""
                        UPDATE "Stock"
                        SET
                            "currentPrice" = %s,
                            "financialDataUpdatedAt" = NOW()
                        WHERE id = %s
                    """, (
                        info.get('currentPrice'),
                        stock_id
                    ))
                except Exception:
                    pass

                conn.commit()
                print(f"    ✅ Inserted {inserted} records")
                success_count += 1

                # レート制限対策
                time.sleep(0.5)

            except Exception as e:
                print(f"    ❌ Error: {e}")
                error_count += 1
                continue

        cur.close()
        conn.close()

        print()
        print("=" * 60)
        print("✅ Price fetch completed")
        print("=" * 60)
        print(f"   - Success: {success_count}")
        print(f"   - Errors: {error_count}")
        print("=" * 60)

    except Exception as e:
        print(f"❌ Fatal error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    fetch_trending_prices()
