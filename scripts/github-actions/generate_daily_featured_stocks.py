#!/usr/bin/env python3
"""
DailyFeaturedStock自動生成スクリプト

株価変動率、取引高、初心者スコアから機械的に銘柄を3カテゴリに分類：
- surge（短期急騰）: 7日間上昇率+5%以上
- stable（中長期安定）: 初心者スコア70点以上 & ボラティリティ15%以下
- trending（話題）: 取引高が過去30日平均の1.5倍以上

毎日朝7時（JST）に実行され、各カテゴリTop 3を選出（合計9銘柄）
"""

import os
import sys
import psycopg2
import psycopg2.extras
from datetime import datetime, timezone
from typing import List, Dict, Optional
import statistics

# データベース接続
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("Error: DATABASE_URL environment variable not set")
    sys.exit(1)


def get_stocks_with_prices():
    """全銘柄と過去30日分の株価データを取得"""
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    try:
        # 銘柄マスタを取得
        cur.execute("""
            SELECT
                id,
                "tickerCode",
                name,
                "beginnerScore"
            FROM "Stock"
            WHERE "beginnerScore" IS NOT NULL
            ORDER BY "beginnerScore" DESC
        """)

        stocks = cur.fetchall()
        print(f"Found {len(stocks)} stocks in master")

        # 各銘柄の株価データを取得
        stocks_with_prices = []
        for stock in stocks:
            cur.execute("""
                SELECT
                    date,
                    close,
                    volume
                FROM "StockPrice"
                WHERE "stockId" = %s
                ORDER BY date DESC
                LIMIT 30
            """, (stock['id'],))

            prices = cur.fetchall()

            if len(prices) >= 7:  # 最低7日分のデータが必要
                stocks_with_prices.append({
                    **stock,
                    'prices': prices
                })

        print(f"Found {len(stocks_with_prices)} stocks with sufficient price data")
        return stocks_with_prices

    finally:
        cur.close()
        conn.close()


def calculate_surge_stocks(stocks: List[Dict]) -> List[Dict]:
    """
    surge（短期急騰）銘柄を抽出

    条件:
    - 7日間の株価上昇率: +5%以上
    - 初心者スコア: 50点以上
    """
    surge_candidates = []

    for stock in stocks:
        if stock['beginnerScore'] < 50:
            continue

        prices = stock['prices']
        if len(prices) < 7:
            continue

        # 7日間の上昇率を計算
        latest_price = float(prices[0]['close'])
        week_ago_price = float(prices[6]['close'])

        if week_ago_price == 0:
            continue

        change_rate = ((latest_price - week_ago_price) / week_ago_price) * 100

        if change_rate >= 5.0:
            surge_candidates.append({
                'stock': stock,
                'change_rate': change_rate,
                'latest_price': latest_price,
            })

    # 上昇率が高い順にソート
    surge_candidates.sort(key=lambda x: x['change_rate'], reverse=True)

    # Top 3を選出
    top_surge = surge_candidates[:3]

    # 選定根拠を生成（positionはカテゴリ内のインデックス、全体positionは後で設定）
    results = []
    for idx, candidate in enumerate(top_surge):
        stock = candidate['stock']
        change_rate = candidate['change_rate']
        score = stock['beginnerScore']

        reason = f"この1週間で株価が{change_rate:.1f}%上昇しています。初心者でも安心して投資できる銘柄です（スコア{score}点）"

        results.append({
            'stockId': stock['id'],
            'category': 'surge',
            'category_position': idx + 1,  # カテゴリ内の順位（1,2,3）
            'reason': reason,
            'score': score,
        })

    print(f"✅ Surge: {len(results)} stocks selected")
    return results


def calculate_stable_stocks(stocks: List[Dict]) -> List[Dict]:
    """
    stable（中長期安定）銘柄を抽出

    条件:
    - 初心者スコア: 70点以上
    - 30日間のボラティリティ: 15%以下
    """
    stable_candidates = []

    for stock in stocks:
        if stock['beginnerScore'] < 70:
            continue

        prices = stock['prices']
        if len(prices) < 30:
            continue

        # ボラティリティを計算（標準偏差 / 平均）
        close_prices = [float(p['close']) for p in prices]
        avg_price = statistics.mean(close_prices)
        std_dev = statistics.stdev(close_prices)

        if avg_price == 0:
            continue

        volatility = (std_dev / avg_price) * 100

        if volatility <= 15.0:
            stable_candidates.append({
                'stock': stock,
                'volatility': volatility,
            })

    # 初心者スコアが高い順にソート
    stable_candidates.sort(key=lambda x: x['stock']['beginnerScore'], reverse=True)

    # Top 3を選出
    top_stable = stable_candidates[:3]

    # 選定根拠を生成
    results = []
    for idx, candidate in enumerate(top_stable):
        stock = candidate['stock']
        volatility = candidate['volatility']
        score = stock['beginnerScore']

        reason = f"安定した値動きで、初心者に最適な銘柄です（スコア{score}点、変動率{volatility:.1f}%）"

        results.append({
            'stockId': stock['id'],
            'category': 'stable',
            'category_position': idx + 1,
            'reason': reason,
            'score': score,
        })

    print(f"✅ Stable: {len(results)} stocks selected")
    return results


def calculate_trending_stocks(stocks: List[Dict]) -> List[Dict]:
    """
    trending（話題）銘柄を抽出

    条件:
    - 7日間の平均取引高 > 過去30日間の平均取引高 × 1.5倍
    - 初心者スコア: 40点以上
    """
    trending_candidates = []

    for stock in stocks:
        if stock['beginnerScore'] < 40:
            continue

        prices = stock['prices']
        if len(prices) < 30:
            continue

        # 直近7日の平均取引高
        recent_volumes = [float(p['volume']) for p in prices[:7] if p['volume']]
        if not recent_volumes:
            continue
        recent_avg_volume = statistics.mean(recent_volumes)

        # 過去30日の平均取引高
        all_volumes = [float(p['volume']) for p in prices if p['volume']]
        if not all_volumes:
            continue
        total_avg_volume = statistics.mean(all_volumes)

        if total_avg_volume == 0:
            continue

        # 取引高増加率
        volume_ratio = recent_avg_volume / total_avg_volume

        if volume_ratio >= 1.5:
            trending_candidates.append({
                'stock': stock,
                'volume_ratio': volume_ratio,
            })

    # 取引高増加率が高い順にソート
    trending_candidates.sort(key=lambda x: x['volume_ratio'], reverse=True)

    # Top 3を選出
    top_trending = trending_candidates[:3]

    # 選定根拠を生成
    results = []
    for idx, candidate in enumerate(top_trending):
        stock = candidate['stock']
        volume_ratio = candidate['volume_ratio']
        score = stock['beginnerScore']

        reason = f"最近取引が活発になっている注目銘柄です（取引高{volume_ratio:.1f}倍、スコア{score}点）"

        results.append({
            'stockId': stock['id'],
            'category': 'trending',
            'category_position': idx + 1,
            'reason': reason,
            'score': score,
        })

    print(f"✅ Trending: {len(results)} stocks selected")
    return results


def save_daily_featured_stocks(featured_stocks: List[Dict]):
    """DailyFeaturedStockテーブルに保存"""
    if not featured_stocks:
        print("⚠️ No stocks to save")
        return

    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    try:
        today = datetime.now(timezone.utc).date()

        # 既存データを削除（今日の日付）
        cur.execute("""
            DELETE FROM "DailyFeaturedStock"
            WHERE date = %s
        """, (today,))

        deleted_count = cur.rowcount
        print(f"Deleted {deleted_count} existing records for {today}")

        # 新しいデータを挿入（positionは全体通し番号1-9）
        for idx, fs in enumerate(featured_stocks, 1):
            cur.execute("""
                INSERT INTO "DailyFeaturedStock"
                    (id, date, "stockId", category, position, reason, score, "createdAt")
                VALUES
                    (gen_random_uuid(), %s, %s, %s, %s, %s, %s, NOW())
            """, (
                today,
                fs['stockId'],
                fs['category'],
                idx,  # 全体通し番号（1-9）
                fs['reason'],
                fs['score'],
            ))

        conn.commit()
        print(f"✅ Saved {len(featured_stocks)} featured stocks for {today}")

    except Exception as e:
        conn.rollback()
        print(f"❌ Error saving featured stocks: {e}")
        sys.exit(1)
    finally:
        cur.close()
        conn.close()


def main():
    """メイン処理"""
    print("=" * 60)
    print("DailyFeaturedStock Generation")
    print("=" * 60)
    print(f"Time: {datetime.now(timezone.utc).isoformat()}")

    # 銘柄と株価データを取得
    print("\n📊 Fetching stocks and price data...")
    stocks = get_stocks_with_prices()

    if not stocks:
        print("⚠️ No stocks with sufficient price data. Exiting.")
        sys.exit(0)

    # 各カテゴリの銘柄を抽出
    print("\n🔍 Calculating featured stocks...")

    surge_stocks = calculate_surge_stocks(stocks)
    stable_stocks = calculate_stable_stocks(stocks)
    trending_stocks = calculate_trending_stocks(stocks)

    # 結果を結合
    all_featured = surge_stocks + stable_stocks + trending_stocks

    if not all_featured:
        print("⚠️ No stocks matched criteria today")
        sys.exit(0)

    # データベースに保存
    print("\n💾 Saving to database...")
    save_daily_featured_stocks(all_featured)

    # サマリー表示
    print("\n" + "=" * 60)
    print("✅ DailyFeaturedStock generation completed")
    print("=" * 60)
    print(f"Total featured stocks: {len(all_featured)}")
    print(f"  - Surge: {len(surge_stocks)}")
    print(f"  - Stable: {len(stable_stocks)}")
    print(f"  - Trending: {len(trending_stocks)}")
    print("=" * 60)


if __name__ == "__main__":
    main()
