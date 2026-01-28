#!/usr/bin/env python3
"""
初期データ投入スクリプト

日経225全銘柄をDBに登録し、過去2年分の株価データを取得する。
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
    ("2002.T", "日清製粉グループ本社", "TSE", "食料品"),
    ("2269.T", "明治ホールディングス", "TSE", "食料品"),

    # 製薬・ヘルスケア
    ("4568.T", "第一三共", "TSE", "医薬品"),
    ("4502.T", "武田薬品工業", "TSE", "医薬品"),
    ("4503.T", "アステラス製薬", "TSE", "医薬品"),
    ("4507.T", "塩野義製薬", "TSE", "医薬品"),
    ("4523.T", "エーザイ", "TSE", "医薬品"),
    ("4452.T", "花王", "TSE", "化学"),
    ("4911.T", "資生堂", "TSE", "化学"),

    # エネルギー・素材
    ("5019.T", "出光興産", "TSE", "石油・石炭製品"),
    ("5020.T", "ENEOSホールディングス", "TSE", "石油・石炭製品"),
    ("5401.T", "日本製鉄", "TSE", "鉄鋼"),
    ("4063.T", "信越化学工業", "TSE", "化学"),
    ("4188.T", "三菱ケミカルグループ", "TSE", "化学"),
    ("4005.T", "住友化学", "TSE", "化学"),
    ("3407.T", "旭化成", "TSE", "化学"),
    ("4183.T", "三井化学", "TSE", "化学"),
    ("4021.T", "日産化学", "TSE", "化学"),
    ("5411.T", "JFEホールディングス", "TSE", "鉄鋼"),
    ("5713.T", "住友金属鉱山", "TSE", "非鉄金属"),
    ("5802.T", "住友電気工業", "TSE", "非鉄金属"),
    ("3402.T", "東レ", "TSE", "繊維製品"),
    ("3401.T", "帝人", "TSE", "繊維製品"),

    # 製造業・機械
    ("6301.T", "小松製作所", "TSE", "機械"),
    ("6305.T", "日立建機", "TSE", "機械"),
    ("7751.T", "キヤノン", "TSE", "電気機器"),
    ("7974.T", "任天堂", "TSE", "その他製品"),
    ("7733.T", "オリンパス", "TSE", "精密機器"),
    ("7741.T", "HOYA", "TSE", "精密機器"),
    ("4543.T", "テルモ", "TSE", "精密機器"),
    ("6367.T", "ダイキン工業", "TSE", "機械"),
    ("6326.T", "クボタ", "TSE", "機械"),
    ("7012.T", "川崎重工業", "TSE", "輸送用機器"),
    ("7011.T", "三菱重工業", "TSE", "機械"),
    ("6902.T", "デンソー", "TSE", "輸送用機器"),
    ("5108.T", "ブリヂストン", "TSE", "ゴム製品"),
    ("7259.T", "アイシン", "TSE", "輸送用機器"),
    ("5803.T", "フジクラ", "TSE", "非鉄金属"),

    # 不動産・建設
    ("8801.T", "三井不動産", "TSE", "不動産業"),
    ("8802.T", "三菱地所", "TSE", "不動産業"),
    ("1925.T", "大和ハウス工業", "TSE", "建設業"),
    ("1928.T", "積水ハウス", "TSE", "建設業"),
    ("1801.T", "大成建設", "TSE", "建設業"),
    ("1802.T", "大林組", "TSE", "建設業"),
    ("1803.T", "清水建設", "TSE", "建設業"),
    ("5332.T", "TOTO", "TSE", "ガラス・土石製品"),
    ("5333.T", "日本碍子", "TSE", "ガラス・土石製品"),

    # 海運・物流・運輸
    ("9101.T", "日本郵船", "TSE", "海運業"),
    ("9104.T", "商船三井", "TSE", "海運業"),
    ("9107.T", "川崎汽船", "TSE", "海運業"),
    ("9020.T", "東日本旅客鉄道", "TSE", "陸運業"),
    ("9022.T", "東海旅客鉄道", "TSE", "陸運業"),
    ("9021.T", "西日本旅客鉄道", "TSE", "陸運業"),
    ("9142.T", "九州旅客鉄道", "TSE", "陸運業"),
    ("9301.T", "三菱倉庫", "TSE", "倉庫・運輸関連業"),
    ("9064.T", "ヤマトホールディングス", "TSE", "陸運業"),
    ("9062.T", "日本通運", "TSE", "陸運業"),
    ("9202.T", "ANAホールディングス", "TSE", "空運業"),
    ("9201.T", "日本航空", "TSE", "空運業"),

    # 電力・ガス
    ("9501.T", "東京電力ホールディングス", "TSE", "電気・ガス業"),
    ("9502.T", "中部電力", "TSE", "電気・ガス業"),
    ("9503.T", "関西電力", "TSE", "電気・ガス業"),
    ("9531.T", "東京ガス", "TSE", "電気・ガス業"),
    ("9532.T", "大阪ガス", "TSE", "電気・ガス業"),

    # サービス・その他
    ("9602.T", "東宝", "TSE", "情報・通信業"),
    ("4324.T", "電通グループ", "TSE", "サービス業"),
    ("4661.T", "オリエンタルランド", "TSE", "サービス業"),
    ("2413.T", "エムスリー", "TSE", "サービス業"),
    ("4768.T", "大塚商会", "TSE", "情報・通信業"),
    ("9735.T", "セコム", "TSE", "サービス業"),
    ("9766.T", "コナミグループ", "TSE", "情報・通信業"),
    ("6178.T", "日本郵政", "TSE", "サービス業"),
]


# 低価格帯補完銘柄
# 詳細な選定基準は scripts/STOCK_SELECTION_CRITERIA.md を参照
# 目的: 3万円、5万円、10万円の少額予算でも購入可能な銘柄を提供
ADDITIONAL_LOW_PRICE_STOCKS = [
    # 地方銀行（価格帯: 1-3万円、安定配当、地域密着）
    # 理由: 配当利回り3-5%、地域経済の代表、長期保有向け
    ("8354.T", "ふくおかフィナンシャルグループ", "TSE", "銀行業"),  # 九州最大手地銀
    ("7186.T", "コンコルディア・フィナンシャルグループ", "TSE", "銀行業"),  # 横浜銀行系
    ("8515.T", "アイフル", "TSE", "その他金融業"),  # 消費者金融大手
    ("8583.T", "三菱UFJリース", "TSE", "その他金融業"),  # リース業界大手
    ("8424.T", "芙蓉総合リース", "TSE", "その他金融業"),  # リース業界準大手

    # 電力・ガス（価格帯: 1-3万円、インフラ、配当安定）
    # 理由: 公共インフラ、景気に左右されにくい、高配当
    ("9505.T", "北陸電力", "TSE", "電気・ガス業"),  # 北陸エリア
    ("9506.T", "東北電力", "TSE", "電気・ガス業"),  # 東北エリア
    ("9508.T", "九州電力", "TSE", "電気・ガス業"),  # 九州エリア
    ("9509.T", "北海道電力", "TSE", "電気・ガス業"),  # 北海道エリア
    ("9511.T", "沖縄電力", "TSE", "電気・ガス業"),  # 沖縄エリア

    # 鉄道（価格帯: 3-7万円、安定収益、不動産事業も）
    # 理由: 通勤・通学需要が安定、沿線開発による収益
    ("9005.T", "東急", "TSE", "陸運業"),  # 東京・神奈川の私鉄
    ("9006.T", "京浜急行電鉄", "TSE", "陸運業"),  # 東京・神奈川の私鉄
    ("9007.T", "小田急電鉄", "TSE", "陸運業"),  # 東京・神奈川の私鉄
    ("9008.T", "京王電鉄", "TSE", "陸運業"),  # 東京の私鉄
    ("9009.T", "京成電鉄", "TSE", "陸運業"),  # 東京・千葉の私鉄
    ("9041.T", "近鉄グループホールディングス", "TSE", "陸運業"),  # 近畿圏の私鉄
    ("9042.T", "阪急阪神ホールディングス", "TSE", "陸運業"),  # 関西の私鉄
    ("9044.T", "南海電気鉄道", "TSE", "陸運業"),  # 大阪の私鉄

    # 不動産（価格帯: 3-7万円、REITに近い安定性）
    # 理由: 賃貸収入で安定、都市開発の恩恵
    ("3231.T", "野村不動産ホールディングス", "TSE", "不動産業"),  # 不動産大手
    ("8841.T", "テーオーシー", "TSE", "不動産業"),  # 商業施設運営
    ("8892.T", "日本エスコン", "TSE", "不動産業"),  # マンション開発

    # 小売・生活関連（価格帯: 2-5万円、身近で理解しやすい）
    # 理由: 日常生活で利用、業績が理解しやすい
    ("8252.T", "丸井グループ", "TSE", "小売業"),  # 百貨店・クレジットカード
    ("3197.T", "すかいらーくホールディングス", "TSE", "小売業"),  # ファミレス大手
    ("3382.T", "セブン&アイ・ホールディングス", "TSE", "小売業"),  # コンビニ最大手（再掲）
    ("9843.T", "ニトリホールディングス", "TSE", "小売業"),  # 家具・インテリア
    ("7532.T", "ドンキホーテホールディングス", "TSE", "小売業"),  # ディスカウントストア
    ("3028.T", "アルペン", "TSE", "小売業"),  # スポーツ用品
    ("8227.T", "しまむら", "TSE", "小売業"),  # 衣料品チェーン

    # 通信・IT（価格帯: 3-6万円、デジタル化の恩恵）
    # 理由: 成長分野、安定した需要
    ("4689.T", "ヤフー", "TSE", "情報・通信業"),  # ポータルサイト・広告
    ("2432.T", "ディー・エヌ・エー", "TSE", "情報・通信業"),  # ゲーム・ヘルスケア
    ("3659.T", "ネクソン", "TSE", "情報・通信業"),  # オンラインゲーム

    # 製造業（価格帯: 3-8万円、日本の基幹産業）
    # 理由: 輸出企業、グローバル展開
    ("5406.T", "神戸製鋼所", "TSE", "鉄鋼"),  # 鉄鋼大手
    ("5301.T", "東海カーボン", "TSE", "ガラス・土石製品"),  # カーボン製品
    ("5631.T", "日本製鋼所", "TSE", "機械"),  # 産業機械

    # 化学（価格帯: 3-8万円、素材メーカー）
    # 理由: B2Bだが業界大手、安定需要
    ("4182.T", "三菱ガス化学", "TSE", "化学"),  # 化学品メーカー
    ("4208.T", "宇部興産", "TSE", "化学"),  # 総合化学
]


def init_stocks():
    """
    日経225全銘柄をDBに登録し、過去2年分の株価データを取得
    """
    try:
        print(f"[{datetime.now()}] Starting initial data population...")

        # 日経225銘柄リストを取得
        stocks_list = get_nikkei225_stocks()
        print(f"Processing {len(stocks_list)} stocks...")

        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()

        success_count = 0
        error_count = 0

        for ticker, name, market, sector in stocks_list:
            try:
                print(f"\nInitializing {ticker} - {name}...")

                # yfinanceから銘柄情報を取得
                stock = yf.Ticker(ticker)
                info = stock.info

                # 時価総額（円 → 億円に変換）
                market_cap = info.get('marketCap')
                market_cap_oku = None
                if market_cap:
                    market_cap_oku = market_cap / 100000000  # 円 → 億円

                # 配当利回り（小数 → %に変換）
                dividend_yield = info.get('dividendYield')
                dividend_yield_pct = None
                if dividend_yield:
                    dividend_yield_pct = dividend_yield * 100  # 0.0284 → 2.84%

                # 銘柄マスタ登録
                cur.execute("""
                    INSERT INTO "Stock" (id, "tickerCode", name, market, sector, "marketCap", "dividendYield", "createdAt")
                    VALUES (gen_random_uuid(), %s, %s, %s, %s, %s, %s, NOW())
                    ON CONFLICT ("tickerCode") DO UPDATE SET
                        "marketCap" = EXCLUDED."marketCap",
                        "dividendYield" = EXCLUDED."dividendYield"
                    RETURNING id
                """, (ticker, name, market, sector, market_cap_oku, dividend_yield_pct))

                result = cur.fetchone()
                if result:
                    stock_id = result[0]
                    print(f"  ✓ Stock registered (時価総額: {market_cap_oku:.0f if market_cap_oku else 0}億円, 配当: {dividend_yield_pct:.2f if dividend_yield_pct else 0}%)")
                else:
                    # 既存レコードのIDを取得
                    cur.execute('SELECT id FROM "Stock" WHERE "tickerCode" = %s', (ticker,))
                    stock_id = cur.fetchone()[0]
                    print(f"  ℹ️  Stock already exists with ID: {stock_id}")

                # 過去2年分の株価データ取得
                print(f"  Fetching 2 years of historical data...")
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
        print(f"  Total: {len(stocks_list)}")

        if error_count > len(stocks_list) * 0.3:
            print(f"\nWARNING: Too many stocks failed to initialize ({error_count}/{len(stocks_list)})")
            sys.exit(1)

    except Exception as e:
        print(f"Fatal error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    init_stocks()
