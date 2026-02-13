#!/usr/bin/env python3
"""
日付計算方式変更に伴う一時的なクリーンアップスクリプト

修正前（UTC 00:00）と修正後（JST 00:00→UTC）でデータの日付が異なるため、
直近のデータを一度削除してからバッチを再実行する必要がある。

このスクリプトは一度だけ実行する。
"""

import os
import sys
import psycopg2

def get_database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("Error: DATABASE_URL environment variable not set")
        sys.exit(1)
    return url


def cleanup():
    conn = psycopg2.connect(get_database_url())
    try:
        with conn.cursor() as cur:
            # 直近7日分のデータを削除（日付の不整合を解消）

            # 1. UserDailyRecommendation
            cur.execute('''
                DELETE FROM "UserDailyRecommendation"
                WHERE date >= CURRENT_DATE - INTERVAL '7 days'
            ''')
            print(f"UserDailyRecommendation: deleted {cur.rowcount} rows")

            # 2. DailyFeaturedStock
            cur.execute('''
                DELETE FROM "DailyFeaturedStock"
                WHERE date >= CURRENT_DATE - INTERVAL '7 days'
            ''')
            print(f"DailyFeaturedStock: deleted {cur.rowcount} rows")

            # 3. PurchaseRecommendation
            cur.execute('''
                DELETE FROM "PurchaseRecommendation"
                WHERE date >= CURRENT_DATE - INTERVAL '7 days'
            ''')
            print(f"PurchaseRecommendation: deleted {cur.rowcount} rows")

        conn.commit()
        print("\nCleanup completed successfully!")
        print("Now you can re-run the featured-stocks workflow.")

    except Exception as e:
        print(f"Error: {e}")
        conn.rollback()
        sys.exit(1)
    finally:
        conn.close()


if __name__ == "__main__":
    print("=" * 50)
    print("Date Migration Cleanup Script")
    print("=" * 50)
    cleanup()
