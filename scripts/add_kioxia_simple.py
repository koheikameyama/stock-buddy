#!/usr/bin/env python3
"""
キオクシア（6600.T）を手動で追加するスクリプト（シンプル版）
yfinanceでデータが取得できない場合でも、手動で登録
"""

import os
import sys
import psycopg2
from decimal import Decimal
import secrets
import time

def add_kioxia(db_url: str):
    """キオクシアをデータベースに追加"""
    try:
        conn = psycopg2.connect(db_url)
        cur = conn.cursor()

        ticker = "6600.T"

        # 既存チェック
        cur.execute('SELECT id, name FROM "Stock" WHERE "tickerCode" = %s', (ticker,))
        existing = cur.fetchone()

        if existing:
            print(f"⚠️  {ticker} は既に登録されています")
            print(f"   ID: {existing[0]}")
            print(f"   名前: {existing[1]}")
            cur.close()
            conn.close()
            return existing[0]

        # キオクシアのデータ（手動設定）
        # 2026年2月時点の情報
        stock_data = {
            'ticker': '6600.T',
            'name': 'キオクシアホールディングス',
            'market': '東証プライム',
            'sector': 'Technology',
            'beginner_score': 65,  # IPO銘柄、半導体セクター、成長性あり
        }

        print(f"\n📝 {ticker} を登録します...")
        print(f"   名前: {stock_data['name']}")
        print(f"   市場: {stock_data['market']}")
        print(f"   セクター: {stock_data['sector']}")
        print(f"   初心者スコア: {stock_data['beginner_score']}/100")

        # CUID生成（Prismaと互換性のある形式）
        # 簡易版: ランダム文字列（本来はcuidライブラリを使うべきだが、簡略化のため）
        timestamp = int(time.time() * 1000)
        random_part = secrets.token_hex(12)
        stock_id = f"cl{hex(timestamp)[2:]}{random_part}"[:25]

        # 銘柄を追加
        cur.execute("""
            INSERT INTO "Stock" (
                id,
                "tickerCode",
                name,
                market,
                sector,
                "beginnerScore",
                "createdAt"
            ) VALUES (%s, %s, %s, %s, %s, %s, NOW())
            RETURNING id
        """, (
            stock_id,
            stock_data['ticker'],
            stock_data['name'],
            stock_data['market'],
            stock_data['sector'],
            stock_data['beginner_score']
        ))

        stock_id = cur.fetchone()[0]
        conn.commit()

        print(f"\n✅ {ticker} を追加しました（ID: {stock_id}）")

        cur.close()
        conn.close()

        return stock_id

    except Exception as e:
        print(f"❌ データベースエラー: {e}")
        if conn:
            conn.rollback()
            conn.close()
        sys.exit(1)

def main():
    print("🚀 キオクシア（6600.T）の登録を開始します...\n")

    # データベースに追加
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("❌ DATABASE_URL環境変数が設定されていません")
        sys.exit(1)

    stock_id = add_kioxia(db_url)

    print(f"\n🎉 完了！")
    print(f"\n💡 株価データは別途取得スクリプトで追加してください")
    print(f"   または、次回のデータ更新時に自動で追加されます")

if __name__ == "__main__":
    main()
