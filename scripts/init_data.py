#!/usr/bin/env python3
"""
初期データ投入スクリプト（並列版・最適化）

日経225全銘柄をDBに登録し、過去2年分の株価データを取得する。
- yfinanceからのデータ取得を並列化
- DBアクセスを最小化（バッチINSERT）
"""

import yfinance as yf
import psycopg2
import psycopg2.extras
import os
import sys
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    print("ERROR: DATABASE_URL environment variable is not set")
    sys.exit(1)

# カウンター用のロック
counter_lock = Lock()
success_count = 0
error_count = 0


def get_nikkei225_stocks():
    """
    日経225の銘柄リスト + 低価格帯補完銘柄
    """
    print("Loading stock list...")
    print(f"  - Nikkei 225 core stocks: {len(NIKKEI225_STOCKS)} stocks")
    print(f"  - Additional low-price stocks: {len(ADDITIONAL_LOW_PRICE_STOCKS)} stocks")

    # 重複を除去して統合
    all_stocks = NIKKEI225_STOCKS + ADDITIONAL_LOW_PRICE_STOCKS
    unique_stocks = []
    seen_tickers = set()

    for ticker, name, market, sector in all_stocks:
        if ticker not in seen_tickers:
            unique_stocks.append((ticker, name, market, sector))
            seen_tickers.add(ticker)

    print(f"  ✓ Total unique stocks: {len(unique_stocks)}")
    return unique_stocks


def fetch_stock_data(stock_info):
    """
    yfinanceから1銘柄のデータを取得（DB操作なし）
    """
    global success_count, error_count

    ticker, name, market, sector = stock_info

    try:
        print(f"[{ticker}] Fetching data from yfinance...")

        # yfinanceから銘柄情報を取得
        stock = yf.Ticker(ticker)
        info = stock.info

        # 時価総額（円 → 億円に変換）
        market_cap = info.get('marketCap')
        market_cap_oku = None
        if market_cap:
            market_cap_oku = market_cap / 100000000

        # 配当利回り（小数 → %に変換）
        dividend_yield = info.get('dividendYield')
        dividend_yield_pct = None
        if dividend_yield:
            dividend_yield_pct = dividend_yield * 100

        # 過去2年分の株価データ取得
        hist = stock.history(period="2y")

        if hist.empty:
            print(f"[{ticker}] ⚠️  No historical data available")
            with counter_lock:
                error_count += 1
            return None

        # 株価データをリスト化
        price_data = []
        for date, row in hist.iterrows():
            price_data.append({
                'date': date.date(),
                'open': float(row['Open']),
                'high': float(row['High']),
                'low': float(row['Low']),
                'close': float(row['Close']),
                'volume': int(row['Volume']),
                'adjusted_close': float(row['Close'])
            })

        market_cap_str = f"{market_cap_oku:.0f}" if market_cap_oku else "0"
        dividend_str = f"{dividend_yield_pct:.2f}" if dividend_yield_pct else "0"
        print(f"[{ticker}] ✓ Fetched {len(price_data)} records (時価総額: {market_cap_str}億円, 配当: {dividend_str}%)")

        with counter_lock:
            success_count += 1

        return {
            'ticker': ticker,
            'name': name,
            'market': market,
            'sector': sector,
            'market_cap': market_cap_oku,
            'dividend_yield': dividend_yield_pct,
            'prices': price_data
        }

    except Exception as e:
        print(f"[{ticker}] ✗ Error: {e}")
        with counter_lock:
            error_count += 1
        return None


def bulk_insert_to_db(stock_data_list):
    """
    取得した全銘柄データを一括でDBに登録
    """
    print("\n" + "=" * 60)
    print("Inserting data to database...")
    print("=" * 60)

    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    try:
        # 1. 銘柄マスタを一括UPSERT
        print("Upserting stock master data...")
        stock_master_data = []
        for data in stock_data_list:
            stock_master_data.append((
                data['ticker'],
                data['name'],
                data['market'],
                data['sector'],
                data['market_cap'],
                data['dividend_yield']
            ))

        # execute_valuesで一括UPSERT
        psycopg2.extras.execute_values(
            cur,
            """
            INSERT INTO "Stock" (id, "tickerCode", name, market, sector, "marketCap", "dividendYield", "createdAt")
            VALUES %s
            ON CONFLICT ("tickerCode") DO UPDATE SET
                "marketCap" = EXCLUDED."marketCap",
                "dividendYield" = EXCLUDED."dividendYield"
            """,
            stock_master_data,
            template="(gen_random_uuid(), %s, %s, %s, %s, %s, %s, NOW())",
            page_size=100
        )
        print(f"  ✓ Upserted {len(stock_master_data)} stocks")

        # 2. 銘柄IDをマッピング（ticker -> stock_id）
        print("Fetching stock IDs...")
        cur.execute('SELECT id, "tickerCode" FROM "Stock"')
        ticker_to_id = {row[1]: row[0] for row in cur.fetchall()}
        print(f"  ✓ Loaded {len(ticker_to_id)} stock IDs")

        # 3. 株価データを一括INSERT
        print("Inserting stock prices...")
        all_price_data = []
        for data in stock_data_list:
            stock_id = ticker_to_id.get(data['ticker'])
            if not stock_id:
                continue

            for price in data['prices']:
                all_price_data.append((
                    stock_id,
                    price['date'],
                    price['open'],
                    price['high'],
                    price['low'],
                    price['close'],
                    price['volume'],
                    price['adjusted_close']
                ))

        # バッチサイズ1000でINSERT
        batch_size = 1000
        inserted_count = 0
        for i in range(0, len(all_price_data), batch_size):
            batch = all_price_data[i:i+batch_size]
            psycopg2.extras.execute_values(
                cur,
                """
                INSERT INTO "StockPrice"
                (id, "stockId", date, open, high, low, close, volume, "adjustedClose", "createdAt")
                VALUES %s
                ON CONFLICT ("stockId", date) DO NOTHING
                """,
                batch,
                template="(gen_random_uuid(), %s, %s, %s, %s, %s, %s, %s, %s, NOW())",
                page_size=batch_size
            )
            inserted_count += len(batch)
            print(f"  Progress: {inserted_count}/{len(all_price_data)} records...")

        print(f"  ✓ Processed {len(all_price_data)} price records")

        conn.commit()
        print("✓ All data committed to database")

    except Exception as e:
        print(f"✗ Database error: {e}")
        conn.rollback()
        raise e
    finally:
        cur.close()
        conn.close()


# 日経225銘柄リスト（2024年版 - 主要銘柄を中心に拡張）
NIKKEI225_STOCKS = [
    # 自動車・輸送機器
    ("7203.T", "トヨタ自動車", "TSE", "輸送用機器"),
    ("7267.T", "本田技研工業", "TSE", "輸送用機器"),
    ("7201.T", "日産自動車", "TSE", "輸送用機器"),
    ("7269.T", "スズキ", "TSE", "輸送用機器"),
    ("7270.T", "SUBARU", "TSE", "輸送用機器"),
    ("7261.T", "マツダ", "TSE", "輸送用機器"),
    ("7211.T", "三菱自動車工業", "TSE", "輸送用機器"),
    ("7272.T", "ヤマハ発動機", "TSE", "輸送用機器"),

    # テクノロジー・通信
    ("9984.T", "ソフトバンクグループ", "TSE", "情報・通信業"),
    ("6758.T", "ソニーグループ", "TSE", "電気機器"),
    ("6861.T", "キーエンス", "TSE", "電気機器"),
    ("9433.T", "KDDI", "TSE", "情報・通信業"),
    ("9432.T", "日本電信電話", "TSE", "情報・通信業"),
    ("6702.T", "富士通", "TSE", "電気機器"),
    ("6503.T", "三菱電機", "TSE", "電気機器"),
    ("6501.T", "日立製作所", "TSE", "電気機器"),
    ("6506.T", "安川電機", "TSE", "電気機器"),
    ("6976.T", "太陽誘電", "TSE", "電気機器"),
    ("6723.T", "ルネサスエレクトロニクス", "TSE", "電気機器"),
    ("6971.T", "京セラ", "TSE", "電気機器"),
    ("6857.T", "アドバンテスト", "TSE", "電気機器"),
    ("6594.T", "日本電産", "TSE", "電気機器"),
    ("4704.T", "トレンドマイクロ", "TSE", "情報・通信業"),

    # 金融
    ("8306.T", "三菱UFJフィナンシャル・グループ", "TSE", "銀行業"),
    ("8316.T", "三井住友フィナンシャルグループ", "TSE", "銀行業"),
    ("8411.T", "みずほフィナンシャルグループ", "TSE", "銀行業"),
    ("8604.T", "野村ホールディングス", "TSE", "証券、商品先物取引業"),
    ("8750.T", "第一生命ホールディングス", "TSE", "保険業"),
    ("8766.T", "東京海上ホールディングス", "TSE", "保険業"),
    ("8725.T", "MS&ADインシュアランスグループホールディングス", "TSE", "保険業"),
    ("8630.T", "SOMPOホールディングス", "TSE", "保険業"),
    ("8058.T", "三菱商事", "TSE", "卸売業"),
    ("8031.T", "三井物産", "TSE", "卸売業"),
    ("8001.T", "伊藤忠商事", "TSE", "卸売業"),
    ("8002.T", "丸紅", "TSE", "卸売業"),
    ("8053.T", "住友商事", "TSE", "卸売業"),

    # 小売・消費
    ("9983.T", "ファーストリテイリング", "TSE", "小売業"),
    ("3382.T", "セブン&アイ・ホールディングス", "TSE", "小売業"),
    ("8267.T", "イオン", "TSE", "小売業"),
    ("2914.T", "日本たばこ産業", "TSE", "食料品"),
    ("3086.T", "J.フロント リテイリング", "TSE", "小売業"),
    ("8233.T", "高島屋", "TSE", "小売業"),
    ("9843.T", "ニトリホールディングス", "TSE", "小売業"),
    ("7608.T", "エスケーホーム", "TSE", "小売業"),
    ("2801.T", "キッコーマン", "TSE", "食料品"),
    ("2503.T", "キリンホールディングス", "TSE", "食料品"),
    ("2502.T", "アサヒグループホールディングス", "TSE", "食料品"),
    ("2501.T", "サッポロホールディングス", "TSE", "食料品"),
    ("2269.T", "明治ホールディングス", "TSE", "食料品"),
    ("2593.T", "伊藤園", "TSE", "食料品"),

    # 製薬・ヘルスケア
    ("4502.T", "武田薬品工業", "TSE", "医薬品"),
    ("4503.T", "アステラス製薬", "TSE", "医薬品"),
    ("4568.T", "第一三共", "TSE", "医薬品"),
    ("4523.T", "エーザイ", "TSE", "医薬品"),
    ("4507.T", "塩野義製薬", "TSE", "医薬品"),
    ("4901.T", "富士フイルムホールディングス", "TSE", "化学"),
    ("7741.T", "HOYA", "TSE", "精密機器"),
    ("7951.T", "ヤマハ", "TSE", "その他製品"),
    ("7911.T", "凸版印刷", "TSE", "その他製品"),
    ("7912.T", "大日本印刷", "TSE", "その他製品"),

    # 鉄鋼・素材
    ("5401.T", "日本製鉄", "TSE", "鉄鋼"),
    ("5411.T", "JFEホールディングス", "TSE", "鉄鋼"),
    ("5201.T", "AGC", "TSE", "ガラス・土石製品"),
    ("5713.T", "住友金属鉱山", "TSE", "非鉄金属"),
    ("5802.T", "住友電気工業", "TSE", "非鉄金属"),
    ("3402.T", "東レ", "TSE", "繊維製品"),
    ("4063.T", "信越化学工業", "TSE", "化学"),
    ("4005.T", "住友化学", "TSE", "化学"),
    ("4042.T", "東ソー", "TSE", "化学"),
    ("4188.T", "三菱ケミカルグループ", "TSE", "化学"),

    # インフラ・エネルギー
    ("9501.T", "東京電力ホールディングス", "TSE", "電気・ガス業"),
    ("9502.T", "中部電力", "TSE", "電気・ガス業"),
    ("9503.T", "関西電力", "TSE", "電気・ガス業"),
    ("9531.T", "東京ガス", "TSE", "電気・ガス業"),
    ("9532.T", "大阪ガス", "TSE", "電気・ガス業"),
    ("1605.T", "INPEX", "TSE", "鉱業"),
    ("5020.T", "ENEOSホールディングス", "TSE", "石油・石炭製品"),

    # 運輸
    ("9020.T", "東日本旅客鉄道", "TSE", "陸運業"),
    ("9022.T", "東海旅客鉄道", "TSE", "陸運業"),
    ("9021.T", "西日本旅客鉄道", "TSE", "陸運業"),
    ("9104.T", "商船三井", "TSE", "海運業"),
    ("9107.T", "川崎汽船", "TSE", "海運業"),
    ("9201.T", "日本航空", "TSE", "空運業"),
    ("9202.T", "ANAホールディングス", "TSE", "空運業"),

    # 建設・不動産
    ("1801.T", "大成建設", "TSE", "建設業"),
    ("1802.T", "大林組", "TSE", "建設業"),
    ("1803.T", "清水建設", "TSE", "建設業"),
    ("1812.T", "鹿島建設", "TSE", "建設業"),
    ("1925.T", "大和ハウス工業", "TSE", "建設業"),
    ("1928.T", "積水ハウス", "TSE", "建設業"),
    ("8801.T", "三井不動産", "TSE", "不動産業"),
    ("8802.T", "三菱地所", "TSE", "不動産業"),
    ("8830.T", "住友不動産", "TSE", "不動産業"),

    # サービス・その他
    ("4324.T", "電通グループ", "TSE", "サービス業"),
    ("4911.T", "資生堂", "TSE", "化学"),
    ("9602.T", "東宝", "TSE", "情報・通信業"),
    ("9613.T", "NTTデータ", "TSE", "情報・通信業"),
    ("2413.T", "エムスリー", "TSE", "サービス業"),
    ("4324.T", "電通グループ", "TSE", "サービス業"),
    ("9735.T", "セコム", "TSE", "サービス業"),
    ("9766.T", "コナミグループ", "TSE", "情報・通信業"),
    ("7974.T", "任天堂", "TSE", "その他製品"),
    ("9684.T", "スクウェア・エニックス・ホールディングス", "TSE", "情報・通信業"),
]

# 低価格帯補完銘柄（3〜10万円の予算でも購入しやすい銘柄を追加）
ADDITIONAL_LOW_PRICE_STOCKS = [
    # 地方銀行
    ("8359.T", "八十二銀行", "TSE", "銀行業"),
    ("8368.T", "百五銀行", "TSE", "銀行業"),
    ("8350.T", "みちのく銀行", "TSE", "銀行業"),

    # 電力・ガス（地方）
    ("9504.T", "中国電力", "TSE", "電気・ガス業"),
    ("9505.T", "北陸電力", "TSE", "電気・ガス業"),
    ("9506.T", "東北電力", "TSE", "電気・ガス業"),
    ("9507.T", "四国電力", "TSE", "電気・ガス業"),
    ("9508.T", "九州電力", "TSE", "電気・ガス業"),
    ("9509.T", "北海道電力", "TSE", "電気・ガス業"),
    ("9533.T", "東邦ガス", "TSE", "電気・ガス業"),

    # 鉄道（地方・私鉄）
    ("9005.T", "東急", "TSE", "陸運業"),
    ("9007.T", "小田急電鉄", "TSE", "陸運業"),
    ("9008.T", "京王電鉄", "TSE", "陸運業"),
    ("9009.T", "京成電鉄", "TSE", "陸運業"),
    ("9041.T", "近鉄グループホールディングス", "TSE", "陸運業"),
    ("9042.T", "阪急阪神ホールディングス", "TSE", "陸運業"),
    ("9044.T", "南海電気鉄道", "TSE", "陸運業"),

    # 小売・生活必需品
    ("8252.T", "丸井グループ", "TSE", "小売業"),
    ("3086.T", "J.フロント リテイリング", "TSE", "小売業"),
    ("8219.T", "青山商事", "TSE", "小売業"),
    ("9983.T", "ファーストリテイリング", "TSE", "小売業"),
    ("3048.T", "ビックカメラ", "TSE", "小売業"),
    ("8179.T", "ロイヤルホールディングス", "TSE", "小売業"),

    # 製造業（中堅）
    ("7201.T", "日産自動車", "TSE", "輸送用機器"),
    ("7211.T", "三菱自動車工業", "TSE", "輸送用機器"),
    ("5411.T", "JFEホールディングス", "TSE", "鉄鋼"),
    ("3436.T", "SUMCO", "TSE", "金属製品"),

    # 通信・IT（中小型）
    ("9434.T", "ソフトバンク", "TSE", "情報・通信業"),
    ("9435.T", "光通信", "TSE", "情報・通信業"),
    ("4751.T", "サイバーエージェント", "TSE", "サービス業"),

    # 不動産・建設（中堅）
    ("8801.T", "三井不動産", "TSE", "不動産業"),
    ("1878.T", "大東建託", "TSE", "建設業"),
    ("1879.T", "新日本建設", "TSE", "建設業"),
]


def main():
    """
    メイン処理
    1. yfinanceから並列でデータ取得
    2. DBへ一括登録
    """
    print(f"[{datetime.now()}] Starting optimized stock data initialization")
    print("=" * 60)

    stocks_list = get_nikkei225_stocks()
    total_stocks = len(stocks_list)

    print(f"\nPhase 1: Fetching data from yfinance (parallel)")
    print("=" * 60)

    # フェーズ1: yfinanceから並列でデータ取得
    stock_data_list = []
    max_workers = 10
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(fetch_stock_data, stock): stock for stock in stocks_list}

        for future in as_completed(futures):
            result = future.result()
            if result:
                stock_data_list.append(result)

    print(f"\n✓ Fetched data for {len(stock_data_list)} stocks")

    if len(stock_data_list) == 0:
        print("ERROR: No stock data fetched")
        sys.exit(1)

    # フェーズ2: DBへ一括登録
    print(f"\nPhase 2: Bulk insert to database")
    bulk_insert_to_db(stock_data_list)

    print("\n" + "=" * 60)
    print(f"[{datetime.now()}] Initialization complete!")
    print(f"  Success: {success_count}")
    print(f"  Errors: {error_count}")
    print(f"  Total: {total_stocks}")

    if error_count > total_stocks * 0.3:
        print(f"\nWARNING: Too many stocks failed to initialize ({error_count}/{total_stocks})")
        sys.exit(1)


if __name__ == "__main__":
    main()
