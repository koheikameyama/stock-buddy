#!/usr/bin/env python3
"""
古いデータを定期削除するスクリプト

削除対象:
- StockAnalysis: 1週間より古いデータ

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
        # 削除基準日（1週間前）
        one_week_ago = datetime.now() - timedelta(days=7)

        print(f"Cleanup started at {datetime.now().isoformat()}")
        print(f"1 week ago: {one_week_ago.date()}")
        print("-" * 50)

        total_deleted = 0

        # StockAnalysis（1週間より古いデータ）
        print("\n[1/1] Cleaning up StockAnalysis...")
        cur.execute(
            'SELECT COUNT(*) FROM "StockAnalysis" WHERE "analyzedAt" < %s',
            (one_week_ago,)
        )
        count_before = cur.fetchone()[0]
        print(f"  Records to delete: {count_before}")

        if count_before > 0:
            cur.execute(
                'DELETE FROM "StockAnalysis" WHERE "analyzedAt" < %s',
                (one_week_ago,)
            )
            deleted = cur.rowcount
            total_deleted += deleted
            print(f"  Deleted: {deleted} records")

        # コミット
        conn.commit()

        print("\n" + "=" * 50)
        print(f"Total deleted: {total_deleted} records")
        print("Cleanup completed successfully!")

    except Exception as e:
        conn.rollback()
        print(f"Error during cleanup: {e}")
        sys.exit(1)
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    cleanup_old_data()
