#!/usr/bin/env python3
"""
推薦結果評価バッチスクリプト

RecommendationOutcomeレコードのリターンを評価し、更新する。
- 1日後、3日後、7日後、14日後のリターンを計算
- 7日後評価時に日経225のベンチマークリターンも記録

平日 16:00 JST（場が閉まった後）に実行。
"""

import os
import sys
from datetime import datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

import psycopg2
import psycopg2.extras
import yfinance as yf

# scriptsディレクトリをPythonパスに追加
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from lib.date_utils import get_today_jst_date, get_days_ago_for_db

JST = ZoneInfo("Asia/Tokyo")

# 評価対象の日数
EVALUATION_DAYS = [1, 3, 7, 14]


def get_database_url() -> str:
    """データベースURLを取得"""
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("Error: DATABASE_URL environment variable not set")
        sys.exit(1)
    return url


def get_outcomes_to_evaluate(conn) -> list[dict]:
    """評価対象のOutcomeレコードを取得"""
    now = datetime.now(JST)

    with conn.cursor() as cur:
        # 各日数ごとに、まだ評価されていないレコードを取得
        # returnAfterXDays IS NULL AND recommendedAt <= X日前
        cur.execute('''
            SELECT
                id,
                "tickerCode",
                "recommendedAt",
                "priceAtRec",
                "returnAfter1Day",
                "returnAfter3Days",
                "returnAfter7Days",
                "returnAfter14Days"
            FROM "RecommendationOutcome"
            WHERE
                ("returnAfter1Day" IS NULL AND "recommendedAt" <= %s)
                OR ("returnAfter3Days" IS NULL AND "recommendedAt" <= %s)
                OR ("returnAfter7Days" IS NULL AND "recommendedAt" <= %s)
                OR ("returnAfter14Days" IS NULL AND "recommendedAt" <= %s)
            ORDER BY "recommendedAt" DESC
            LIMIT 500
        ''', (
            now - timedelta(days=1),
            now - timedelta(days=3),
            now - timedelta(days=7),
            now - timedelta(days=14),
        ))
        rows = cur.fetchall()

    outcomes = []
    for row in rows:
        outcomes.append({
            "id": row[0],
            "tickerCode": row[1],
            "recommendedAt": row[2],
            "priceAtRec": float(row[3]),
            "returnAfter1Day": float(row[4]) if row[4] is not None else None,
            "returnAfter3Days": float(row[5]) if row[5] is not None else None,
            "returnAfter7Days": float(row[6]) if row[6] is not None else None,
            "returnAfter14Days": float(row[7]) if row[7] is not None else None,
        })

    print(f"Found {len(outcomes)} outcomes to evaluate")
    return outcomes


def fetch_stock_prices(ticker_codes: list[str], start_date: datetime, end_date: datetime) -> dict[str, dict]:
    """
    yfinanceから株価データを取得

    Returns:
        {ticker: {date: close_price, ...}, ...}
    """
    if not ticker_codes:
        return {}

    # yfinanceのティッカー形式に変換
    tickers = []
    for code in ticker_codes:
        if code.endswith(".T"):
            tickers.append(code)
        else:
            tickers.append(f"{code}.T")

    print(f"Fetching prices for {len(tickers)} tickers from {start_date.date()} to {end_date.date()}")

    try:
        # バッチでデータを取得
        data = yf.download(
            tickers,
            start=start_date.strftime("%Y-%m-%d"),
            end=end_date.strftime("%Y-%m-%d"),
            progress=False,
            auto_adjust=True,
        )

        if data.empty:
            print("  No data returned from yfinance")
            return {}

        result: dict[str, dict] = {}

        # 単一銘柄の場合とマルチ銘柄の場合で処理が異なる
        if len(tickers) == 1:
            ticker = tickers[0]
            result[ticker] = {}
            for date_idx, row in data.iterrows():
                date_str = date_idx.strftime("%Y-%m-%d")
                if "Close" in data.columns:
                    result[ticker][date_str] = float(row["Close"])
        else:
            for ticker in tickers:
                result[ticker] = {}
                if ("Close", ticker) in data.columns:
                    for date_idx, row in data.iterrows():
                        date_str = date_idx.strftime("%Y-%m-%d")
                        close = row[("Close", ticker)]
                        if not (close != close):  # NaN check
                            result[ticker][date_str] = float(close)

        return result

    except Exception as e:
        print(f"  Error fetching prices: {e}")
        return {}


def calculate_return(price_at_rec: float, price_after: float) -> float:
    """リターン（%）を計算"""
    if price_at_rec == 0:
        return 0.0
    return ((price_after - price_at_rec) / price_at_rec) * 100


def get_closest_price(prices: dict[str, float], target_date: datetime, direction: str = "forward") -> tuple[str, float] | None:
    """
    指定日に最も近い株価を取得（休日対応）

    Args:
        prices: {date_str: price}
        target_date: 取得したい日付
        direction: "forward"（将来方向）または "backward"（過去方向）

    Returns:
        (date_str, price) または None
    """
    target_str = target_date.strftime("%Y-%m-%d")

    # まず正確な日付をチェック
    if target_str in prices:
        return (target_str, prices[target_str])

    # 前後3日以内を探索
    for delta in range(1, 4):
        if direction == "forward":
            check_date = target_date + timedelta(days=delta)
        else:
            check_date = target_date - timedelta(days=delta)

        check_str = check_date.strftime("%Y-%m-%d")
        if check_str in prices:
            return (check_str, prices[check_str])

    return None


def update_outcome_returns(conn, updates: list[dict]) -> int:
    """Outcomeレコードを更新"""
    if not updates:
        return 0

    updated = 0
    with conn.cursor() as cur:
        for update in updates:
            set_clauses = []
            values = []

            if update.get("returnAfter1Day") is not None:
                set_clauses.append('"returnAfter1Day" = %s')
                values.append(update["returnAfter1Day"])

            if update.get("returnAfter3Days") is not None:
                set_clauses.append('"returnAfter3Days" = %s')
                values.append(update["returnAfter3Days"])

            if update.get("returnAfter7Days") is not None:
                set_clauses.append('"returnAfter7Days" = %s')
                values.append(update["returnAfter7Days"])

            if update.get("returnAfter14Days") is not None:
                set_clauses.append('"returnAfter14Days" = %s')
                values.append(update["returnAfter14Days"])

            if update.get("benchmarkReturn7Days") is not None:
                set_clauses.append('"benchmarkReturn7Days" = %s')
                values.append(update["benchmarkReturn7Days"])

            if set_clauses:
                set_clauses.append('"updatedAt" = NOW()')
                values.append(update["id"])

                query = f'''
                    UPDATE "RecommendationOutcome"
                    SET {", ".join(set_clauses)}
                    WHERE id = %s
                '''
                cur.execute(query, values)
                updated += 1

    conn.commit()
    return updated


def main():
    print("=" * 60)
    print("Recommendation Outcome Evaluation")
    print("=" * 60)
    print(f"Time: {datetime.now(JST).isoformat()}")
    print()

    conn = psycopg2.connect(get_database_url())

    try:
        # 評価対象のOutcomeを取得
        outcomes = get_outcomes_to_evaluate(conn)

        if not outcomes:
            print("No outcomes to evaluate. Exiting.")
            return

        # 必要な銘柄コードを収集
        ticker_codes = list(set(o["tickerCode"] for o in outcomes))
        ticker_codes.append("^N225")  # 日経225も追加

        # 日付範囲を計算（最も古い推薦日から今日まで）
        oldest_date = min(o["recommendedAt"] for o in outcomes)
        start_date = oldest_date - timedelta(days=1)  # 余裕を持たせる
        end_date = datetime.now(JST) + timedelta(days=1)

        # 株価データを取得
        all_prices = fetch_stock_prices(ticker_codes, start_date, end_date)

        if not all_prices:
            print("Failed to fetch stock prices. Exiting.")
            return

        # 日経225の株価
        nikkei_key = "^N225"
        nikkei_prices = all_prices.get(nikkei_key, {})
        print(f"  Nikkei 225 prices: {len(nikkei_prices)} days")

        # 各Outcomeを評価
        updates = []
        now = datetime.now(JST)

        for outcome in outcomes:
            ticker = outcome["tickerCode"]
            if not ticker.endswith(".T"):
                ticker = f"{ticker}.T"

            prices = all_prices.get(ticker, {})
            if not prices:
                continue

            recommended_at = outcome["recommendedAt"]
            if recommended_at.tzinfo is None:
                recommended_at = recommended_at.replace(tzinfo=JST)

            price_at_rec = outcome["priceAtRec"]
            update = {"id": outcome["id"]}

            # 推薦時点の株価を取得（priceAtRecと比較用）
            rec_date_price = get_closest_price(prices, recommended_at, "backward")

            # 各日数でリターンを計算
            for days in EVALUATION_DAYS:
                field = f"returnAfter{days}Day" if days == 1 else f"returnAfter{days}Days"

                # すでに評価済みならスキップ
                if outcome.get(field) is not None:
                    continue

                # 十分な時間が経過しているかチェック
                target_date = recommended_at + timedelta(days=days)
                if target_date > now:
                    continue

                # 株価を取得
                price_result = get_closest_price(prices, target_date, "forward")
                if price_result:
                    _, price_after = price_result
                    ret = calculate_return(price_at_rec, price_after)
                    update[field] = round(ret, 2)

                    # 7日後の場合、ベンチマークも計算
                    if days == 7 and nikkei_prices:
                        nikkei_at_rec = get_closest_price(nikkei_prices, recommended_at, "backward")
                        nikkei_after = get_closest_price(nikkei_prices, target_date, "forward")

                        if nikkei_at_rec and nikkei_after:
                            _, nikkei_price_at_rec = nikkei_at_rec
                            _, nikkei_price_after = nikkei_after
                            benchmark_ret = calculate_return(nikkei_price_at_rec, nikkei_price_after)
                            update["benchmarkReturn7Days"] = round(benchmark_ret, 2)

            # 更新があれば追加
            if len(update) > 1:
                updates.append(update)

        # 更新を実行
        updated_count = update_outcome_returns(conn, updates)

        print()
        print("=" * 60)
        print(f"Updated {updated_count} outcomes")
        print("=" * 60)

    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
