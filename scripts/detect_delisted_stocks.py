#!/usr/bin/env python3
"""
上場廃止銘柄を検出・削除するスクリプト

使用方法:
  python3 scripts/detect_delisted_stocks.py --dry-run  # 検出のみ
  python3 scripts/detect_delisted_stocks.py            # 検出して削除
"""

import os
import sys
import psycopg2
import yfinance as yf
from datetime import datetime
import argparse

DATABASE_URL = os.getenv("DATABASE_URL")

def check_if_delisted(ticker_code: str) -> tuple[bool, str]:
    """
    銘柄が上場廃止かチェック

    Returns:
        (is_delisted, reason)
    """
    try:
        stock = yf.Ticker(ticker_code)
        info = stock.info

        # QuoteType=NONEは上場廃止
        if info.get("quoteType") == "NONE":
            return True, "QuoteType=NONE"

        # symbolがinfoに含まれない場合も上場廃止
        if "symbol" not in info:
            return True, "No symbol in info"

        # 直近5日間のデータがない場合は上場廃止の可能性
        hist = stock.history(period="5d")
        if hist.empty:
            return True, "No recent price data"

        return False, "Active"

    except Exception as e:
        error_msg = str(e)
        if "possibly delisted" in error_msg.lower():
            return True, f"Delisted: {error_msg}"
        return False, f"Error: {error_msg}"

def get_stock_usage(cursor, stock_id: str) -> dict:
    """
    銘柄の使用状況を確認
    """
    usage = {
        "portfolio": 0,
        "watchlist": 0,
        "transactions": 0,
    }

    # PortfolioStock
    cursor.execute(
        'SELECT COUNT(*) FROM "PortfolioStock" WHERE "stockId" = %s',
        (stock_id,)
    )
    usage["portfolio"] = cursor.fetchone()[0]

    # WatchlistStock
    cursor.execute(
        'SELECT COUNT(*) FROM "WatchlistStock" WHERE "stockId" = %s',
        (stock_id,)
    )
    usage["watchlist"] = cursor.fetchone()[0]

    # Transaction
    cursor.execute(
        'SELECT COUNT(*) FROM "Transaction" WHERE "stockId" = %s',
        (stock_id,)
    )
    usage["transactions"] = cursor.fetchone()[0]

    return usage

def main():
    parser = argparse.ArgumentParser(description="上場廃止銘柄を検出・削除")
    parser.add_argument("--dry-run", action="store_true", help="検出のみで削除しない")
    parser.add_argument("--limit", type=int, default=100, help="チェックする銘柄数の上限")
    args = parser.parse_args()

    if not DATABASE_URL:
        print("Error: DATABASE_URL environment variable not set")
        sys.exit(1)

    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    try:
        # currentPrice=nullの銘柄を取得
        print(f"Fetching stocks with null currentPrice (limit: {args.limit})...")
        cur.execute("""
            SELECT id, "tickerCode", name
            FROM "Stock"
            WHERE "currentPrice" IS NULL
            LIMIT %s
        """, (args.limit,))

        stocks = cur.fetchall()
        print(f"Found {len(stocks)} stocks to check\n")

        delisted_stocks = []
        active_stocks = []

        for idx, (stock_id, ticker_code, name) in enumerate(stocks, 1):
            print(f"[{idx}/{len(stocks)}] Checking {ticker_code} ({name})...", end=" ")

            is_delisted, reason = check_if_delisted(ticker_code)

            if is_delisted:
                print(f"❌ DELISTED ({reason})")

                # 使用状況を確認
                usage = get_stock_usage(cur, stock_id)
                total_usage = sum(usage.values())

                delisted_stocks.append({
                    "id": stock_id,
                    "tickerCode": ticker_code,
                    "name": name,
                    "reason": reason,
                    "usage": usage,
                    "can_delete": total_usage == 0,
                })
            else:
                print(f"✅ Active ({reason})")
                active_stocks.append({
                    "tickerCode": ticker_code,
                    "name": name,
                })

        # レポート出力
        print("\n" + "="*60)
        print("SUMMARY")
        print("="*60)
        print(f"Total checked: {len(stocks)}")
        print(f"Active stocks: {len(active_stocks)}")
        print(f"Delisted stocks: {len(delisted_stocks)}")

        if delisted_stocks:
            print("\n" + "="*60)
            print("DELISTED STOCKS")
            print("="*60)

            can_delete = [s for s in delisted_stocks if s["can_delete"]]
            cannot_delete = [s for s in delisted_stocks if not s["can_delete"]]

            if can_delete:
                print(f"\nCan delete ({len(can_delete)} stocks):")
                for stock in can_delete:
                    print(f"  - {stock['tickerCode']}: {stock['name']}")
                    print(f"    Reason: {stock['reason']}")

            if cannot_delete:
                print(f"\nCannot delete - in use ({len(cannot_delete)} stocks):")
                for stock in cannot_delete:
                    print(f"  - {stock['tickerCode']}: {stock['name']}")
                    print(f"    Usage: Portfolio={stock['usage']['portfolio']}, "
                          f"Watchlist={stock['usage']['watchlist']}, "
                          f"Transactions={stock['usage']['transactions']}")

            # 削除実行
            if not args.dry_run and can_delete:
                print("\n" + "="*60)
                print("DELETING STOCKS")
                print("="*60)

                for stock in can_delete:
                    print(f"Deleting {stock['tickerCode']}...", end=" ")
                    cur.execute('DELETE FROM "Stock" WHERE id = %s', (stock["id"],))
                    print("✅ Done")

                conn.commit()
                print(f"\n✅ Successfully deleted {len(can_delete)} delisted stocks")
            elif args.dry_run:
                print("\n⚠️  DRY RUN mode - no stocks were deleted")

    except Exception as e:
        print(f"\n❌ Error: {e}")
        conn.rollback()
        sys.exit(1)
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    main()
