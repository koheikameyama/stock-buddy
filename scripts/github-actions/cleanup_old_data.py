#!/usr/bin/env python3
"""古いデータを定期削除するスクリプト"""

import os
import sys
from datetime import datetime, timedelta
import psycopg2


def get_database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("Error: DATABASE_URL environment variable not set")
        sys.exit(1)
    return url


def cleanup_old_data():
    conn = psycopg2.connect(get_database_url())
    try:
        one_week_ago = datetime.utcnow() - timedelta(days=7)
        print(f"Cleanup started at {datetime.now().isoformat()}")
        print(f"1 week ago: {one_week_ago.date()}")
        print("-" * 50)

        with conn.cursor() as cur:
            cur.execute('SELECT COUNT(*) FROM "StockAnalysis" WHERE "analyzedAt" < %s', (one_week_ago,))
            count_before = cur.fetchone()[0]
            print(f"\n[1/1] Cleaning up StockAnalysis...\n  Records to delete: {count_before}")

            if count_before > 0:
                cur.execute('DELETE FROM "StockAnalysis" WHERE "analyzedAt" < %s', (one_week_ago,))
                print(f"  Deleted: {cur.rowcount} records")

        conn.commit()
        print("\n" + "=" * 50)
        print("Cleanup completed successfully!")

    except Exception as e:
        print(f"Error during cleanup: {e}")
        sys.exit(1)
    finally:
        conn.close()


if __name__ == "__main__":
    cleanup_old_data()
