#!/usr/bin/env python3
"""
全銘柄の株価データを取得してDBに保存するスクリプト

yfinanceを使用して株価を取得し、Stockテーブルの最新価格カラムを更新する。
"""

import os
import sys
import time
from datetime import datetime

import psycopg2
import psycopg2.extras
import yfinance as yf

# 設定
CONFIG = {
    "MIN_VOLUME": 100000,       # 最低出来高
    "MIN_WEEK_CHANGE": -10,    # 週間下落率の下限（%）
    "BATCH_SIZE": 100,         # DB更新のバッチサイズ
}


def get_database_url() -> str:
    """データベースURLを取得"""
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("Error: DATABASE_URL environment variable not set")
        sys.exit(1)
    return url


def fetch_stocks(conn) -> list[dict]:
    """DBから銘柄一覧を取得"""
    with conn.cursor() as cur:
        cur.execute('''
            SELECT id, "tickerCode"
            FROM "Stock"
            ORDER BY "marketCap" DESC NULLS LAST
        ''')
        rows = cur.fetchall()

    return [{"id": row[0], "tickerCode": row[1]} for row in rows]


def fetch_price_data(ticker_code: str) -> dict | None:
    """yfinanceで株価データを取得"""
    try:
        # 既に.Tサフィックスがある場合はそのまま使用
        symbol = ticker_code if ticker_code.endswith(".T") else f"{ticker_code}.T"
        ticker = yf.Ticker(symbol)

        # 過去1ヶ月のデータを取得
        hist = ticker.history(period="1mo")

        if hist.empty or len(hist) < 2:
            return None

        # 直近の株価と出来高
        latest = hist.iloc[-1]
        latest_price = float(latest["Close"])
        volume = int(latest["Volume"])

        # 1週間前（5営業日前）の株価
        week_ago_idx = min(4, len(hist) - 1)
        week_ago_price = float(hist.iloc[-(week_ago_idx + 1)]["Close"])

        # 週間変化率
        change_rate = ((latest_price - week_ago_price) / week_ago_price) * 100

        # ボラティリティ計算（30日間の標準偏差/平均）
        volatility = None
        if len(hist) >= 20:
            close_prices = hist["Close"].values
            avg_price = close_prices.mean()
            if avg_price > 0:
                std_dev = close_prices.std()
                volatility = round((std_dev / avg_price) * 100, 2)

        # 出来高比率（直近3日 vs 4-30日前）
        volume_ratio = None
        if len(hist) >= 10:
            volumes = hist["Volume"].values
            recent_volumes = volumes[-3:]  # 直近3日
            older_volumes = volumes[:-3]    # それより前
            if len(older_volumes) > 0:
                recent_avg = recent_volumes.mean()
                older_avg = older_volumes.mean()
                if older_avg > 0:
                    volume_ratio = round(recent_avg / older_avg, 2)

        return {
            "latestPrice": latest_price,
            "latestVolume": volume,
            "weekChangeRate": round(change_rate, 2),
            "volatility": volatility,
            "volumeRatio": volume_ratio,
        }
    except Exception:
        return None


def update_stock_prices(conn, updates: list[dict]) -> int:
    """株価データをバッチ更新"""
    if not updates:
        return 0

    with conn.cursor() as cur:
        now = datetime.utcnow()
        data = [
            (
                u["latestPrice"],
                u["latestVolume"],
                u["weekChangeRate"],
                u.get("volatility"),
                u.get("volumeRatio"),
                now,
                u["id"]
            )
            for u in updates
        ]
        psycopg2.extras.execute_batch(
            cur,
            '''
            UPDATE "Stock"
            SET "latestPrice" = %s,
                "latestVolume" = %s,
                "weekChangeRate" = %s,
                "volatility" = %s,
                "volumeRatio" = %s,
                "priceUpdatedAt" = %s
            WHERE id = %s
            ''',
            data,
            page_size=CONFIG["BATCH_SIZE"]
        )
    conn.commit()
    return len(updates)


def main():
    print("=" * 60)
    print("Stock Price Fetcher (Python)")
    print("=" * 60)
    print(f"Time: {datetime.now().isoformat()}")
    print(f"Config:")
    print(f"  - MIN_VOLUME: {CONFIG['MIN_VOLUME']:,}")
    print(f"  - MIN_WEEK_CHANGE: {CONFIG['MIN_WEEK_CHANGE']}%")
    print()

    # DB接続
    db_url = get_database_url()
    conn = psycopg2.connect(db_url)

    try:
        # 銘柄一覧を取得
        stocks = fetch_stocks(conn)
        print(f"Found {len(stocks)} stocks")

        # 株価データを取得・更新
        updates = []
        processed = 0
        total_updated = 0
        errors = 0
        filtered_out = 0

        for stock in stocks:
            processed += 1

            price_data = fetch_price_data(stock["tickerCode"])

            if price_data:
                # フィルタ適用
                if price_data["latestVolume"] >= CONFIG["MIN_VOLUME"] and \
                   price_data["weekChangeRate"] >= CONFIG["MIN_WEEK_CHANGE"]:
                    updates.append({
                        "id": stock["id"],
                        **price_data,
                    })
                else:
                    filtered_out += 1
            else:
                errors += 1

            # 進捗表示（100件ごと）
            if processed % 100 == 0:
                print(f"  Progress: {processed}/{len(stocks)} (updates: {len(updates)}, filtered: {filtered_out}, errors: {errors})")

            # バッチ更新（500件ごと）
            if len(updates) >= 500:
                updated = update_stock_prices(conn, updates)
                total_updated += updated
                print(f"  Batch update: {updated} stocks")
                updates = []

            # レート制限対策（50ms待機）
            time.sleep(0.05)

        # 残りを更新
        if updates:
            updated = update_stock_prices(conn, updates)
            total_updated += updated
            print(f"  Final batch update: {updated} stocks")

        print()
        print(f"Completed: {processed} stocks processed")
        print(f"  - Total updated: {total_updated}")
        print(f"  - Filtered out: {filtered_out}")
        print(f"  - Errors: {errors}")
        print("=" * 60)

    finally:
        conn.close()


if __name__ == "__main__":
    main()
