#!/usr/bin/env python3
"""
ニュースから抽出された銘柄コードをStockマスターと同期するスクリプト

- trending_stock_codes.jsonから銘柄コードを読み取る
- Stockマスターに存在しない銘柄をリストアップ
- 管理者が手動で銘柄を追加できるようJSONファイルを出力

Usage:
    DATABASE_URL="postgresql://..." python scripts/news/sync_trending_stocks.py
"""

import sys
import os
import json
import psycopg2
from typing import List, Set
from datetime import datetime

# データベース接続
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("❌ Error: DATABASE_URL environment variable is required")
    sys.exit(1)


def load_trending_codes(file_path: str = "scripts/news/trending_stock_codes.json") -> List[str]:
    """話題の銘柄コードを読み込む"""
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data.get("stock_codes", [])
    except FileNotFoundError:
        print(f"❌ Error: {file_path} not found. Run fetch_news.py first.")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Error loading trending codes: {e}")
        sys.exit(1)


def get_existing_stock_codes(cur) -> Set[str]:
    """Stockマスターから既存の銘柄コードを取得"""
    cur.execute('SELECT "tickerCode" FROM "Stock"')
    return {row[0].replace(".T", "") for row in cur.fetchall()}




def main():
    """メイン処理"""
    print("=" * 60)
    print("Sync Trending Stocks to Database")
    print("=" * 60)

    # 話題の銘柄コードを読み込む
    trending_codes = load_trending_codes()
    print(f"\nℹ️  Trending stock codes: {len(trending_codes)}")
    print(f"   {trending_codes[:10]}...")  # 最初の10個を表示

    # データベース接続
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    # 既存の銘柄コードを取得
    existing_codes = get_existing_stock_codes(cur)
    print(f"\nℹ️  Existing stocks in database: {len(existing_codes)}")

    # マスターにない銘柄を特定
    new_codes = [code for code in trending_codes if code not in existing_codes]
    print(f"\n📊 Missing stocks in database: {len(new_codes)}")

    if not new_codes:
        print("✅ All trending stocks already exist in the database.")
        # trending_codesをJSONファイルに出力（次のステップで使用）
        output_file = "scripts/news/trending_stocks_in_db.json"
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump({
                "timestamp": datetime.now().isoformat(),
                "stock_codes": sorted(trending_codes),
                "count": len(trending_codes),
            }, f, ensure_ascii=False, indent=2)
        print(f"✅ Trending stocks saved to {output_file}")
    else:
        print(f"\n⚠️  The following {len(new_codes)} stocks are NOT in the database:")
        print(f"   {sorted(new_codes)}")

        # 不足している銘柄をJSONファイルに出力
        output_file = "scripts/news/missing_stocks.json"
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump({
                "timestamp": datetime.now().isoformat(),
                "missing_codes": sorted(new_codes),
                "count": len(new_codes),
                "note": "These stocks need to be added manually to the database via JPX master data update"
            }, f, ensure_ascii=False, indent=2)
        print(f"\n📋 Missing stocks list saved to {output_file}")
        print(f"💡 Tip: Update JPX master data to add these stocks automatically")

        # DB内に存在する話題の銘柄のみを出力
        existing_trending_codes = [code for code in trending_codes if code in existing_codes]
        output_file = "scripts/news/trending_stocks_in_db.json"
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump({
                "timestamp": datetime.now().isoformat(),
                "stock_codes": sorted(existing_trending_codes),
                "count": len(existing_trending_codes),
            }, f, ensure_ascii=False, indent=2)
        print(f"✅ Trending stocks in DB ({len(existing_trending_codes)}) saved to {output_file}")

    cur.close()
    conn.close()

    print(f"\n{'=' * 60}")
    print(f"✅ Sync completed")
    print(f"   - Trending: {len(trending_codes)}")
    print(f"   - In DB: {len(trending_codes) - len(new_codes)}")
    print(f"   - Missing: {len(new_codes)}")
    print(f"{'=' * 60}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
