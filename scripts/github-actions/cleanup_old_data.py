#!/usr/bin/env python3
"""
古いデータを定期削除するスクリプト

削除対象:
- StockPrice: 3ヶ月より古いデータ
- StockIndicator: 3ヶ月より古いデータ
- StockAnalysis: 1ヶ月より古いデータ
- MarketNews: 1ヶ月より古いデータ

週1回（日曜日）に実行を想定
"""

import os
import sys
import psycopg2
from datetime import datetime, timedelta

# データベース接続
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("Error: DATABASE_URL environment variable not set")
    sys.exit(1)


def cleanup_old_data():
    """古いデータを削除"""
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    try:
        # 削除基準日
        three_months_ago = datetime.now() - timedelta(days=90)
        one_month_ago = datetime.now() - timedelta(days=30)

        print(f"Cleanup started at {datetime.now().isoformat()}")
        print(f"3 months ago: {three_months_ago.date()}")
        print(f"1 month ago: {one_month_ago.date()}")
        print("-" * 50)

        total_deleted = 0

        # 1. StockPrice（3ヶ月より古いデータ）
        print("\n[1/4] Cleaning up StockPrice...")
        cur.execute(
            'SELECT COUNT(*) FROM "StockPrice" WHERE date < %s',
            (three_months_ago.date(),)
        )
        count_before = cur.fetchone()[0]
        print(f"  Records to delete: {count_before}")

        if count_before > 0:
            cur.execute(
                'DELETE FROM "StockPrice" WHERE date < %s',
                (three_months_ago.date(),)
            )
            deleted = cur.rowcount
            total_deleted += deleted
            print(f"  Deleted: {deleted} records")

        # 2. StockIndicator（3ヶ月より古いデータ）
        print("\n[2/4] Cleaning up StockIndicator...")
        cur.execute(
            'SELECT COUNT(*) FROM "StockIndicator" WHERE date < %s',
            (three_months_ago.date(),)
        )
        count_before = cur.fetchone()[0]
        print(f"  Records to delete: {count_before}")

        if count_before > 0:
            cur.execute(
                'DELETE FROM "StockIndicator" WHERE date < %s',
                (three_months_ago.date(),)
            )
            deleted = cur.rowcount
            total_deleted += deleted
            print(f"  Deleted: {deleted} records")

        # 3. StockAnalysis（1ヶ月より古いデータ）
        print("\n[3/4] Cleaning up StockAnalysis...")
        cur.execute(
            'SELECT COUNT(*) FROM "StockAnalysis" WHERE "analyzedAt" < %s',
            (one_month_ago,)
        )
        count_before = cur.fetchone()[0]
        print(f"  Records to delete: {count_before}")

        if count_before > 0:
            cur.execute(
                'DELETE FROM "StockAnalysis" WHERE "analyzedAt" < %s',
                (one_month_ago,)
            )
            deleted = cur.rowcount
            total_deleted += deleted
            print(f"  Deleted: {deleted} records")

        # 4. MarketNews（1ヶ月より古いデータ）
        print("\n[4/4] Cleaning up MarketNews...")
        cur.execute(
            'SELECT COUNT(*) FROM "MarketNews" WHERE "publishedAt" < %s',
            (one_month_ago,)
        )
        count_before = cur.fetchone()[0]
        print(f"  Records to delete: {count_before}")

        if count_before > 0:
            cur.execute(
                'DELETE FROM "MarketNews" WHERE "publishedAt" < %s',
                (one_month_ago,)
            )
            deleted = cur.rowcount
            total_deleted += deleted
            print(f"  Deleted: {deleted} records")

        # コミット
        conn.commit()

        print("\n" + "=" * 50)
        print(f"Total deleted: {total_deleted} records")
        print("Cleanup completed successfully!")

        # VACUUM ANALYZEを実行（ディスク領域の解放）
        print("\nRunning VACUUM ANALYZE to reclaim disk space...")
        conn.set_isolation_level(0)  # autocommit mode for VACUUM
        cur.execute('VACUUM ANALYZE "StockPrice"')
        cur.execute('VACUUM ANALYZE "StockIndicator"')
        cur.execute('VACUUM ANALYZE "StockAnalysis"')
        cur.execute('VACUUM ANALYZE "MarketNews"')
        print("VACUUM ANALYZE completed!")

    except Exception as e:
        conn.rollback()
        print(f"Error during cleanup: {e}")
        sys.exit(1)
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    cleanup_old_data()
