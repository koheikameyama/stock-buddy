#!/usr/bin/env python3
"""
PortfolioStock & Watchlist → UserStock 統合マイグレーションスクリプト

既存のPortfolioStockとWatchlistデータを新しいUserStockモデルに移行します。

使い方:
  python scripts/migration/migrate_to_userstock.py           # 本番実行
  python scripts/migration/migrate_to_userstock.py --dry-run # テスト実行（コミットしない）

ロジック:
  1. PortfolioStock → UserStock (holding mode)
     - quantity, averagePrice, purchaseDate を保持
  2. Watchlist → UserStock (watch mode)
     - quantity, averagePrice, purchaseDate は NULL
  3. 重複処理:
     - 同じユーザー・銘柄が Portfolio と Watchlist 両方にある場合
     - Portfolio を優先（holding data を保持）
     - Watchlist エントリはスキップ
"""

import psycopg2
import psycopg2.extras
import os
import sys
from datetime import datetime
from cuid2 import cuid_wrapper

# Initialize cuid generator
cuid_gen = cuid_wrapper()

def cuid():
    """Generate a new CUID"""
    return cuid_gen()

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    print("ERROR: DATABASE_URL environment variable is not set")
    sys.exit(1)


def fetch_portfolio_stocks(cur):
    """
    PortfolioStock データを取得（userId 付き）

    Returns:
        list: [(id, userId, stockId, quantity, averagePrice, createdAt), ...]
    """
    print("Fetching PortfolioStock data...")
    cur.execute("""
        SELECT
            ps.id,
            p."userId",
            ps."stockId",
            ps.quantity,
            ps."averagePrice",
            ps."createdAt"
        FROM "PortfolioStock" ps
        JOIN "Portfolio" p ON ps."portfolioId" = p.id
        ORDER BY ps."createdAt"
    """)

    results = cur.fetchall()
    print(f"  ✓ Found {len(results)} PortfolioStock records")
    return results


def fetch_watchlist_stocks(cur):
    """
    Watchlist データを取得

    Returns:
        list: [(id, userId, stockId, createdAt), ...]
    """
    print("Fetching Watchlist data...")
    cur.execute("""
        SELECT
            id,
            "userId",
            "stockId",
            "createdAt"
        FROM "Watchlist"
        ORDER BY "createdAt"
    """)

    results = cur.fetchall()
    print(f"  ✓ Found {len(results)} Watchlist records")
    return results


def prepare_portfolio_migration_data(portfolio_stocks):
    """
    PortfolioStock データを UserStock 形式に変換

    Args:
        portfolio_stocks: [(id, userId, stockId, quantity, averagePrice, createdAt), ...]

    Returns:
        list: [(id, userId, stockId, quantity, averagePrice, purchaseDate, createdAt, updatedAt), ...]
    """
    print("Preparing PortfolioStock migration data...")
    migration_data = []

    for ps in portfolio_stocks:
        old_id, user_id, stock_id, quantity, average_price, created_at = ps

        # 新しいIDを生成
        new_id = cuid()

        # purchaseDate は createdAt を使用
        purchase_date = created_at

        # updatedAt は現在時刻
        updated_at = datetime.now()

        migration_data.append((
            new_id,
            user_id,
            stock_id,
            quantity,
            float(average_price),  # Decimal → float
            purchase_date,
            created_at,
            updated_at
        ))

    print(f"  ✓ Prepared {len(migration_data)} PortfolioStock records")
    return migration_data


def prepare_watchlist_migration_data(watchlist_stocks):
    """
    Watchlist データを UserStock 形式に変換

    Args:
        watchlist_stocks: [(id, userId, stockId, createdAt), ...]

    Returns:
        list: [(id, userId, stockId, quantity, averagePrice, purchaseDate, createdAt, updatedAt), ...]
    """
    print("Preparing Watchlist migration data...")
    migration_data = []

    for ws in watchlist_stocks:
        old_id, user_id, stock_id, created_at = ws

        # 新しいIDを生成
        new_id = cuid()

        # Watch mode: quantity, averagePrice, purchaseDate は NULL
        quantity = None
        average_price = None
        purchase_date = None

        # updatedAt は現在時刻
        updated_at = datetime.now()

        migration_data.append((
            new_id,
            user_id,
            stock_id,
            quantity,
            average_price,
            purchase_date,
            created_at,
            updated_at
        ))

    print(f"  ✓ Prepared {len(migration_data)} Watchlist records")
    return migration_data


def migrate_to_userstock(cur, portfolio_data, watchlist_data, dry_run=False):
    """
    UserStock テーブルにデータを移行

    Args:
        cur: psycopg2 cursor
        portfolio_data: Portfolio migration data
        watchlist_data: Watchlist migration data
        dry_run: If True, rollback at the end

    Returns:
        dict: Migration statistics
    """
    print("\n" + "=" * 60)
    print("Migrating to UserStock table...")
    print("=" * 60)

    stats = {
        'portfolio_inserted': 0,
        'watchlist_inserted': 0,
        'watchlist_skipped': 0
    }

    # 1. PortfolioStock データを挿入（優先度高）
    if portfolio_data:
        print("\nInserting PortfolioStock data (holding mode)...")

        batch_size = 100
        for i in range(0, len(portfolio_data), batch_size):
            batch = portfolio_data[i:i+batch_size]

            psycopg2.extras.execute_values(
                cur,
                """
                INSERT INTO "UserStock"
                (id, "userId", "stockId", quantity, "averagePrice", "purchaseDate", "createdAt", "updatedAt")
                VALUES %s
                ON CONFLICT ("userId", "stockId") DO NOTHING
                """,
                batch,
                page_size=batch_size
            )

            stats['portfolio_inserted'] += len(batch)
            print(f"  Progress: {stats['portfolio_inserted']}/{len(portfolio_data)} records...")

        print(f"  ✓ Inserted {len(portfolio_data)} PortfolioStock records")

    # 2. Watchlist データを挿入（優先度低 - 重複時はスキップ）
    if watchlist_data:
        print("\nInserting Watchlist data (watch mode)...")

        # 既存の (userId, stockId) ペアを取得（重複チェック用）
        cur.execute("""
            SELECT "userId", "stockId"
            FROM "UserStock"
        """)
        existing_pairs = set((row[0], row[1]) for row in cur.fetchall())
        print(f"  ℹ️  Found {len(existing_pairs)} existing UserStock records")

        # 重複を除外
        watchlist_to_insert = []
        for data in watchlist_data:
            new_id, user_id, stock_id, quantity, average_price, purchase_date, created_at, updated_at = data

            if (user_id, stock_id) in existing_pairs:
                stats['watchlist_skipped'] += 1
            else:
                watchlist_to_insert.append(data)

        print(f"  ℹ️  Skipping {stats['watchlist_skipped']} duplicate entries (Portfolio takes priority)")
        print(f"  ℹ️  Inserting {len(watchlist_to_insert)} unique Watchlist entries")

        if watchlist_to_insert:
            batch_size = 100
            for i in range(0, len(watchlist_to_insert), batch_size):
                batch = watchlist_to_insert[i:i+batch_size]

                psycopg2.extras.execute_values(
                    cur,
                    """
                    INSERT INTO "UserStock"
                    (id, "userId", "stockId", quantity, "averagePrice", "purchaseDate", "createdAt", "updatedAt")
                    VALUES %s
                    ON CONFLICT ("userId", "stockId") DO NOTHING
                    """,
                    batch,
                    page_size=batch_size
                )

                stats['watchlist_inserted'] += len(batch)
                print(f"  Progress: {stats['watchlist_inserted']}/{len(watchlist_to_insert)} records...")

            print(f"  ✓ Inserted {len(watchlist_to_insert)} Watchlist records")

    return stats


def verify_migration(cur):
    """
    マイグレーション結果を検証
    """
    print("\n" + "=" * 60)
    print("Verifying migration...")
    print("=" * 60)

    # UserStock 総数
    cur.execute('SELECT COUNT(*) FROM "UserStock"')
    total_userstock = cur.fetchone()[0]
    print(f"  Total UserStock records: {total_userstock}")

    # Holding mode（quantity あり）
    cur.execute('SELECT COUNT(*) FROM "UserStock" WHERE quantity IS NOT NULL')
    holding_count = cur.fetchone()[0]
    print(f"  Holding mode (quantity NOT NULL): {holding_count}")

    # Watch mode（quantity なし）
    cur.execute('SELECT COUNT(*) FROM "UserStock" WHERE quantity IS NULL')
    watch_count = cur.fetchone()[0]
    print(f"  Watch mode (quantity IS NULL): {watch_count}")

    # ユーザーごとの統計
    cur.execute("""
        SELECT
            "userId",
            COUNT(*) as total,
            COUNT(quantity) as holdings,
            COUNT(*) - COUNT(quantity) as watchlist
        FROM "UserStock"
        GROUP BY "userId"
        ORDER BY total DESC
        LIMIT 10
    """)

    print("\n  Top 10 users by UserStock count:")
    print("  " + "-" * 50)
    for row in cur.fetchall():
        user_id, total, holdings, watchlist = row
        print(f"  {user_id[:12]}... | Total: {total:3d} | Holdings: {holdings:3d} | Watch: {watchlist:3d}")


def main():
    """
    メイン処理
    """
    # コマンドライン引数チェック
    dry_run = '--dry-run' in sys.argv

    if dry_run:
        print("=" * 60)
        print("🔍 DRY-RUN MODE (changes will NOT be committed)")
        print("=" * 60)
    else:
        print("=" * 60)
        print("⚠️  PRODUCTION MODE (changes will be committed)")
        print("=" * 60)

        # 本番実行時は確認を求める
        confirmation = input("\nAre you sure you want to proceed? (yes/no): ")
        if confirmation.lower() != 'yes':
            print("Migration cancelled.")
            sys.exit(0)

    print(f"\n[{datetime.now()}] Starting migration...")
    print("=" * 60)

    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    try:
        # データ取得
        portfolio_stocks = fetch_portfolio_stocks(cur)
        watchlist_stocks = fetch_watchlist_stocks(cur)

        # マイグレーションデータ準備
        portfolio_data = prepare_portfolio_migration_data(portfolio_stocks)
        watchlist_data = prepare_watchlist_migration_data(watchlist_stocks)

        # マイグレーション実行
        stats = migrate_to_userstock(cur, portfolio_data, watchlist_data, dry_run)

        # 検証
        verify_migration(cur)

        # コミット or ロールバック
        if dry_run:
            print("\n" + "=" * 60)
            print("🔍 DRY-RUN MODE: Rolling back changes...")
            conn.rollback()
            print("✓ Rollback complete (no changes were saved)")
        else:
            print("\n" + "=" * 60)
            print("💾 Committing changes to database...")
            conn.commit()
            print("✓ Migration committed successfully")

        # サマリー出力
        print("\n" + "=" * 60)
        print("Migration Summary")
        print("=" * 60)
        print(f"  PortfolioStock migrated: {stats['portfolio_inserted']} records")
        print(f"  Watchlist migrated:      {stats['watchlist_inserted']} records")
        print(f"  Watchlist skipped:       {stats['watchlist_skipped']} records (duplicates)")
        print(f"  Total:                   {stats['portfolio_inserted'] + stats['watchlist_inserted']} records")
        print("=" * 60)
        print(f"[{datetime.now()}] Migration complete!")

    except Exception as e:
        print(f"\n✗ Error: {e}")
        print("Rolling back transaction...")
        conn.rollback()
        raise e
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
