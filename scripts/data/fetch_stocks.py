#!/usr/bin/env python3
"""
株価データ取得スクリプト（Cron実行用）- 最適化版

毎日17:00 JSTに実行され、DBに登録された全銘柄の株価データを取得してPostgreSQLに保存する。

最適化ポイント:
- yf.download()によるバッチ株価取得（個別API呼び出しを大幅削減）
- 財務指標取得を小バッチ+ディレイで分割（rate limit回避）
- DBアクセスをバッチ化（接続数削減）

Usage:
  python fetch_stocks.py          # 通常実行（今日のデータがあればスキップ）
  python fetch_stocks.py --force  # 強制実行（今日のデータがあっても財務指標を更新）
"""

import yfinance as yf
import psycopg2
import psycopg2.extras
import pandas as pd
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
import argparse
import os
import sys
import time
from urllib.error import HTTPError


DATABASE_URL = os.getenv("DATABASE_URL")
FORCE_UPDATE = False  # 強制更新モード（コマンドライン引数で設定）

# バッチ設定
PRICE_BATCH_SIZE = 50    # yf.download()1回あたりのティッカー数
PRICE_BATCH_DELAY = 2    # 株価バッチ間の待機時間（秒）
INFO_BATCH_SIZE = 20     # 財務指標取得のバッチサイズ
INFO_WORKERS = 5         # 財務指標取得の並列数
INFO_BATCH_DELAY = 5     # 財務指標バッチ間の待機時間（秒）
MAX_RETRIES = 3          # API rate limit時の最大リトライ回数
RETRY_DELAYS = [5, 10, 20]  # リトライ間隔（秒）


def calculate_beginner_score(info: dict) -> int:
    """
    財務指標からbeginnerScore（初心者向けスコア）を計算

    スコア計算基準:
    - 基本点: 50点
    - PBR 1〜3の範囲: +10点
    - PER 10〜20の範囲: +10点
    - ROE 5%以上: +10点
    - 現在価格が52週高値から20%以内: +10点
    - 取引量が一定以上（100万株/日以上）: +10点

    Returns:
        beginnerScore (0-100)
    """
    score = 50  # 基本点

    # PBR (Price to Book Ratio): 1〜3が適正
    pbr = info.get('priceToBook')
    if pbr is not None and 1.0 <= pbr <= 3.0:
        score += 10

    # PER (Price to Earnings Ratio): 10〜20が適正
    per = info.get('trailingPE')
    if per is not None and 10.0 <= per <= 20.0:
        score += 10

    # ROE (Return on Equity): 5%以上が良好
    roe = info.get('returnOnEquity')
    if roe is not None and roe >= 0.05:
        score += 10

    # 52週高値からの乖離: 20%以内なら安定
    current_price = info.get('currentPrice')
    high_52week = info.get('fiftyTwoWeekHigh')
    if current_price and high_52week and high_52week > 0:
        deviation = (high_52week - current_price) / high_52week
        if deviation <= 0.20:
            score += 10

    # 平均出来高: 100万株以上なら流動性良好
    avg_volume = info.get('averageVolume')
    if avg_volume is not None and avg_volume >= 1_000_000:
        score += 10

    # 0-100の範囲にクランプ
    return max(0, min(100, score))


if not DATABASE_URL:
    print("ERROR: DATABASE_URL environment variable is not set")
    sys.exit(1)


# =============================================================================
# Phase 0: DBバッチ操作
# =============================================================================

def get_stocks_with_todays_data(stock_ids, target_date):
    """
    今日のデータがある銘柄IDのセットを一括取得

    個別にDB接続する代わりに、1クエリで全銘柄をチェック
    """
    if not stock_ids:
        return set()
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()
        cur.execute("""
            SELECT DISTINCT "stockId" FROM "StockPrice"
            WHERE "stockId" = ANY(%s) AND date = %s
        """, (stock_ids, target_date))
        result = {row[0] for row in cur.fetchall()}
        cur.close()
        conn.close()
        return result
    except Exception as e:
        print(f"  ⚠️  Error checking existing data: {e}")
        return set()


# =============================================================================
# Phase 1: バッチ株価取得（yf.download）
# =============================================================================

def batch_download_prices(tickers):
    """
    yf.download()を使ってバッチで株価データを取得

    個別にyf.Ticker().history()を呼ぶ代わりに、yf.download()で一括取得。
    PRICE_BATCH_SIZE件ずつに分割し、バッチ間にディレイを入れることで
    rate limitのリスクを軽減する。

    Returns:
        dict: {ticker: [{date, open, high, low, close, volume}, ...]}
    """
    all_price_data = {}
    total_batches = (len(tickers) + PRICE_BATCH_SIZE - 1) // PRICE_BATCH_SIZE

    for batch_idx in range(0, len(tickers), PRICE_BATCH_SIZE):
        batch = tickers[batch_idx:batch_idx + PRICE_BATCH_SIZE]
        batch_num = batch_idx // PRICE_BATCH_SIZE + 1

        print(f"\n  [Batch {batch_num}/{total_batches}] Downloading prices for {len(batch)} tickers...")

        try:
            # yf.download()は内部でHTTPリクエストを最適化する
            df = yf.download(
                batch,
                period="90d",
                group_by="ticker",
                threads=True,
                progress=False
            )

            if df.empty:
                print(f"    ⚠️  No data returned for batch {batch_num}")
                continue

            # MultiIndex（複数ティッカー）かどうかを判定
            is_multi = isinstance(df.columns, pd.MultiIndex)

            for ticker in batch:
                try:
                    if is_multi:
                        ticker_df = df[ticker].dropna(how='all')
                    else:
                        # 1銘柄の場合はシンプルなDataFrame
                        ticker_df = df.dropna(how='all')

                    if ticker_df.empty:
                        print(f"    ⚠️  {ticker}: No data")
                        continue

                    prices = []
                    for date, row in ticker_df.iterrows():
                        try:
                            prices.append({
                                'date': date.date() if hasattr(date, 'date') else date,
                                'open': float(row['Open']),
                                'high': float(row['High']),
                                'low': float(row['Low']),
                                'close': float(row['Close']),
                                'volume': int(row['Volume']),
                            })
                        except (ValueError, KeyError, TypeError):
                            continue

                    if prices:
                        all_price_data[ticker] = prices
                        print(f"    ✓ {ticker}: {len(prices)} records")
                    else:
                        print(f"    ⚠️  {ticker}: No valid records")

                except KeyError:
                    print(f"    ⚠️  {ticker}: Not found in download results")
                except Exception as e:
                    print(f"    ⚠️  {ticker}: Error parsing: {e}")

        except Exception as e:
            print(f"    ✗ Batch {batch_num} download failed: {e}")

        # バッチ間ディレイ
        if batch_idx + PRICE_BATCH_SIZE < len(tickers):
            print(f"    Waiting {PRICE_BATCH_DELAY}s before next batch...")
            time.sleep(PRICE_BATCH_DELAY)

    return all_price_data


def batch_insert_prices(price_data, ticker_to_stock_id):
    """
    execute_valuesを使って株価データを一括INSERT

    個別INSERT文の代わりにexecute_valuesでバッチ処理し、DB負荷を軽減。
    ON CONFLICT DO NOTHINGで重複は自動スキップ。

    Returns:
        int: 処理したレコード数
    """
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    all_records = []
    for ticker, prices in price_data.items():
        stock_id = ticker_to_stock_id.get(ticker)
        if not stock_id:
            continue
        for p in prices:
            all_records.append((
                stock_id,
                p['date'],
                p['open'],
                p['high'],
                p['low'],
                p['close'],
                p['volume'],
                p['close']  # adjustedClose
            ))

    if not all_records:
        cur.close()
        conn.close()
        return 0

    batch_size = 1000
    total_processed = 0
    for i in range(0, len(all_records), batch_size):
        batch = all_records[i:i + batch_size]
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
        total_processed += len(batch)

    conn.commit()
    cur.close()
    conn.close()
    return total_processed


# =============================================================================
# Phase 2: バッチ財務指標取得（info）
# =============================================================================

def fetch_info_with_retry(ticker, max_retries=MAX_RETRIES):
    """
    1銘柄の財務指標をリトライ付きで取得

    yfinanceのinfoにはバッチAPIがないため個別呼び出しが必要。
    rate limit時は指数バックオフでリトライする。
    """
    for attempt in range(max_retries):
        try:
            stock = yf.Ticker(ticker)
            info = stock.info
            return info
        except Exception as e:
            error_msg = str(e)

            is_rate_limit = False
            if isinstance(e, HTTPError) and e.code == 429:
                is_rate_limit = True
            elif "Too Many Requests" in error_msg or "Rate limited" in error_msg:
                is_rate_limit = True

            if is_rate_limit and attempt < max_retries - 1:
                wait = RETRY_DELAYS[attempt]
                print(f"    ⏳ {ticker}: Rate limit, retry in {wait}s ({attempt + 1}/{max_retries})")
                time.sleep(wait)
            else:
                raise

    return None


def batch_fetch_info(tickers):
    """
    財務指標を小バッチ+ディレイで取得

    INFO_BATCH_SIZE件ずつに分割し、各バッチ内ではINFO_WORKERS並列で取得。
    バッチ間にINFO_BATCH_DELAYのディレイを入れることでrate limitを回避。

    Returns:
        dict: {ticker: info_dict}
    """
    all_info = {}
    total_batches = (len(tickers) + INFO_BATCH_SIZE - 1) // INFO_BATCH_SIZE

    for batch_idx in range(0, len(tickers), INFO_BATCH_SIZE):
        batch = tickers[batch_idx:batch_idx + INFO_BATCH_SIZE]
        batch_num = batch_idx // INFO_BATCH_SIZE + 1

        print(f"\n  [Batch {batch_num}/{total_batches}] Fetching info for {len(batch)} tickers...")

        with ThreadPoolExecutor(max_workers=INFO_WORKERS) as executor:
            futures = {executor.submit(fetch_info_with_retry, t): t for t in batch}

            for future in as_completed(futures):
                ticker = futures[future]
                try:
                    info = future.result()
                    if info:
                        all_info[ticker] = info
                        print(f"    ✓ {ticker}")
                    else:
                        print(f"    ⚠️  {ticker}: No info data")
                except Exception as e:
                    print(f"    ✗ {ticker}: {e}")

        # バッチ間ディレイ
        if batch_idx + INFO_BATCH_SIZE < len(tickers):
            print(f"    Waiting {INFO_BATCH_DELAY}s before next batch...")
            time.sleep(INFO_BATCH_DELAY)

    return all_info


def batch_update_financial_metrics(info_data, ticker_to_stock_id):
    """
    財務指標をバッチでDB更新

    Returns:
        int: 更新した銘柄数
    """
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    updated = 0
    for ticker, info in info_data.items():
        stock_id = ticker_to_stock_id.get(ticker)
        if not stock_id:
            continue

        beginner_score = calculate_beginner_score(info)

        cur.execute("""
            UPDATE "Stock"
            SET
                pbr = %s,
                per = %s,
                roe = %s,
                "operatingCF" = %s,
                "freeCF" = %s,
                "currentPrice" = %s,
                "fiftyTwoWeekHigh" = %s,
                "fiftyTwoWeekLow" = %s,
                "beginnerScore" = %s,
                "financialDataUpdatedAt" = NOW()
            WHERE id = %s
        """, (
            info.get('priceToBook'),
            info.get('trailingPE'),
            info.get('returnOnEquity'),
            info.get('operatingCashflow'),
            info.get('freeCashflow'),
            info.get('currentPrice'),
            info.get('fiftyTwoWeekHigh'),
            info.get('fiftyTwoWeekLow'),
            beginner_score,
            stock_id
        ))
        updated += 1

    conn.commit()
    cur.close()
    conn.close()
    return updated


# =============================================================================
# メイン処理
# =============================================================================

def fetch_and_store():
    """
    最適化されたデータ取得フロー:
    1. DBから全銘柄を取得
    2. 既存データをバッチチェック（1クエリ）
    3. Phase 1: yf.download()でバッチ株価取得 + execute_valuesで一括INSERT
    4. Phase 2: 財務指標を小バッチ+ディレイで取得 + バッチ更新
    """
    try:
        print(f"[{datetime.now()}] Starting optimized stock data fetch...")
        print(f"  Price batch size: {PRICE_BATCH_SIZE}, delay: {PRICE_BATCH_DELAY}s")
        print(f"  Info batch size: {INFO_BATCH_SIZE}, workers: {INFO_WORKERS}, delay: {INFO_BATCH_DELAY}s")

        # 1. DBから全銘柄を取得
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()
        cur.execute('SELECT id, "tickerCode", name FROM "Stock"')
        stocks = cur.fetchall()
        cur.close()
        conn.close()

        print(f"\nTotal stocks in DB: {len(stocks)}")

        # 2. 今日のデータがある銘柄をバッチチェック（1クエリで全銘柄チェック）
        today = datetime.now().date()
        stock_ids = [s[0] for s in stocks]
        stocks_with_data = get_stocks_with_todays_data(stock_ids, today)

        print(f"Stocks with today's data: {len(stocks_with_data)}")

        # 3. 銘柄を分類
        ticker_to_stock_id = {s[1]: s[0] for s in stocks}

        needs_prices = []      # 株価+財務指標が必要
        needs_info_only = []   # 財務指標のみ必要（force mode）
        skipped = []           # スキップ

        for stock_id, ticker, name in stocks:
            if stock_id in stocks_with_data:
                if FORCE_UPDATE:
                    needs_info_only.append(ticker)
                else:
                    skipped.append(ticker)
            else:
                needs_prices.append(ticker)

        print(f"\n  Prices + Info needed: {len(needs_prices)}")
        print(f"  Info only (force):    {len(needs_info_only)}")
        print(f"  Skipped:              {len(skipped)}")

        # 4. Phase 1: バッチ株価取得
        price_data = {}
        if needs_prices:
            print(f"\n{'='*60}")
            print(f"Phase 1: Batch price download ({len(needs_prices)} stocks)")
            print(f"{'='*60}")

            price_data = batch_download_prices(needs_prices)

            if price_data:
                print(f"\n  Inserting price data into DB...")
                total_processed = batch_insert_prices(price_data, ticker_to_stock_id)
                print(f"  Processed {total_processed} price records")
            else:
                print(f"\n  ⚠️  No price data downloaded")
        else:
            print(f"\n  All stocks already have today's price data")

        # 5. Phase 2: バッチ財務指標取得
        all_info_tickers = needs_prices + needs_info_only
        if all_info_tickers:
            print(f"\n{'='*60}")
            print(f"Phase 2: Batch financial metrics ({len(all_info_tickers)} stocks)")
            print(f"{'='*60}")

            info_data = batch_fetch_info(all_info_tickers)

            if info_data:
                print(f"\n  Updating financial metrics in DB...")
                updated = batch_update_financial_metrics(info_data, ticker_to_stock_id)
                print(f"  Updated {updated} stocks")
            else:
                print(f"\n  ⚠️  No financial metrics fetched")
        else:
            print(f"\n  No stocks need financial metric updates")

        # 6. サマリー
        price_success = len(price_data)
        price_errors = len(needs_prices) - price_success if needs_prices else 0

        print(f"\n{'='*60}")
        print(f"[{datetime.now()}] Fetch completed!")
        print(f"  Prices fetched:  {price_success}")
        print(f"  Price errors:    {price_errors}")
        print(f"  Info updated:    {len(all_info_tickers)}")
        print(f"  Skipped:         {len(skipped)}")
        print(f"  Total:           {len(stocks)}")

        # エラーが多すぎる場合は異常終了
        total_to_process = len(needs_prices)
        if total_to_process > 0 and price_errors > total_to_process * 0.5:
            print(f"\nERROR: Too many failures ({price_errors}/{total_to_process})")
            sys.exit(1)

    except Exception as e:
        print(f"Fatal error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="株価データ取得スクリプト")
    parser.add_argument(
        "--force",
        action="store_true",
        help="今日のデータがあっても財務指標を強制更新"
    )
    args = parser.parse_args()

    if args.force:
        FORCE_UPDATE = True
        print("Force update mode enabled")

    fetch_and_store()
