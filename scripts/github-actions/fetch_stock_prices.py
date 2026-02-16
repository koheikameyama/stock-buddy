#!/usr/bin/env python3
"""
全銘柄の株価データを取得してDBに保存するスクリプト（最適化版）

yf.download() バッチAPIを使用して一括取得し、Stockテーブルの最新価格カラムを更新する。

最適化ポイント:
- yf.download() で一括取得（個別Ticker.history()の数十倍高速）
- --user-stocks-only フラグでユーザー関連銘柄のみに絞り込み可能
- バッチサイズごとに分割してメモリ効率化
"""

import argparse
import os
import sys
import time
from datetime import datetime, timezone

import numpy as np
import psycopg2
import psycopg2.extras
import yfinance as yf

# 設定
CONFIG = {
    "MIN_VOLUME": 100000,       # 最低出来高
    "MIN_WEEK_CHANGE": -10,     # 週間下落率の下限（%）
    "DOWNLOAD_BATCH_SIZE": 500, # yf.download() 1回あたりの最大銘柄数
    "DB_BATCH_SIZE": 100,       # DB更新のバッチサイズ
}


def get_database_url() -> str:
    """データベースURLを取得"""
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("Error: DATABASE_URL environment variable not set")
        sys.exit(1)
    return url


def fetch_stocks(conn, user_stocks_only: bool = False) -> list[dict]:
    """DBから銘柄一覧を取得

    user_stocks_only=True の場合、ユーザーに関連する銘柄のみ取得
    （ポートフォリオ/ウォッチリスト/追跡中 + 今日のおすすめ/注目銘柄）
    """
    with conn.cursor() as cur:
        if user_stocks_only:
            cur.execute('''
                SELECT DISTINCT s.id, s."tickerCode"
                FROM "Stock" s
                WHERE s.id IN (
                    SELECT "stockId" FROM "PortfolioStock"
                    UNION
                    SELECT "stockId" FROM "WatchlistStock"
                    UNION
                    SELECT "stockId" FROM "TrackedStock"
                    UNION
                    SELECT "stockId" FROM "UserDailyRecommendation" WHERE date = CURRENT_DATE
                    UNION
                    SELECT "stockId" FROM "DailyFeaturedStock" WHERE date = CURRENT_DATE
                )
                ORDER BY s."tickerCode"
            ''')
        else:
            cur.execute('''
                SELECT id, "tickerCode"
                FROM "Stock"
                ORDER BY "marketCap" DESC NULLS LAST
            ''')
        rows = cur.fetchall()

    return [{"id": row[0], "tickerCode": row[1]} for row in rows]


def ensure_ticker_suffix(ticker_code: str) -> str:
    """東証銘柄の .T サフィックスを確保"""
    return ticker_code if ticker_code.endswith(".T") else f"{ticker_code}.T"


def download_batch(symbols: list[str]) -> dict:
    """yf.download() で一括取得し、銘柄別の価格データを返す"""
    if not symbols:
        return {}

    try:
        df = yf.download(
            symbols,
            period="1mo",
            group_by="ticker",
            threads=True,
            progress=False,
        )
    except Exception as e:
        print(f"  Error in yf.download: {e}")
        return {}

    if df.empty:
        return {}

    results = {}

    # 1銘柄だけの場合、group_by="ticker" でもカラムがフラットになる
    if len(symbols) == 1:
        symbol = symbols[0]
        hist = df
        price_data = _compute_price_data(hist)
        if price_data:
            results[symbol] = price_data
        return results

    for symbol in symbols:
        try:
            hist = df[symbol]
        except (KeyError, TypeError):
            continue

        # NaN行を除去
        hist = hist.dropna(subset=["Close"])
        if len(hist) < 2:
            continue

        price_data = _compute_price_data(hist)
        if price_data:
            results[symbol] = price_data

    return results


def _compute_price_data(hist) -> dict | None:
    """DataFrameから価格指標を計算"""
    hist = hist.dropna(subset=["Close"])
    if len(hist) < 2:
        return None

    latest = hist.iloc[-1]
    latest_price = float(latest["Close"])
    volume = int(latest["Volume"]) if not np.isnan(latest["Volume"]) else 0

    # 前日比変化率
    prev_price = float(hist.iloc[-2]["Close"])
    daily_change_rate = ((latest_price - prev_price) / prev_price) * 100 if prev_price > 0 else 0

    # 1週間前（5営業日前）の株価
    week_ago_idx = min(4, len(hist) - 1)
    week_ago_price = float(hist.iloc[-(week_ago_idx + 1)]["Close"])

    # 週間変化率
    change_rate = ((latest_price - week_ago_price) / week_ago_price) * 100

    # ボラティリティ計算（30日間の標準偏差/平均）
    volatility = None
    if len(hist) >= 20:
        close_prices = hist["Close"].values.astype(float)
        avg_price = float(close_prices.mean())
        if avg_price > 0:
            std_dev = float(close_prices.std())
            volatility = round((std_dev / avg_price) * 100, 2)

    # 出来高比率（直近3日 vs 4-30日前）
    volume_ratio = None
    if len(hist) >= 10:
        volumes = hist["Volume"].values.astype(float)
        recent_volumes = volumes[-3:]
        older_volumes = volumes[:-3]
        if len(older_volumes) > 0:
            recent_avg = float(recent_volumes.mean())
            older_avg = float(older_volumes.mean())
            if older_avg > 0:
                volume_ratio = round(recent_avg / older_avg, 2)

    return {
        "latestPrice": latest_price,
        "latestVolume": volume,
        "dailyChangeRate": round(daily_change_rate, 2),
        "weekChangeRate": round(change_rate, 2),
        "volatility": volatility,
        "volumeRatio": volume_ratio,
    }


def update_stock_prices(conn, updates: list[dict]) -> int:
    """株価データをバッチ更新"""
    if not updates:
        return 0

    with conn.cursor() as cur:
        now = datetime.now(timezone.utc)
        data = [
            (
                u["latestPrice"],
                u["latestVolume"],
                u["dailyChangeRate"],
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
                "dailyChangeRate" = %s,
                "weekChangeRate" = %s,
                "volatility" = %s,
                "volumeRatio" = %s,
                "priceUpdatedAt" = %s
            WHERE id = %s
            ''',
            data,
            page_size=CONFIG["DB_BATCH_SIZE"]
        )
    conn.commit()
    return len(updates)


def reset_fetch_fail_counts(conn, stock_ids: list[str]) -> int:
    """取得成功した銘柄の失敗カウントをリセット"""
    if not stock_ids:
        return 0

    with conn.cursor() as cur:
        psycopg2.extras.execute_batch(
            cur,
            'UPDATE "Stock" SET "fetchFailCount" = 0 WHERE id = %s AND "fetchFailCount" > 0',
            [(stock_id,) for stock_id in stock_ids],
            page_size=CONFIG["DB_BATCH_SIZE"]
        )
    conn.commit()
    return len(stock_ids)


def increment_fetch_fail_counts(conn, stock_ids: list[str]) -> int:
    """取得失敗した銘柄の失敗カウントをインクリメント"""
    if not stock_ids:
        return 0

    now = datetime.now(timezone.utc)
    with conn.cursor() as cur:
        psycopg2.extras.execute_batch(
            cur,
            '''
            UPDATE "Stock"
            SET "fetchFailCount" = "fetchFailCount" + 1,
                "lastFetchFailedAt" = %s
            WHERE id = %s
            ''',
            [(now, stock_id) for stock_id in stock_ids],
            page_size=CONFIG["DB_BATCH_SIZE"]
        )
    conn.commit()
    return len(stock_ids)


def delete_unused_failed_stocks(conn, min_fail_count: int = 3) -> list[dict]:
    """連続N回以上失敗 + ユーザー未使用の銘柄を削除"""
    with conn.cursor() as cur:
        # 削除対象を検索
        cur.execute('''
            SELECT s.id, s."tickerCode", s.name, s."fetchFailCount"
            FROM "Stock" s
            WHERE s."fetchFailCount" >= %s
              AND NOT EXISTS (SELECT 1 FROM "PortfolioStock" ps WHERE ps."stockId" = s.id)
              AND NOT EXISTS (SELECT 1 FROM "WatchlistStock" ws WHERE ws."stockId" = s.id)
              AND NOT EXISTS (SELECT 1 FROM "Transaction" t WHERE t."stockId" = s.id)
              AND NOT EXISTS (SELECT 1 FROM "TrackedStock" ts WHERE ts."stockId" = s.id)
        ''', (min_fail_count,))
        targets = cur.fetchall()

        if not targets:
            return []

        deleted = []
        for stock_id, ticker_code, name, fail_count in targets:
            cur.execute('DELETE FROM "Stock" WHERE id = %s', (stock_id,))
            deleted.append({
                "id": stock_id,
                "tickerCode": ticker_code,
                "name": name,
                "failCount": fail_count
            })

    conn.commit()
    return deleted


def main():
    parser = argparse.ArgumentParser(description="Fetch stock prices")
    parser.add_argument(
        "--user-stocks-only",
        action="store_true",
        help="ユーザー関連銘柄のみ取得（保有/ウォッチリスト/追跡中 + 今日のおすすめ/注目銘柄）",
    )
    args = parser.parse_args()

    mode = "user-stocks-only" if args.user_stocks_only else "all stocks"

    print("=" * 60)
    print("Stock Price Fetcher (Batch Download)")
    print("=" * 60)
    print(f"Time: {datetime.now().isoformat()}")
    print(f"Mode: {mode}")
    print(f"Config:")
    print(f"  - MIN_VOLUME: {CONFIG['MIN_VOLUME']:,}")
    print(f"  - MIN_WEEK_CHANGE: {CONFIG['MIN_WEEK_CHANGE']}%")
    print(f"  - DOWNLOAD_BATCH_SIZE: {CONFIG['DOWNLOAD_BATCH_SIZE']}")
    print()

    # DB接続
    db_url = get_database_url()
    conn = psycopg2.connect(db_url)

    try:
        # 銘柄一覧を取得
        stocks = fetch_stocks(conn, user_stocks_only=args.user_stocks_only)
        print(f"Found {len(stocks)} stocks to fetch")

        if not stocks:
            print("No stocks to process. Exiting.")
            return

        # ticker → stock info のマップ
        symbol_to_stock = {}
        for stock in stocks:
            symbol = ensure_ticker_suffix(stock["tickerCode"])
            symbol_to_stock[symbol] = stock

        all_symbols = list(symbol_to_stock.keys())

        # バッチごとに yf.download() で取得
        total_updated = 0
        total_filtered = 0
        total_errors = 0
        batch_size = CONFIG["DOWNLOAD_BATCH_SIZE"]

        # 成功/失敗した銘柄を追跡
        all_success_ids = []
        all_failed_ids = []

        for batch_start in range(0, len(all_symbols), batch_size):
            batch_symbols = all_symbols[batch_start:batch_start + batch_size]
            batch_num = batch_start // batch_size + 1
            total_batches = (len(all_symbols) + batch_size - 1) // batch_size

            print(f"Batch {batch_num}/{total_batches}: downloading {len(batch_symbols)} tickers...")
            start_time = time.time()

            price_data_map = download_batch(batch_symbols)
            elapsed = time.time() - start_time
            print(f"  Downloaded in {elapsed:.1f}s ({len(price_data_map)} succeeded)")

            # フィルタ適用 & DB更新データ作成
            updates = []
            success_symbols = set(price_data_map.keys())

            for symbol, price_data in price_data_map.items():
                stock = symbol_to_stock.get(symbol)
                if not stock:
                    continue

                if price_data["latestVolume"] >= CONFIG["MIN_VOLUME"] and \
                   price_data["weekChangeRate"] >= CONFIG["MIN_WEEK_CHANGE"]:
                    updates.append({
                        "id": stock["id"],
                        **price_data,
                    })
                else:
                    total_filtered += 1

            # 成功/失敗を追跡
            for symbol in batch_symbols:
                stock = symbol_to_stock.get(symbol)
                if not stock:
                    continue
                if symbol in success_symbols:
                    all_success_ids.append(stock["id"])
                else:
                    all_failed_ids.append(stock["id"])

            errors_in_batch = len(batch_symbols) - len(price_data_map)
            total_errors += errors_in_batch

            # DB更新
            updated = update_stock_prices(conn, updates)
            total_updated += updated
            print(f"  Updated {updated} stocks (filtered: {total_filtered}, errors: {errors_in_batch})")

            # バッチ間の短い待機（レート制限対策）
            if batch_start + batch_size < len(all_symbols):
                time.sleep(1)

        print()
        print(f"Completed: {len(all_symbols)} stocks processed")
        print(f"  - Total updated: {total_updated}")
        print(f"  - Filtered out: {total_filtered}")
        print(f"  - Errors: {total_errors}")

        # 失敗カウントの更新
        print()
        print("Updating fetch fail counts...")
        reset_fetch_fail_counts(conn, all_success_ids)
        print(f"  - Reset {len(all_success_ids)} successful stocks")
        increment_fetch_fail_counts(conn, all_failed_ids)
        print(f"  - Incremented {len(all_failed_ids)} failed stocks")

        # 連続失敗 + ユーザー未使用の銘柄を削除
        deleted = delete_unused_failed_stocks(conn, min_fail_count=3)
        if deleted:
            print()
            print(f"Deleted {len(deleted)} unused stocks with 3+ consecutive failures:")
            for stock in deleted:
                print(f"  - {stock['tickerCode']} ({stock['name']}) - {stock['failCount']} failures")

        print("=" * 60)

    finally:
        conn.close()


if __name__ == "__main__":
    main()
