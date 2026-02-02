#!/usr/bin/env python3
"""
JPX公式から全銘柄マスタを同期

JPXの公式サイトから東証上場銘柄一覧（Excelファイル）をダウンロードし、
全銘柄のマスタデータをPostgreSQLに同期する。

実行方法:
  export DATABASE_URL="postgresql://..."
  python scripts/jpx/sync_stock_master_from_jpx.py

必要なライブラリ:
  pip install requests pandas openpyxl psycopg2-binary
"""

import os
import sys
import requests
import pandas as pd
import psycopg2
import psycopg2.extras
from datetime import datetime
from io import BytesIO

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    print("❌ ERROR: DATABASE_URL environment variable is not set")
    sys.exit(1)

# JPXの東証上場銘柄一覧Excelファイル
JPX_EXCEL_URL = "https://www.jpx.co.jp/markets/statistics-equities/misc/tvdivq0000001vg2-att/data_j.xls"


def download_jpx_excel():
    """
    JPXから東証上場銘柄一覧のExcelファイルをダウンロード

    Returns:
        BytesIO: Excelファイルのバイナリデータ
    """
    print(f"📥 Downloading JPX stock list from: {JPX_EXCEL_URL}")

    try:
        response = requests.get(JPX_EXCEL_URL, timeout=30)
        response.raise_for_status()

        print(f"✅ Downloaded {len(response.content):,} bytes")
        return BytesIO(response.content)

    except requests.RequestException as e:
        print(f"❌ Error downloading Excel file: {e}")
        sys.exit(1)


def parse_jpx_excel(excel_data):
    """
    JPXのExcelファイルをパースして銘柄データを抽出

    Args:
        excel_data: Excelファイルのバイナリデータ

    Returns:
        List[dict]: 銘柄データのリスト
    """
    print("📊 Parsing Excel file...")

    try:
        # Excelファイルを読み込み（最初のシートを使用）
        df = pd.read_excel(excel_data, sheet_name=0, engine='xlrd')

        print(f"📋 Found {len(df)} rows in Excel")

        # カラム名を確認（JPXのExcelは日本語カラム名）
        print(f"📌 Columns: {list(df.columns)}")

        stocks = []

        for index, row in df.iterrows():
            try:
                # カラム名は実際のExcelファイルに合わせて調整が必要
                # 一般的なカラム: 日付, コード, 銘柄名, 市場・商品区分, 33業種コード, 33業種区分, 規模コード, 規模区分

                # コードカラムを探す（複数のパターンを試行）
                ticker_code = None
                for col in ['コード', '銘柄コード', 'Code', 'ticker']:
                    if col in df.columns:
                        ticker_code = str(row[col]).strip()
                        break

                # 銘柄名カラムを探す
                stock_name = None
                for col in ['銘柄名', '会社名', 'Name', 'name']:
                    if col in df.columns:
                        stock_name = str(row[col]).strip()
                        break

                # 市場区分カラムを探す
                market = "TSE"  # デフォルト
                for col in ['市場・商品区分', '市場', 'Market']:
                    if col in df.columns:
                        market_str = str(row[col]).strip()
                        if 'プライム' in market_str:
                            market = "TSE"
                        elif 'スタンダード' in market_str:
                            market = "TSE"
                        elif 'グロース' in market_str:
                            market = "TSE"
                        break

                # 業種カラムを探す
                sector = None
                for col in ['33業種区分', '業種', 'Sector', '業種名']:
                    if col in df.columns:
                        sector = str(row[col]).strip()
                        if sector and sector != 'nan':
                            break

                # バリデーション
                if not ticker_code or ticker_code == 'nan':
                    continue

                if not stock_name or stock_name == 'nan':
                    continue

                # 数値のみのコードに .T を付与
                if ticker_code.isdigit():
                    ticker_code = f"{ticker_code}.T"

                stocks.append({
                    'ticker': ticker_code,
                    'name': stock_name,
                    'market': market,
                    'sector': sector if sector and sector != 'nan' else None
                })

            except Exception as e:
                print(f"⚠️  Error parsing row {index}: {e}")
                continue

        print(f"✅ Parsed {len(stocks)} valid stocks")
        return stocks

    except Exception as e:
        print(f"❌ Error parsing Excel: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


def upsert_stocks_to_db(stocks):
    """
    銘柄データをDBにUPSERT

    Args:
        stocks: 銘柄データのリスト

    Returns:
        dict: 統計情報 (added, updated, skipped)
    """
    if not stocks:
        print("⚠️  No stocks to upsert")
        return {'added': 0, 'updated': 0, 'skipped': 0}

    print(f"\n📤 Upserting {len(stocks)} stocks to database...")

    try:
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()

        added = 0
        updated = 0
        skipped = 0

        # バッチ処理（1000件ずつ）
        batch_size = 1000

        for i in range(0, len(stocks), batch_size):
            batch = stocks[i:i+batch_size]

            # 既存のtickerCodeを確認
            tickers = [s['ticker'] for s in batch]
            format_strings = ','.join(['%s'] * len(tickers))
            cur.execute(f'''
                SELECT "tickerCode" FROM "Stock"
                WHERE "tickerCode" IN ({format_strings})
            ''', tickers)
            existing_tickers = set(row[0] for row in cur.fetchall())

            # UPSERT実行（N+1問題回避）
            psycopg2.extras.execute_values(
                cur,
                '''
                INSERT INTO "Stock" (id, "tickerCode", name, market, sector, "createdAt")
                VALUES %s
                ON CONFLICT ("tickerCode") DO UPDATE SET
                    name = EXCLUDED.name,
                    market = COALESCE(EXCLUDED.market, "Stock".market),
                    sector = COALESCE(EXCLUDED.sector, "Stock".sector)
                ''',
                [
                    (
                        s['ticker'],
                        s['name'],
                        s['market'],
                        s['sector']
                    )
                    for s in batch
                ],
                template='(gen_random_uuid(), %s, %s, %s, %s, NOW())',
                page_size=100
            )

            # 統計を更新
            batch_added = sum(1 for s in batch if s['ticker'] not in existing_tickers)
            batch_updated = len(batch) - batch_added

            added += batch_added
            updated += batch_updated

            conn.commit()

            print(f"  ✓ Batch {i//batch_size + 1}: {batch_added} added, {batch_updated} updated")

        cur.close()
        conn.close()

        return {
            'added': added,
            'updated': updated,
            'skipped': skipped
        }

    except psycopg2.Error as e:
        print(f"❌ Database error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


def main():
    """
    メイン処理
    """
    print("=" * 60)
    print("JPX Stock Master Sync")
    print("=" * 60)
    print()

    # 1. JPXからExcelをダウンロード
    excel_data = download_jpx_excel()
    print()

    # 2. Excelをパース
    stocks = parse_jpx_excel(excel_data)
    print()

    if not stocks:
        print("❌ No stocks found in Excel file")
        sys.exit(1)

    # 3. DBにUPSERT
    stats = upsert_stocks_to_db(stocks)

    print()
    print("=" * 60)
    print("Summary:")
    print(f"  Added: {stats['added']}")
    print(f"  Updated: {stats['updated']}")
    print(f"  Skipped: {stats['skipped']}")
    print(f"  Total: {len(stocks)}")
    print("=" * 60)
    print()
    print("✅ Stock master sync completed successfully!")


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
