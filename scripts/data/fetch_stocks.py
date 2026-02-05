#!/usr/bin/env python3
"""
株価データ取得スクリプト（Cron実行用）

毎日17:00 JSTに実行され、DBに登録された全銘柄の株価データを取得してPostgreSQLに保存する。
並列処理により高速化。

Usage:
  python fetch_stocks.py          # 通常実行（今日のデータがあればスキップ）
  python fetch_stocks.py --force  # 強制実行（今日のデータがあっても財務指標を更新）
"""

import yfinance as yf
import psycopg2
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed
import argparse
import os
import sys
import time
from urllib.error import HTTPError


DATABASE_URL = os.getenv("DATABASE_URL")
MAX_WORKERS = 15  # 並列実行数
FORCE_UPDATE = False  # 強制更新モード（コマンドライン引数で設定）
MAX_RETRIES = 3  # API rate limit時の最大リトライ回数
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


def fetch_with_retry(ticker_obj, operation, max_retries=MAX_RETRIES):
    """
    yfinance APIをリトライロジック付きで実行

    Args:
        ticker_obj: yfinance.Ticker オブジェクト
        operation: 実行する操作 ("history" or "info")
        max_retries: 最大リトライ回数

    Returns:
        操作の結果
    """
    for attempt in range(max_retries):
        try:
            if operation == "history":
                return ticker_obj.history(period="90d")
            elif operation == "info":
                return ticker_obj.info
            else:
                raise ValueError(f"Unknown operation: {operation}")

        except Exception as e:
            error_msg = str(e)

            # Rate limit エラーをチェック（HTTPError または メッセージ文字列）
            is_rate_limit = False
            if isinstance(e, HTTPError) and e.code == 429:
                is_rate_limit = True
            elif "Too Many Requests" in error_msg or "Rate limited" in error_msg:
                is_rate_limit = True

            if is_rate_limit:
                if attempt < max_retries - 1:
                    wait_time = RETRY_DELAYS[attempt]
                    print(f"    ⏳ Rate limit hit, retrying in {wait_time}s (attempt {attempt + 1}/{max_retries})...")
                    time.sleep(wait_time)
                    continue
                else:
                    print(f"    ✗ Rate limit exceeded after {max_retries} attempts")
                    raise
            else:
                # その他のエラーは即座に失敗
                raise

    return None


def has_todays_data(stock_id: str, target_date) -> bool:
    """
    指定した日付のデータがすでにDBにあるかチェック

    Args:
        stock_id: 銘柄ID
        target_date: チェック対象の日付

    Returns:
        True: データがある（スキップ可能）
        False: データがない（取得が必要）
    """
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()
        cur.execute("""
            SELECT COUNT(*) FROM "StockPrice"
            WHERE "stockId" = %s AND date = %s
        """, (stock_id, target_date))
        count = cur.fetchone()[0]
        cur.close()
        conn.close()
        return count > 0
    except Exception as e:
        print(f"  ⚠️  Error checking existing data: {e}")
        return False  # エラー時は取得を試みる


def fetch_single_stock(stock_data):
    """
    1銘柄の株価データを取得してDBに保存
    """
    stock_id, ticker, name = stock_data

    try:
        # スレッドごとにDB接続を作成
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()

        print(f"Processing {ticker} ({name})...")

        # 今日のデータがすでにあるかチェック
        today = datetime.now().date()
        if has_todays_data(stock_id, today):
            # 強制更新モードでなければスキップ（API接続なし）
            if not FORCE_UPDATE:
                print(f"  → Skipped (price data already exists)")
                cur.close()
                conn.close()
                return {"ticker": ticker, "success": True, "skipped": True, "inserted": 0}

            # 強制更新モード: 財務指標のみ更新
            print(f"  → Force updating financial metrics (price data already exists)")
            try:
                stock = yf.Ticker(ticker)
                info = fetch_with_retry(stock, "info")
                if info is None:
                    print(f"  ⚠️  {ticker}: No info data available, skipping financial metrics update")
                    cur.close()
                    conn.close()
                    return {"ticker": ticker, "success": True, "skipped": True, "inserted": 0}
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
                conn.commit()
                print(f"  ✓ {ticker} financial metrics updated (beginnerScore: {beginner_score})")
            except Exception as e:
                print(f"  ⚠️  {ticker}: Error updating financial metrics: {e}")
            finally:
                cur.close()
                conn.close()

            return {"ticker": ticker, "success": True, "skipped": True, "inserted": 0}

        # 株価データを取得
        stock = yf.Ticker(ticker)

        # 過去90日分取得（指標計算用に余裕を持たせる）
        hist = fetch_with_retry(stock, "history")

        if hist.empty:
            print(f"  ⚠️  No data available for {ticker}")
            cur.close()
            conn.close()
            return {"ticker": ticker, "success": False, "error": "No data"}

        # 最新データをINSERT（重複は無視）
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
                    float(row['Close'])  # adjustedClose
                ))
                if cur.rowcount > 0:
                    inserted_count += 1
            except Exception as e:
                print(f"  ⚠️  {ticker}: Error inserting data for {date.date()}: {e}")
                continue

        # 財務指標を取得・更新
        try:
            info = fetch_with_retry(stock, "info")
            if info is None:
                print(f"  ⚠️  {ticker}: No info data available, skipping financial metrics update")
            else:
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
        except Exception as e:
            print(f"  ⚠️  {ticker}: Error updating financial metrics: {e}")

        conn.commit()
        cur.close()
        conn.close()

        print(f"  ✓ {ticker} completed ({inserted_count} new records)")
        return {"ticker": ticker, "success": True, "skipped": False, "inserted": inserted_count}

    except Exception as e:
        print(f"  ✗ Error processing {ticker}: {e}")
        return {"ticker": ticker, "success": False, "error": str(e)}


def fetch_and_store():
    """
    1. DBから監視銘柄を取得
    2. yfinanceで株価データを並列取得
    3. PostgreSQLに保存
    """
    try:
        print(f"[{datetime.now()}] Starting stock data fetch (parallel mode)...")
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()

        # 監視銘柄を取得
        cur.execute('SELECT id, "tickerCode", name FROM "Stock"')
        stocks = cur.fetchall()
        cur.close()
        conn.close()

        print(f"Fetching data for {len(stocks)} stocks with {MAX_WORKERS} workers...")

        success_count = 0
        skipped_count = 0
        error_count = 0
        results = []

        # 並列処理で株価取得
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            futures = {executor.submit(fetch_single_stock, stock): stock for stock in stocks}

            for future in as_completed(futures):
                result = future.result()
                results.append(result)

                if result["success"]:
                    if result.get("skipped"):
                        skipped_count += 1
                    else:
                        success_count += 1
                else:
                    error_count += 1

        print(f"\n[{datetime.now()}] Fetch completed!")
        print(f"  Fetched: {success_count}")
        print(f"  Skipped: {skipped_count} (already have today's data)")
        print(f"  Errors: {error_count}")
        print(f"  Total: {len(stocks)}")

        # エラーが多すぎる場合は異常終了
        if error_count > len(stocks) * 0.5:
            print(f"\nERROR: Too many failures ({error_count}/{len(stocks)})")
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
        print("🔄 Force update mode enabled")

    fetch_and_store()
