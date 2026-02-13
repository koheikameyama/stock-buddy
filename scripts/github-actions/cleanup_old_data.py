#!/usr/bin/env python3
"""古いデータを定期削除するスクリプト（30日保持）"""

import os
import sys
from datetime import datetime, timedelta
import psycopg2

# データ保持期間
RETENTION_DAYS = 30


def get_database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("Error: DATABASE_URL environment variable not set")
        sys.exit(1)
    return url


def cleanup_old_data():
    conn = psycopg2.connect(get_database_url())
    try:
        cutoff_date = datetime.utcnow() - timedelta(days=RETENTION_DAYS)
        print(f"Cleanup started at {datetime.now().isoformat()}")
        print(f"Retention: {RETENTION_DAYS} days")
        print(f"Cutoff date: {cutoff_date.date()}")
        print("-" * 50)

        total_deleted = 0

        with conn.cursor() as cur:
            # 1. StockAnalysis（ポートフォリオ分析）
            cur.execute('SELECT COUNT(*) FROM "StockAnalysis" WHERE "analyzedAt" < %s', (cutoff_date,))
            count = cur.fetchone()[0]
            print(f"\n[1/3] StockAnalysis: {count} records to delete")
            if count > 0:
                cur.execute('DELETE FROM "StockAnalysis" WHERE "analyzedAt" < %s', (cutoff_date,))
                print(f"  Deleted: {cur.rowcount}")
                total_deleted += cur.rowcount

            # 2. PurchaseRecommendation（ウォッチリスト購入推奨）
            cur.execute('SELECT COUNT(*) FROM "PurchaseRecommendation" WHERE date < %s', (cutoff_date.date(),))
            count = cur.fetchone()[0]
            print(f"\n[2/3] PurchaseRecommendation: {count} records to delete")
            if count > 0:
                cur.execute('DELETE FROM "PurchaseRecommendation" WHERE date < %s', (cutoff_date.date(),))
                print(f"  Deleted: {cur.rowcount}")
                total_deleted += cur.rowcount

            # 3. UserDailyRecommendation（あなたへのおすすめ）
            cur.execute('SELECT COUNT(*) FROM "UserDailyRecommendation" WHERE date < %s', (cutoff_date.date(),))
            count = cur.fetchone()[0]
            print(f"\n[3/3] UserDailyRecommendation: {count} records to delete")
            if count > 0:
                cur.execute('DELETE FROM "UserDailyRecommendation" WHERE date < %s', (cutoff_date.date(),))
                print(f"  Deleted: {cur.rowcount}")
                total_deleted += cur.rowcount

        conn.commit()
        print("\n" + "=" * 50)
        print(f"Cleanup completed! Total deleted: {total_deleted} records")

    except Exception as e:
        print(f"Error during cleanup: {e}")
        sys.exit(1)
    finally:
        conn.close()


if __name__ == "__main__":
    cleanup_old_data()
