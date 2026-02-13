#!/usr/bin/env python3
"""
AI分析パフォーマンス週次レポート

毎週日曜に過去7日間の3種類のAI分析パフォーマンスを集計してSlackに通知する。
- おすすめ銘柄 (UserDailyRecommendation)
- 購入推奨 (PurchaseRecommendation)
- ポートフォリオ分析 (StockAnalysis)

yfinanceで株価を取得してパフォーマンスを計算する。
"""

import os
import sys
from datetime import datetime, timedelta, timezone, date
from collections import defaultdict

import psycopg2
import pandas as pd
import yfinance as yf
import requests


def get_database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("Error: DATABASE_URL not set")
        sys.exit(1)
    return url


def get_slack_webhook() -> str:
    url = os.environ.get("SLACK_WEBHOOK_URL")
    if not url:
        print("Error: SLACK_WEBHOOK_URL not set")
        sys.exit(1)
    return url


def fetch_historical_prices(ticker_codes: list[str], start_date: datetime, end_date: datetime) -> dict:
    """yfinanceで期間中の株価を取得"""
    if not ticker_codes:
        return {}

    symbols = [f"{t}.T" if not t.endswith(".T") else t for t in ticker_codes]

    try:
        start = start_date - timedelta(days=3)
        end = end_date + timedelta(days=1)

        df = yf.download(symbols, start=start, end=end, progress=False)

        if df.empty:
            return {}

        result = {}
        for ticker in ticker_codes:
            symbol = f"{ticker}.T" if not ticker.endswith(".T") else ticker
            try:
                if len(symbols) == 1:
                    close_data = df["Close"]
                else:
                    close_data = df["Close"][symbol]

                prices = {}
                for date_idx, price in close_data.items():
                    if not pd.isna(price):
                        date_str = date_idx.strftime("%Y-%m-%d")
                        prices[date_str] = float(price)

                result[ticker] = prices
            except (KeyError, AttributeError):
                continue

        return result
    except Exception as e:
        print(f"Error fetching prices: {e}")
        return {}


def get_price_at_date(prices: dict, ticker: str, target_date, today) -> tuple[float | None, float | None]:
    """指定日と今日の株価を取得"""
    price_data = prices.get(ticker, {})
    if not price_data:
        return None, None

    # ターゲット日付の株価
    if isinstance(target_date, datetime):
        target_date = target_date.date()
    target_str = target_date.strftime("%Y-%m-%d")
    price_at_date = price_data.get(target_str)

    # 最も近い日付の株価を探す（休場日対応）
    if not price_at_date:
        for i in range(1, 5):
            alt_date = (target_date - timedelta(days=i)).strftime("%Y-%m-%d")
            if alt_date in price_data:
                price_at_date = price_data[alt_date]
                break

    # 今日の株価（最新）
    today_str = today.strftime("%Y-%m-%d")
    current_price = price_data.get(today_str)
    if not current_price:
        sorted_dates = sorted(price_data.keys(), reverse=True)
        if sorted_dates:
            current_price = price_data[sorted_dates[0]]

    return price_at_date, current_price


# ===== おすすめ銘柄 (UserDailyRecommendation) =====

def get_daily_recommendations(conn, days_ago: int = 7) -> list[dict]:
    """おすすめ銘柄を取得"""
    target_date = datetime.now(timezone.utc) - timedelta(days=days_ago)

    with conn.cursor() as cur:
        cur.execute('''
            SELECT
                r.date,
                s."tickerCode",
                s.name,
                s.sector
            FROM "UserDailyRecommendation" r
            JOIN "Stock" s ON r."stockId" = s.id
            WHERE r.date >= %s
            ORDER BY r.date DESC
        ''', (target_date,))

        return [
            {
                "date": row[0],
                "tickerCode": row[1],
                "name": row[2],
                "sector": row[3],
            }
            for row in cur.fetchall()
        ]


def analyze_daily_recommendations(data: list[dict], prices: dict) -> dict:
    """おすすめ銘柄のパフォーマンスを分析"""
    today = datetime.now(timezone.utc).date()
    valid = []

    for d in data:
        price_at_rec, current_price = get_price_at_date(prices, d["tickerCode"], d["date"], today)
        if price_at_rec and current_price:
            perf = ((current_price - price_at_rec) / price_at_rec) * 100
            valid.append({**d, "performance": perf})

    if not valid:
        return {"count": 0, "avgReturn": 0, "positiveRate": 0, "successRate": 0, "best": [], "worst": []}

    perfs = [v["performance"] for v in valid]
    sorted_valid = sorted(valid, key=lambda x: x["performance"], reverse=True)

    # ユニークな銘柄のみ（同じ銘柄が複数日に推奨されている場合の重複排除）
    seen_tickers = set()
    unique_best = []
    for v in sorted_valid:
        if v["tickerCode"] not in seen_tickers:
            unique_best.append(v)
            seen_tickers.add(v["tickerCode"])
        if len(unique_best) >= 3:
            break

    seen_tickers = set()
    unique_worst = []
    for v in reversed(sorted_valid):
        if v["tickerCode"] not in seen_tickers:
            unique_worst.append(v)
            seen_tickers.add(v["tickerCode"])
        if len(unique_worst) >= 3:
            break

    return {
        "count": len(valid),
        "avgReturn": sum(perfs) / len(perfs),
        "positiveRate": sum(1 for p in perfs if p > 0) / len(perfs) * 100,
        "successRate": sum(1 for p in perfs if p >= 3) / len(perfs) * 100,
        "best": unique_best,
        "worst": unique_worst,
    }


# ===== 購入推奨 (PurchaseRecommendation) =====

def get_purchase_recommendations(conn, days_ago: int = 7) -> list[dict]:
    """購入推奨を取得"""
    target_date = datetime.now(timezone.utc) - timedelta(days=days_ago)

    with conn.cursor() as cur:
        cur.execute('''
            SELECT
                p.date,
                p.recommendation,
                s."tickerCode",
                s.name,
                s.sector
            FROM "PurchaseRecommendation" p
            JOIN "Stock" s ON p."stockId" = s.id
            WHERE p.date >= %s
            ORDER BY p.date DESC
        ''', (target_date,))

        return [
            {
                "date": row[0],
                "recommendation": row[1],
                "tickerCode": row[2],
                "name": row[3],
                "sector": row[4],
            }
            for row in cur.fetchall()
        ]


def analyze_purchase_recommendations(data: list[dict], prices: dict) -> dict:
    """購入推奨のパフォーマンスを分析"""
    today = datetime.now(timezone.utc).date()
    valid = []

    for d in data:
        price_at_rec, current_price = get_price_at_date(prices, d["tickerCode"], d["date"], today)
        if price_at_rec and current_price:
            perf = ((current_price - price_at_rec) / price_at_rec) * 100
            rec = d["recommendation"]
            if rec == "buy":
                is_success = perf > 0
            elif rec == "stay":
                is_success = perf <= 3
            elif rec == "remove":
                is_success = perf < 0
            else:
                is_success = None
            valid.append({**d, "performance": perf, "isSuccess": is_success})

    if not valid:
        return {"count": 0, "avgReturn": 0, "successRate": 0, "byRecommendation": {}}

    perfs = [v["performance"] for v in valid]
    successes = [v["isSuccess"] for v in valid if v["isSuccess"] is not None]

    by_rec = defaultdict(list)
    for v in valid:
        if v["isSuccess"] is not None:
            by_rec[v["recommendation"]].append(v["isSuccess"])

    by_rec_stats = {}
    for rec, results in by_rec.items():
        by_rec_stats[rec] = {
            "count": len(results),
            "successRate": sum(1 for r in results if r) / len(results) * 100 if results else 0
        }

    return {
        "count": len(valid),
        "avgReturn": sum(perfs) / len(perfs),
        "successRate": sum(1 for s in successes if s) / len(successes) * 100 if successes else 0,
        "byRecommendation": by_rec_stats,
    }


# ===== ポートフォリオ分析 (StockAnalysis) =====

def get_stock_analyses(conn, days_ago: int = 7) -> list[dict]:
    """ポートフォリオ分析を取得"""
    target_date = datetime.now(timezone.utc) - timedelta(days=days_ago)

    with conn.cursor() as cur:
        cur.execute('''
            SELECT
                a."analyzedAt",
                a."shortTermTrend",
                a.recommendation,
                s."tickerCode",
                s.name,
                s.sector
            FROM "StockAnalysis" a
            JOIN "Stock" s ON a."stockId" = s.id
            WHERE a."analyzedAt" >= %s
            ORDER BY a."analyzedAt" DESC
        ''', (target_date,))

        return [
            {
                "date": row[0],
                "shortTermTrend": row[1],
                "recommendation": row[2],
                "tickerCode": row[3],
                "name": row[4],
                "sector": row[5],
            }
            for row in cur.fetchall()
        ]


def analyze_stock_analyses(data: list[dict], prices: dict) -> dict:
    """ポートフォリオ分析のパフォーマンスを分析"""
    today = datetime.now(timezone.utc).date()
    valid = []

    for d in data:
        price_at_rec, current_price = get_price_at_date(prices, d["tickerCode"], d["date"], today)
        if price_at_rec and current_price:
            perf = ((current_price - price_at_rec) / price_at_rec) * 100
            trend = d["shortTermTrend"]
            if trend == "up":
                is_success = perf > 0
            elif trend == "down":
                is_success = perf < 0
            elif trend == "neutral":
                is_success = -3 <= perf <= 3
            else:
                is_success = None
            valid.append({**d, "performance": perf, "isSuccess": is_success})

    if not valid:
        return {"count": 0, "avgReturn": 0, "successRate": 0, "byTrend": {}}

    perfs = [v["performance"] for v in valid]
    successes = [v["isSuccess"] for v in valid if v["isSuccess"] is not None]

    by_trend = defaultdict(list)
    for v in valid:
        if v["isSuccess"] is not None and v["shortTermTrend"]:
            by_trend[v["shortTermTrend"]].append(v["isSuccess"])

    by_trend_stats = {}
    for trend, results in by_trend.items():
        by_trend_stats[trend] = {
            "count": len(results),
            "successRate": sum(1 for r in results if r) / len(results) * 100 if results else 0
        }

    return {
        "count": len(valid),
        "avgReturn": sum(perfs) / len(perfs),
        "successRate": sum(1 for s in successes if s) / len(successes) * 100 if successes else 0,
        "byTrend": by_trend_stats,
    }


# ===== Slack通知 =====

def generate_slack_message(daily: dict, purchase: dict, analysis: dict) -> dict:
    """Slack通知用メッセージを生成"""
    blocks = [
        {
            "type": "header",
            "text": {"type": "plain_text", "text": "📊 AI分析 週次パフォーマンスレポート", "emoji": True}
        },
        {
            "type": "context",
            "elements": [{"type": "mrkdwn", "text": f"集計期間: 過去7日間 | 生成日時: {datetime.now().strftime('%Y-%m-%d %H:%M')}"}]
        },
        {"type": "divider"},
    ]

    # 1. おすすめ銘柄
    if daily["count"] > 0:
        emoji = "🟢" if daily["avgReturn"] > 0 else "🔴"
        blocks.append({
            "type": "section",
            "text": {"type": "mrkdwn", "text": f"*{emoji} おすすめ銘柄* ({daily['count']}件)"}
        })
        blocks.append({
            "type": "section",
            "fields": [
                {"type": "mrkdwn", "text": f"平均リターン: *{daily['avgReturn']:+.2f}%*"},
                {"type": "mrkdwn", "text": f"プラス率: *{daily['positiveRate']:.1f}%*"},
                {"type": "mrkdwn", "text": f"成功率(+3%以上): *{daily['successRate']:.1f}%*"},
            ]
        })
        if daily["best"]:
            best_text = " / ".join([f"{b['name']}({b['performance']:+.1f}%)" for b in daily["best"][:2]])
            worst_text = " / ".join([f"{w['name']}({w['performance']:+.1f}%)" for w in daily["worst"][:2]])
            blocks.append({
                "type": "context",
                "elements": [{"type": "mrkdwn", "text": f"Best: {best_text} | Worst: {worst_text}"}]
            })
        blocks.append({"type": "divider"})

    # 2. 購入推奨
    if purchase["count"] > 0:
        emoji = "🟢" if purchase["successRate"] > 50 else "🔴"
        blocks.append({
            "type": "section",
            "text": {"type": "mrkdwn", "text": f"*{emoji} 購入推奨* ({purchase['count']}件)"}
        })

        rec_text = []
        for rec, stats in purchase["byRecommendation"].items():
            label = {"buy": "買い", "stay": "様子見", "remove": "見送り"}.get(rec, rec)
            rec_text.append(f"{label}: {stats['successRate']:.0f}% ({stats['count']}件)")

        blocks.append({
            "type": "section",
            "fields": [
                {"type": "mrkdwn", "text": f"判断成功率: *{purchase['successRate']:.1f}%*"},
                {"type": "mrkdwn", "text": f"平均騰落率: *{purchase['avgReturn']:+.2f}%*"},
            ]
        })
        if rec_text:
            blocks.append({
                "type": "context",
                "elements": [{"type": "mrkdwn", "text": " | ".join(rec_text)}]
            })
        blocks.append({"type": "divider"})

    # 3. ポートフォリオ分析
    if analysis["count"] > 0:
        emoji = "🟢" if analysis["successRate"] > 50 else "🔴"
        blocks.append({
            "type": "section",
            "text": {"type": "mrkdwn", "text": f"*{emoji} ポートフォリオ分析* ({analysis['count']}件)"}
        })

        trend_text = []
        for trend, stats in analysis["byTrend"].items():
            label = {"up": "上昇予測", "down": "下落予測", "neutral": "横ばい予測"}.get(trend, trend)
            trend_text.append(f"{label}: {stats['successRate']:.0f}% ({stats['count']}件)")

        blocks.append({
            "type": "section",
            "fields": [
                {"type": "mrkdwn", "text": f"予測的中率: *{analysis['successRate']:.1f}%*"},
                {"type": "mrkdwn", "text": f"平均騰落率: *{analysis['avgReturn']:+.2f}%*"},
            ]
        })
        if trend_text:
            blocks.append({
                "type": "context",
                "elements": [{"type": "mrkdwn", "text": " | ".join(trend_text)}]
            })

    # フッター
    blocks.append({
        "type": "context",
        "elements": [{"type": "mrkdwn", "text": "Stock Buddy | 週次自動レポート"}]
    })

    # データがない場合
    total_count = daily["count"] + purchase["count"] + analysis["count"]
    if total_count == 0:
        return {
            "text": "AI分析パフォーマンスレポート",
            "blocks": [
                {
                    "type": "section",
                    "text": {"type": "mrkdwn", "text": "*AI分析パフォーマンスレポート*\n\n過去7日間の分析データがありませんでした。"}
                }
            ]
        }

    return {
        "text": f"AI分析パフォーマンスレポート: {total_count}件分析",
        "blocks": blocks
    }


def send_slack_notification(webhook_url: str, message: dict):
    """Slackに通知を送信"""
    response = requests.post(webhook_url, json=message, timeout=30)
    if response.status_code != 200:
        print(f"Slack notification failed: {response.status_code} {response.text}")
        sys.exit(1)
    print("Slack notification sent successfully")


def main():
    print("=" * 60)
    print("Weekly AI Analysis Performance Report")
    print("=" * 60)
    print(f"Time: {datetime.now().isoformat()}")

    conn = psycopg2.connect(get_database_url())

    try:
        # 1. 各データソースからデータ取得
        print("\n1. Fetching data from database...")
        daily_data = get_daily_recommendations(conn, days_ago=7)
        print(f"   Daily recommendations: {len(daily_data)} records")

        purchase_data = get_purchase_recommendations(conn, days_ago=7)
        print(f"   Purchase recommendations: {len(purchase_data)} records")

        analysis_data = get_stock_analyses(conn, days_ago=7)
        print(f"   Stock analyses: {len(analysis_data)} records")

        # 2. ユニークな銘柄を抽出
        all_tickers = set()
        for d in daily_data:
            all_tickers.add(d["tickerCode"])
        for d in purchase_data:
            all_tickers.add(d["tickerCode"])
        for d in analysis_data:
            all_tickers.add(d["tickerCode"])

        print(f"\n2. Fetching historical prices for {len(all_tickers)} stocks...")

        # 3. yfinanceで株価取得
        if all_tickers:
            all_dates = []
            for d in daily_data + purchase_data + analysis_data:
                date_val = d["date"]
                # datetime.dateをdatetime.datetimeに変換（混在対応）
                if isinstance(date_val, date) and not isinstance(date_val, datetime):
                    date_val = datetime.combine(date_val, datetime.min.time()).replace(tzinfo=timezone.utc)
                # timezone-naiveをUTCに変換
                elif isinstance(date_val, datetime) and date_val.tzinfo is None:
                    date_val = date_val.replace(tzinfo=timezone.utc)
                all_dates.append(date_val)
            min_date = min(all_dates) if all_dates else datetime.now(timezone.utc)
            max_date = datetime.now(timezone.utc)

            if isinstance(min_date, datetime):
                pass
            else:
                min_date = datetime.combine(min_date, datetime.min.time()).replace(tzinfo=timezone.utc)

            prices = fetch_historical_prices(list(all_tickers), min_date, max_date)
            print(f"   Got price data for {len(prices)} stocks")
        else:
            prices = {}

        # 4. パフォーマンス分析
        print("\n3. Analyzing performance...")
        daily_stats = analyze_daily_recommendations(daily_data, prices)
        print(f"   Daily: {daily_stats['count']} valid records")

        purchase_stats = analyze_purchase_recommendations(purchase_data, prices)
        print(f"   Purchase: {purchase_stats['count']} valid records")

        analysis_stats = analyze_stock_analyses(analysis_data, prices)
        print(f"   Analysis: {analysis_stats['count']} valid records")

        # 5. Slack通知
        print("\n4. Sending Slack notification...")
        message = generate_slack_message(daily_stats, purchase_stats, analysis_stats)
        send_slack_notification(get_slack_webhook(), message)

        print("\n" + "=" * 60)
        print("Report completed!")

    finally:
        conn.close()


if __name__ == "__main__":
    main()
