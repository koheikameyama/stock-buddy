#!/usr/bin/env python3
"""上場廃止銘柄を検出・削除するスクリプト"""

import argparse
import os
import sys
import yfinance as yf
import psycopg2


def get_database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("Error: DATABASE_URL environment variable not set")
        sys.exit(1)
    return url


def check_if_delisted(ticker_code: str) -> tuple[bool, str]:
    try:
        symbol = ticker_code if ticker_code.endswith(".T") else f"{ticker_code}.T"
        ticker = yf.Ticker(symbol)
        hist = ticker.history(period="1mo")
        if hist.empty:
            return True, "No price data available"
        return False, "Active"
    except Exception as e:
        error_msg = str(e).lower()
        if "delisted" in error_msg or "not found" in error_msg:
            return True, f"Delisted: {e}"
        return False, f"Error: {e}"


def get_stock_usage(conn, stock_id: str) -> dict:
    with conn.cursor() as cur:
        cur.execute('SELECT COUNT(*) FROM "PortfolioStock" WHERE "stockId" = %s', (stock_id,))
        portfolio = cur.fetchone()[0]
        cur.execute('SELECT COUNT(*) FROM "WatchlistStock" WHERE "stockId" = %s', (stock_id,))
        watchlist = cur.fetchone()[0]
        cur.execute('SELECT COUNT(*) FROM "Transaction" WHERE "stockId" = %s', (stock_id,))
        transactions = cur.fetchone()[0]
    return {"portfolio": portfolio, "watchlist": watchlist, "transactions": transactions}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=100)
    args = parser.parse_args()

    conn = psycopg2.connect(get_database_url())

    try:
        print(f"Fetching stocks to check (limit: {args.limit})...")
        with conn.cursor() as cur:
            cur.execute('SELECT id, "tickerCode", name FROM "Stock" ORDER BY "createdAt" ASC LIMIT %s', (args.limit,))
            stocks = cur.fetchall()

        print(f"Found {len(stocks)} stocks to check\n")

        delisted_stocks, can_delete = [], []

        for idx, (stock_id, ticker_code, name) in enumerate(stocks):
            print(f"[{idx + 1}/{len(stocks)}] Checking {ticker_code} ({name})... ", end="", flush=True)
            is_delisted, reason = check_if_delisted(ticker_code)

            if is_delisted:
                print(f"❌ DELISTED ({reason})")
                usage = get_stock_usage(conn, stock_id)
                total_usage = usage["portfolio"] + usage["watchlist"] + usage["transactions"]
                delisted_stocks.append({"id": stock_id, "tickerCode": ticker_code, "name": name, "reason": reason, "usage": usage, "canDelete": total_usage == 0})
                if total_usage == 0:
                    can_delete.append({"id": stock_id, "tickerCode": ticker_code})
            else:
                print(f"✅ Active")

        print(f"\n{'=' * 60}\nSUMMARY\n{'=' * 60}")
        print(f"Total checked: {len(stocks)}\nDelisted stocks: {len(delisted_stocks)}")

        if can_delete and not args.dry_run:
            print(f"\nDELETING {len(can_delete)} stocks...")
            with conn.cursor() as cur:
                for stock in can_delete:
                    cur.execute('DELETE FROM "Stock" WHERE id = %s', (stock["id"],))
                    print(f"  Deleted {stock['tickerCode']}")
            conn.commit()
            print(f"✅ Successfully deleted {len(can_delete)} delisted stocks")
        elif args.dry_run:
            print("\n⚠️  DRY RUN mode - no stocks were deleted")

    finally:
        conn.close()


if __name__ == "__main__":
    main()
