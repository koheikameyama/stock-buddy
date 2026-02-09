#!/usr/bin/env python3
"""
Stock マスタデータベース更新スクリプト

JPXからスクレイピングした銘柄データをPostgreSQLに反映する。

実行方法:
  # 環境変数を設定
  export PRODUCTION_DATABASE_URL="postgresql://user:pass@host:port/db"

  # スクリプト実行
  python scripts/jpx/update_stock_master.py

前提条件:
  - scripts/jpx/jpx_stocks.json が存在すること
  - PRODUCTION_DATABASE_URL が設定されていること
"""

import json
import os
import sys
import psycopg2
import psycopg2.extras
from datetime import datetime
from typing import List, Dict, Optional
from cuid2 import Cuid

# CUID生成器を初期化
cuid_generator = Cuid()


# 環境変数からDB接続URLを取得
DATABASE_URL = os.getenv("PRODUCTION_DATABASE_URL")

if not DATABASE_URL:
    print("❌ ERROR: PRODUCTION_DATABASE_URL environment variable is not set")
    sys.exit(1)


def load_json_data(file_path: str) -> List[Dict]:
    """
    JSONファイルから銘柄データを読み込む

    Args:
        file_path: JSONファイルのパス

    Returns:
        銘柄データのリスト
    """
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        print(f"✅ Loaded {len(data)} records from {file_path}")
        return data
    except FileNotFoundError:
        print(f"❌ File not found: {file_path}")
        print("ℹ️  Run scrape_stocks.py first to generate the data file.")
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"❌ Invalid JSON format: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Error loading JSON: {e}")
        sys.exit(1)


def update_stock_master(stocks: List[Dict]) -> Dict[str, int]:
    """
    Stock テーブルに銘柄データを UPSERT する

    Args:
        stocks: 銘柄データのリスト

    Returns:
        統計情報 (added, updated, errors)
    """
    if not stocks:
        print("⚠️  No stocks to update")
        return {'added': 0, 'updated': 0, 'errors': 0}

    try:
        print(f"ℹ️  Connecting to database...")
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()

        # 統計カウンター
        added = 0
        updated = 0
        errors = 0

        # バッチ処理用データを準備
        upsert_data = []

        for stock in stocks:
            ticker = stock.get('ticker')
            name = stock.get('name')
            sector = stock.get('sector')
            listed_date = stock.get('listedDate')

            # 必須フィールドのバリデーション
            if not ticker or not name:
                print(f"⚠️  Skipping invalid record: {stock}")
                errors += 1
                continue

            # listed_date を None または日付文字列に変換
            listed_date_value = None
            if listed_date:
                try:
                    # ISO形式の日付文字列を検証
                    datetime.strptime(listed_date, '%Y-%m-%d')
                    listed_date_value = listed_date
                except ValueError:
                    print(f"⚠️  Invalid date format for {ticker}: {listed_date}")

            upsert_data.append((
                ticker,
                name,
                sector or "その他",
                listed_date_value
            ))

        print(f"ℹ️  Upserting {len(upsert_data)} stocks to database...")

        # バッチ UPSERT を実行（N+1 問題を回避）
        # NOTE: Stockテーブルの tickerCode カラムに UNIQUE 制約があることが前提
        for i in range(0, len(upsert_data), 100):
            batch = upsert_data[i:i+100]

            try:
                # まず、既存レコードを確認
                tickers = [item[0] for item in batch]
                format_strings = ','.join(['%s'] * len(tickers))
                cur.execute(f'''
                    SELECT "tickerCode" FROM "Stock"
                    WHERE "tickerCode" IN ({format_strings})
                ''', tickers)
                existing_tickers = set(row[0] for row in cur.fetchall())

                # UPSERT実行
                # 注: Prismaは @default(cuid()) を使用するが、直接SQL挿入時はcuidライブラリが必要
                # ここでは互換性のためcuid2ライブラリを使用してCUIDを生成
                psycopg2.extras.execute_values(
                    cur,
                    '''
                    INSERT INTO "Stock" ("id", "tickerCode", "name", "market", "sector", "listedDate", "createdAt")
                    VALUES %s
                    ON CONFLICT ("tickerCode") DO UPDATE SET
                        "name" = EXCLUDED."name",
                        "sector" = EXCLUDED."sector",
                        "listedDate" = COALESCE(EXCLUDED."listedDate", "Stock"."listedDate")
                    ''',
                    [
                        (
                            cuid_generator.generate(),  # id - CUID生成（Prismaと互換性あり）
                            item[0],  # tickerCode
                            item[1],  # name
                            "東証プライム",  # market（デフォルト）
                            item[2],  # sector
                            item[3],  # listedDate
                            datetime.now()  # createdAt
                        )
                        for item in batch
                    ],
                    template='(%s, %s, %s, %s, %s, %s, %s)',
                    page_size=100
                )

                # 追加 vs 更新をカウント
                batch_added = sum(1 for item in batch if item[0] not in existing_tickers)
                batch_updated = len(batch) - batch_added

                added += batch_added
                updated += batch_updated

                conn.commit()
                print(f"  ✓ Batch {i//100 + 1}: {batch_added} added, {batch_updated} updated")

            except Exception as e:
                print(f"❌ Error in batch {i//100 + 1}: {e}")
                conn.rollback()
                errors += len(batch)
                continue

        cur.close()
        conn.close()

        print()
        print("=" * 60)
        print(f"Database update completed:")
        print(f"  Added: {added}")
        print(f"  Updated: {updated}")
        print(f"  Errors: {errors}")
        print("=" * 60)

        return {
            'added': added,
            'updated': updated,
            'errors': errors
        }

    except psycopg2.Error as e:
        print(f"❌ Database error: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        sys.exit(1)


def main():
    """
    メイン処理: JSONファイルを読み込んでDBに反映
    """
    print("=" * 60)
    print("Stock Master Update Script")
    print("=" * 60)
    print()

    # JSONファイルのパス（相対パス使用）
    from pathlib import Path
    script_dir = Path(__file__).parent
    json_file = script_dir / 'jpx_stocks.json'

    # JSONデータを読み込み
    stocks = load_json_data(str(json_file))
    print()

    if not stocks:
        print("⚠️  No stocks to process. Exiting.")
        sys.exit(0)

    # データベースを更新
    stats = update_stock_master(stocks)

    # 終了コードを決定
    if stats['errors'] > len(stocks) * 0.5:
        print(f"\n❌ Too many errors ({stats['errors']}/{len(stocks)})")
        sys.exit(1)

    print("\n✅ Update completed successfully!")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n⚠️  Interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n\n❌ Fatal error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
