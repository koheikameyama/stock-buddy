#!/usr/bin/env python3
"""
推奨銘柄パフォーマンス週次レポート

毎週日曜に過去7日間の推奨パフォーマンスを集計してSlackに通知する。
"""

import os
import sys
from datetime import datetime, timedelta, timezone
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


def get_recommendations(conn, days_ago: int = 7) -> list[dict]:
    """過去N日間の推奨を取得"""
    target_date = datetime.now(timezone.utc) - timedelta(days=days_ago)

    with conn.cursor() as cur:
        cur.execute('''
            SELECT
                r.id,
                r.date,
                r."stockId",
                r.position,
                s."tickerCode",
                s.name,
                s.sector
            FROM "UserDailyRecommendation" r
            JOIN "Stock" s ON r."stockId" = s.id
            WHERE r.date >= %s
            ORDER BY r.date DESC, r.position
        ''', (target_date,))

        rows = cur.fetchall()
        return [
            {
                "id": row[0],
                "date": row[1],
                "stockId": row[2],
                "position": row[3],
                "tickerCode": row[4],
                "name": row[5],
                "sector": row[6],
            }
            for row in rows
        ]


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


def analyze_performance(recommendations: list[dict], prices: dict) -> list[dict]:
    """パフォーマンスを計算"""
    results = []
    today = datetime.now(timezone.utc).date()

    for rec in recommendations:
        ticker = rec["tickerCode"]
        rec_date = rec["date"]

        if isinstance(rec_date, datetime):
            rec_date = rec_date.date()

        price_data = prices.get(ticker, {})

        rec_date_str = rec_date.strftime("%Y-%m-%d")
        price_at_rec = price_data.get(rec_date_str)

        today_str = today.strftime("%Y-%m-%d")
        current_price = price_data.get(today_str)

        if not current_price and price_data:
            sorted_dates = sorted(price_data.keys(), reverse=True)
            for d in sorted_dates:
                if d > rec_date_str:
                    current_price = price_data[d]
                    break

        performance = None
        days_held = (today - rec_date).days

        if price_at_rec and current_price:
            performance = ((current_price - price_at_rec) / price_at_rec) * 100

        results.append({
            **rec,
            "priceAtRec": price_at_rec,
            "currentPrice": current_price,
            "performance": round(performance, 2) if performance is not None else None,
            "daysHeld": days_held,
        })

    return results


def generate_slack_message(results: list[dict]) -> dict:
    """Slack通知用メッセージを生成"""
    valid = [r for r in results if r["performance"] is not None]

    if not valid:
        return {
            "text": "推奨銘柄パフォーマンスレポート",
            "blocks": [
                {
                    "type": "section",
                    "text": {"type": "mrkdwn", "text": "*推奨銘柄パフォーマンスレポート*\n\n分析可能なデータがありませんでした。"}
                }
            ]
        }

    # 日付範囲
    by_date = defaultdict(list)
    for r in valid:
        date_str = r["date"].strftime("%Y-%m-%d") if isinstance(r["date"], datetime) else str(r["date"])
        by_date[date_str].append(r)

    period_start = min(by_date.keys())
    period_end = max(by_date.keys())

    # 全体統計
    performances = [r["performance"] for r in valid]
    avg_perf = sum(performances) / len(performances)
    positive = sum(1 for p in performances if p > 0)
    success = sum(1 for p in performances if p >= 3)
    positive_rate = positive / len(valid) * 100
    success_rate = success / len(valid) * 100

    # ベスト/ワースト
    sorted_by_perf = sorted(valid, key=lambda x: x["performance"], reverse=True)
    best = sorted_by_perf[:3]
    worst = sorted_by_perf[-3:]

    # セクター別
    by_sector = defaultdict(list)
    for r in valid:
        sector = r["sector"] or "その他"
        by_sector[sector].append(r["performance"])

    sector_avg = [(s, sum(perfs)/len(perfs), len(perfs)) for s, perfs in by_sector.items()]
    sector_avg.sort(key=lambda x: x[1], reverse=True)

    # メッセージ構築
    status_emoji = "🟢" if avg_perf > 0 else "🔴"

    best_text = "\n".join([f"• {r['name']} ({r['tickerCode']}): *{r['performance']:+.1f}%*" for r in best])
    worst_text = "\n".join([f"• {r['name']} ({r['tickerCode']}): *{r['performance']:+.1f}%*" for r in worst])

    top_sectors = sector_avg[:3]
    bottom_sectors = sector_avg[-3:] if len(sector_avg) > 3 else []

    sector_text = "*好調セクター*\n"
    sector_text += "\n".join([f"• {s}: {avg:+.1f}% ({c}件)" for s, avg, c in top_sectors])
    if bottom_sectors:
        sector_text += "\n\n*不調セクター*\n"
        sector_text += "\n".join([f"• {s}: {avg:+.1f}% ({c}件)" for s, avg, c in bottom_sectors])

    return {
        "text": f"推奨銘柄パフォーマンスレポート: 平均{avg_perf:+.1f}%",
        "blocks": [
            {
                "type": "header",
                "text": {"type": "plain_text", "text": f"{status_emoji} 推奨銘柄パフォーマンスレポート", "emoji": True}
            },
            {
                "type": "context",
                "elements": [{"type": "mrkdwn", "text": f"期間: {period_start} 〜 {period_end} | 分析件数: {len(valid)}件"}]
            },
            {"type": "divider"},
            {
                "type": "section",
                "fields": [
                    {"type": "mrkdwn", "text": f"*平均リターン*\n{avg_perf:+.2f}%"},
                    {"type": "mrkdwn", "text": f"*プラス率*\n{positive_rate:.1f}% ({positive}/{len(valid)})"},
                    {"type": "mrkdwn", "text": f"*成功率(+3%以上)*\n{success_rate:.1f}% ({success}/{len(valid)})"},
                ]
            },
            {"type": "divider"},
            {
                "type": "section",
                "text": {"type": "mrkdwn", "text": f"*ベストパフォーマー*\n{best_text}"}
            },
            {
                "type": "section",
                "text": {"type": "mrkdwn", "text": f"*ワーストパフォーマー*\n{worst_text}"}
            },
            {"type": "divider"},
            {
                "type": "section",
                "text": {"type": "mrkdwn", "text": sector_text}
            },
            {
                "type": "context",
                "elements": [{"type": "mrkdwn", "text": "Stock Buddy | 週次自動レポート"}]
            }
        ]
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
    print("Weekly Recommendation Performance Report")
    print("=" * 60)
    print(f"Time: {datetime.now().isoformat()}")

    conn = psycopg2.connect(get_database_url())

    try:
        # 1. 過去7日間の推奨を取得
        print("\n1. Fetching recommendations from past 7 days...")
        recommendations = get_recommendations(conn, days_ago=7)
        print(f"   Found {len(recommendations)} recommendations")

        if not recommendations:
            print("No recommendations found.")
            # 空のレポートを送信
            message = generate_slack_message([])
            send_slack_notification(get_slack_webhook(), message)
            return

        # ユニークな銘柄
        unique_tickers = list(set(r["tickerCode"] for r in recommendations))
        print(f"   Unique stocks: {len(unique_tickers)}")

        # 2. 株価データを取得
        print("\n2. Fetching historical prices from yfinance...")
        min_date = min(r["date"] for r in recommendations)
        max_date = datetime.now(timezone.utc)

        if isinstance(min_date, datetime):
            pass
        else:
            min_date = datetime.combine(min_date, datetime.min.time()).replace(tzinfo=timezone.utc)

        prices = fetch_historical_prices(unique_tickers, min_date, max_date)
        print(f"   Got price data for {len(prices)} stocks")

        # 3. パフォーマンス分析
        print("\n3. Analyzing performance...")
        results = analyze_performance(recommendations, prices)

        # 4. Slack通知
        print("\n4. Sending Slack notification...")
        message = generate_slack_message(results)
        send_slack_notification(get_slack_webhook(), message)

        print("\n" + "=" * 60)
        print("Report completed!")

    finally:
        conn.close()


if __name__ == "__main__":
    main()
