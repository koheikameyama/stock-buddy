#!/usr/bin/env python3
"""
初期データ投入スクリプト

主要銘柄（日経225の主要株など）をDBに登録し、過去2年分の株価データを取得する。
"""

import yfinance as yf
import psycopg2
import os
import sys
from datetime import datetime


DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    print("ERROR: DATABASE_URL environment variable is not set")
    sys.exit(1)


# 主要銘柄（日経225の主要株）
MAJOR_STOCKS = [
    # 自動車・輸送機器
    ("7203.T", "トヨタ自動車", "TSE", "輸送用機器"),
    ("7267.T", "本田技研工業", "TSE", "輸送用機器"),
    ("7201.T", "日産自動車", "TSE", "輸送用機器"),

    # テクノロジー・通信
    ("9984.T", "ソフトバンクグループ", "TSE", "情報・通信業"),
    ("6758.T", "ソニーグループ", "TSE", "電気機器"),
    ("6861.T", "キーエンス", "TSE", "電気機器"),
    ("9433.T", "KDDI", "TSE", "情報・通信業"),
    ("9437.T", "NTTドコモ", "TSE", "情報・通信業"),
    ("6702.T", "富士通", "TSE", "電気機器"),
    ("6503.T", "三菱電機", "TSE", "電気機器"),

    # 金融
    ("8306.T", "三菱UFJフィナンシャル・グループ", "TSE", "銀行業"),
    ("8316.T", "三井住友フィナンシャルグループ", "TSE", "銀行業"),
    ("8411.T", "みずほフィナンシャルグループ", "TSE", "銀行業"),
    ("8604.T", "野村ホールディングス", "TSE", "証券、商品先物取引業"),

    # 小売・消費
    ("9983.T", "ファーストリテイリング", "TSE", "小売業"),
    ("3382.T", "セブン&アイ・ホールディングス", "TSE", "小売業"),
    ("8267.T", "イオン", "TSE", "小売業"),
    ("2914.T", "日本たばこ産業", "TSE", "食料品"),

    # 製薬・ヘルスケア
    ("4568.T", "第一三共", "TSE", "医薬品"),
    ("4502.T", "武田薬品工業", "TSE", "医薬品"),
    ("4503.T", "アステラス製薬", "TSE", "医薬品"),

    # エネルギー・素材
    ("5019.T", "出光興産", "TSE", "石油・石炭製品"),
    ("5020.T", "ENEOSホールディングス", "TSE", "石油・石炭製品"),
    ("5401.T", "日本製鉄", "TSE", "鉄鋼"),
    ("4063.T", "信越化学工業", "TSE", "化学"),

    # 製造業
    ("6301.T", "小松製作所", "TSE", "機械"),
    ("6305.T", "日立建機", "TSE", "機械"),
    ("7751.T", "キヤノン", "TSE", "電気機器"),
    ("7974.T", "任天堂", "TSE", "その他製品"),

    # 不動産・建設
    ("8801.T", "三井不動産", "TSE", "不動産業"),
    ("8802.T", "三菱地所", "TSE", "不動産業"),
    ("1925.T", "大和ハウス工業", "TSE", "建設業"),

    # 海運・物流
    ("9101.T", "日本郵船", "TSE", "海運業"),
    ("9104.T", "商船三井", "TSE", "海運業"),
    ("9432.T", "日本電信電話", "TSE", "情報・通信業"),
]


def init_stocks():
    """
    主要銘柄をDBに登録し、過去2年分の株価データを取得
    """
    try:
        print(f"[{datetime.now()}] Starting initial data population...")
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()

        success_count = 0
        error_count = 0

        for ticker, name, market, sector in MAJOR_STOCKS:
            try:
                print(f"\nInitializing {ticker} - {name}...")

                # 銘柄マスタ登録
                cur.execute("""
                    INSERT INTO "Stock" (id, "tickerCode", name, market, sector, "createdAt")
                    VALUES (gen_random_uuid(), %s, %s, %s, %s, NOW())
                    ON CONFLICT ("tickerCode") DO NOTHING
                    RETURNING id
                """, (ticker, name, market, sector))

                result = cur.fetchone()
                if result:
                    stock_id = result[0]
                    print(f"  ✓ Stock registered with ID: {stock_id}")
                else:
                    # 既存レコードのIDを取得
                    cur.execute('SELECT id FROM "Stock" WHERE "tickerCode" = %s', (ticker,))
                    stock_id = cur.fetchone()[0]
                    print(f"  ℹ️  Stock already exists with ID: {stock_id}")

                # 過去2年分の株価データ取得
                print(f"  Fetching 2 years of historical data...")
                stock = yf.Ticker(ticker)
                hist = stock.history(period="2y")

                if hist.empty:
                    print(f"  ⚠️  No historical data available for {ticker}")
                    error_count += 1
                    continue

                inserted_count = 0
                for date, row in hist.iterrows():
                    try:
                        cur.execute("""
                            INSERT INTO "StockPrice"
                            (id, "stockId", date, open, high, low, close, volume, "adjustedClose", "createdAt")
                            VALUES (gen_random_uuid(), %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                            ON CONFLICT ("stockId", date) DO NOTHING
                        """, (
                            stock_id,
                            date.date(),
                            float(row['Open']),
                            float(row['High']),
                            float(row['Low']),
                            float(row['Close']),
                            int(row['Volume']),
                            float(row['Close'])
                        ))
                        if cur.rowcount > 0:
                            inserted_count += 1
                    except Exception as e:
                        print(f"    ⚠️  Error inserting data for {date.date()}: {e}")
                        continue

                conn.commit()
                print(f"  ✓ {ticker} initialized with {inserted_count} records")
                success_count += 1

            except Exception as e:
                print(f"  ✗ Error initializing {ticker}: {e}")
                conn.rollback()
                error_count += 1
                continue

        cur.close()
        conn.close()

        print(f"\n[{datetime.now()}] Initialization complete!")
        print(f"  Success: {success_count}")
        print(f"  Errors: {error_count}")
        print(f"  Total: {len(MAJOR_STOCKS)}")

        if error_count > 0:
            print(f"\nWARNING: Some stocks failed to initialize")
            sys.exit(1)

    except Exception as e:
        print(f"Fatal error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    init_stocks()
