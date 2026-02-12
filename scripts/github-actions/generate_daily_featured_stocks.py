#!/usr/bin/env python3
"""
DailyFeaturedStock自動生成スクリプト

株価変動率、取引高、時価総額から機械的に銘柄を3カテゴリに分類：
- surge（短期急騰）: 週間上昇率+5%以上、時価総額1000億円以上
- stable（中長期安定）: 時価総額5000億円以上 & ボラティリティ15%以下
- trending（話題）: 出来高比率1.5倍以上、時価総額500億円以上

毎日朝に実行され、各カテゴリTop 3を選出（合計9銘柄）
"""

import os
import sys
import uuid
from datetime import datetime, timezone

import psycopg2
import psycopg2.extras


def get_database_url() -> str:
    """データベースURLを取得"""
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("Error: DATABASE_URL environment variable not set")
        sys.exit(1)
    return url


def fetch_stocks_with_prices(conn) -> list[dict]:
    """DBから株価データを持つ銘柄一覧を取得"""
    with conn.cursor() as cur:
        cur.execute('''
            SELECT
                id,
                "tickerCode",
                name,
                "marketCap",
                "weekChangeRate",
                "volatility",
                "volumeRatio"
            FROM "Stock"
            WHERE "priceUpdatedAt" IS NOT NULL
              AND "latestPrice" IS NOT NULL
              AND "marketCap" IS NOT NULL
            ORDER BY "marketCap" DESC NULLS LAST
        ''')
        rows = cur.fetchall()

    stocks = []
    for row in rows:
        stocks.append({
            "id": row[0],
            "tickerCode": row[1],
            "name": row[2],
            "marketCap": float(row[3]) if row[3] else 0,
            "weekChangeRate": float(row[4]) if row[4] else 0,
            "volatility": float(row[5]) if row[5] else None,
            "volumeRatio": float(row[6]) if row[6] else None,
        })
    return stocks


def calculate_surge_stocks(stocks: list[dict]) -> list[dict]:
    """surge（短期急騰）銘柄を抽出"""
    candidates = []

    for stock in stocks:
        if stock["marketCap"] < 1000:
            continue

        change_rate = stock["weekChangeRate"]
        if change_rate >= 5.0:
            candidates.append({
                "stock": stock,
                "changeRate": change_rate,
            })

    candidates.sort(key=lambda x: x["changeRate"], reverse=True)

    results = []
    for idx, candidate in enumerate(candidates[:3]):
        stock = candidate["stock"]
        market_cap = stock["marketCap"]
        if market_cap >= 10000:
            market_cap_label = f"{market_cap / 10000:.1f}兆円"
        else:
            market_cap_label = f"{market_cap:.0f}億円"

        reason = f"この1週間で株価が{candidate['changeRate']:.1f}%上昇しています。時価総額{market_cap_label}の安定した企業です"

        results.append({
            "stockId": stock["id"],
            "category": "surge",
            "categoryPosition": idx + 1,
            "reason": reason,
            "score": min(100, int(market_cap / 100)),
        })

    print(f"Surge: {len(results)} stocks selected")
    return results


def calculate_stable_stocks(stocks: list[dict]) -> list[dict]:
    """stable（中長期安定）銘柄を抽出"""
    candidates = []

    for stock in stocks:
        if stock["marketCap"] < 5000:
            continue

        volatility = stock["volatility"]
        if volatility is None:
            continue

        if volatility <= 15.0:
            candidates.append({
                "stock": stock,
                "volatility": volatility,
            })

    candidates.sort(key=lambda x: x["stock"]["marketCap"], reverse=True)

    results = []
    for idx, candidate in enumerate(candidates[:3]):
        stock = candidate["stock"]
        market_cap = stock["marketCap"]
        if market_cap >= 10000:
            market_cap_label = f"{market_cap / 10000:.1f}兆円"
        else:
            market_cap_label = f"{market_cap:.0f}億円"

        reason = f"安定した値動きで、初心者に最適な銘柄です（時価総額{market_cap_label}、変動率{candidate['volatility']:.1f}%）"

        results.append({
            "stockId": stock["id"],
            "category": "stable",
            "categoryPosition": idx + 1,
            "reason": reason,
            "score": min(100, int(market_cap / 100)),
        })

    print(f"Stable: {len(results)} stocks selected")
    return results


def calculate_trending_stocks(stocks: list[dict]) -> list[dict]:
    """trending（話題）銘柄を抽出"""
    candidates = []

    for stock in stocks:
        if stock["marketCap"] < 500:
            continue

        volume_ratio = stock["volumeRatio"]
        if volume_ratio is None:
            continue

        if volume_ratio >= 1.5:
            candidates.append({
                "stock": stock,
                "volumeRatio": volume_ratio,
            })

    candidates.sort(key=lambda x: x["volumeRatio"], reverse=True)

    results = []
    for idx, candidate in enumerate(candidates[:3]):
        stock = candidate["stock"]
        market_cap = stock["marketCap"]
        if market_cap >= 10000:
            market_cap_label = f"{market_cap / 10000:.1f}兆円"
        else:
            market_cap_label = f"{market_cap:.0f}億円"

        reason = f"直近3日で取引が活発になっている注目銘柄です（取引高{candidate['volumeRatio']:.1f}倍、時価総額{market_cap_label}）"

        results.append({
            "stockId": stock["id"],
            "category": "trending",
            "categoryPosition": idx + 1,
            "reason": reason,
            "score": min(100, int(market_cap / 100)),
        })

    print(f"Trending: {len(results)} stocks selected")
    return results


def save_daily_featured_stocks(conn, featured_stocks: list[dict]) -> None:
    """DailyFeaturedStockテーブルに保存"""
    if not featured_stocks:
        print("No stocks to save")
        return

    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

    with conn.cursor() as cur:
        cur.execute('''
            DELETE FROM "DailyFeaturedStock"
            WHERE date = %s
        ''', (today,))
        deleted_count = cur.rowcount
        print(f"Deleted {deleted_count} existing records for {today.date()}")

        for idx, fs in enumerate(featured_stocks):
            cur.execute('''
                INSERT INTO "DailyFeaturedStock" (id, date, "stockId", category, position, reason, score, "createdAt")
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ''', (
                str(uuid.uuid4().hex[:25]),
                today,
                fs["stockId"],
                fs["category"],
                idx + 1,
                fs["reason"],
                fs["score"],
                datetime.now(timezone.utc),
            ))

    conn.commit()
    print(f"Saved {len(featured_stocks)} featured stocks for {today.date()}")


def main():
    print("=" * 60)
    print("DailyFeaturedStock Generation (Python)")
    print("=" * 60)
    print(f"Time: {datetime.now().isoformat()}")
    print()

    db_url = get_database_url()
    conn = psycopg2.connect(db_url)

    try:
        print("Fetching stocks with price data...")
        stocks = fetch_stocks_with_prices(conn)
        print(f"Found {len(stocks)} stocks with price data")

        if not stocks:
            print("No stocks with sufficient data. Exiting.")
            return

        print()
        print("Calculating featured stocks...")

        surge_stocks = calculate_surge_stocks(stocks)
        stable_stocks = calculate_stable_stocks(stocks)
        trending_stocks = calculate_trending_stocks(stocks)

        all_featured = surge_stocks + stable_stocks + trending_stocks

        if not all_featured:
            print("No stocks matched criteria today")
            return

        print()
        print("Saving to database...")
        save_daily_featured_stocks(conn, all_featured)

        print()
        print("=" * 60)
        print("DailyFeaturedStock generation completed")
        print("=" * 60)
        print(f"Total featured stocks: {len(all_featured)}")
        print(f"  - Surge: {len(surge_stocks)}")
        print(f"  - Stable: {len(stable_stocks)}")
        print(f"  - Trending: {len(trending_stocks)}")
        print("=" * 60)

    finally:
        conn.close()


if __name__ == "__main__":
    main()
