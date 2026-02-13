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
from pathlib import Path

import json

import psycopg2
import pandas as pd
import yfinance as yf
import requests
from openai import OpenAI

# .envファイルから環境変数を読み込む（ローカル実行用）
env_path = Path(__file__).resolve().parents[2] / ".env"
if env_path.exists():
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def get_database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("Error: DATABASE_URL not set")
        sys.exit(1)
    return url


def get_slack_webhook() -> str:
    url = os.environ.get("REPORT_SLACK_WEBHOOK_URL")
    if not url:
        print("Error: REPORT_SLACK_WEBHOOK_URL not set")
        sys.exit(1)
    return url


def get_openai_client() -> OpenAI | None:
    """OpenAIクライアントを取得（APIキーがない場合はNone）"""
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("Warning: OPENAI_API_KEY not set, skipping AI insights")
        return None
    return OpenAI(api_key=api_key)


def generate_single_insight(client: OpenAI, category: str, data: dict) -> str | None:
    """単一カテゴリのAIインサイトを生成（1行）"""
    if data["count"] == 0:
        return None

    if category == "daily":
        data_text = f"""おすすめ銘柄のパフォーマンス:
- 分析件数: {data['count']}件
- 平均リターン: {data['avgReturn']:+.2f}%
- プラス率: {data['positiveRate']:.1f}%
- 成功率(+3%以上): {data['successRate']:.1f}%"""
        if data.get("best"):
            best_items = [f"{b['name']}({b['performance']:+.1f}%)" for b in data['best'][:2]]
            data_text += f"\n- ベスト: {', '.join(best_items)}"
        if data.get("worst"):
            worst_items = [f"{w['name']}({w['performance']:+.1f}%)" for w in data['worst'][:2]]
            data_text += f"\n- ワースト: {', '.join(worst_items)}"
        if data.get("topSectors"):
            top_text = ", ".join([f"{s}({d['avgReturn']:+.1f}%)" for s, d in data['topSectors'][:2]])
            data_text += f"\n- 好調セクター: {top_text}"
        if data.get("bottomSectors"):
            bottom_text = ", ".join([f"{s}({d['avgReturn']:+.1f}%)" for s, d in data['bottomSectors'][:2]])
            data_text += f"\n- 不調セクター: {bottom_text}"

    elif category == "purchase":
        data_text = f"""購入推奨のパフォーマンス:
- 分析件数: {data['count']}件
- 判断成功率: {data['successRate']:.1f}%
- 平均騰落率: {data['avgReturn']:+.2f}%"""
        for rec, stats in data.get("byRecommendation", {}).items():
            label = {"buy": "買い", "stay": "様子見", "remove": "見送り"}.get(rec, rec)
            data_text += f"\n- {label}判断: {stats['successRate']:.0f}%的中 ({stats['count']}件)"
        if data.get("topSectors"):
            top_text = ", ".join([f"{s}({d['successRate']:.0f}%)" for s, d in data['topSectors'][:2]])
            data_text += f"\n- 的中率高いセクター: {top_text}"
        if data.get("bottomSectors"):
            bottom_text = ", ".join([f"{s}({d['successRate']:.0f}%)" for s, d in data['bottomSectors'][:2]])
            data_text += f"\n- 的中率低いセクター: {bottom_text}"

    elif category == "analysis":
        data_text = f"""ポートフォリオ分析（短期予測）のパフォーマンス:
- 分析件数: {data['count']}件
- 予測的中率: {data['successRate']:.1f}%
- 平均騰落率: {data['avgReturn']:+.2f}%"""
        for trend, stats in data.get("byTrend", {}).items():
            label = {"up": "上昇予測", "down": "下落予測", "neutral": "横ばい予測"}.get(trend, trend)
            data_text += f"\n- {label}: {stats['successRate']:.0f}%的中 ({stats['count']}件)"
        if data.get("topSectors"):
            top_text = ", ".join([f"{s}({d['successRate']:.0f}%)" for s, d in data['topSectors'][:2]])
            data_text += f"\n- 予測精度高いセクター: {top_text}"
        if data.get("bottomSectors"):
            bottom_text = ", ".join([f"{s}({d['successRate']:.0f}%)" for s, d in data['bottomSectors'][:2]])
            data_text += f"\n- 予測精度低いセクター: {bottom_text}"
    else:
        return None

    prompt = f"""{data_text}

上記データを分析し、1行（40文字以内）でインサイトを提供してください。
具体的な数値を引用し、課題や傾向を簡潔に指摘してください。"""

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "あなたは株式投資AIの分析官です。簡潔に日本語で回答してください。"},
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
            max_tokens=100,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        print(f"    Warning: {category} insight failed: {e}")
        return None


def generate_improvement_suggestion(client: OpenAI, category: str, failures: list[dict]) -> str | None:
    """失敗パターンから改善提案を生成（1-2行）"""
    if not failures:
        return None

    if category == "daily":
        failure_text = "パフォーマンスが悪かったおすすめ銘柄:\n"
        for f in failures[:3]:
            details = []
            details.append(f['sector'])
            if f.get('marketCapCategory') and f['marketCapCategory'] != "不明":
                details.append(f['marketCapCategory'])
            if f.get('valuation') and f['valuation'] != "不明":
                details.append(f['valuation'])
            if f.get('pricePosition') and f['pricePosition'] != "不明":
                details.append(f['pricePosition'])
            if f.get('volatility'):
                details.append(f"ボラ{f['volatility']:.0f}%")
            failure_text += f"- {f['name']} ({', '.join(details)}): {f['performance']:+.1f}%\n"

        prompt = f"""{failure_text}
上記の銘柄選定を多角的に分析してください。
以下の観点から、今後の改善ポイントを1-2行（80文字以内）で提案してください：
- セクター（業種）の傾向
- 時価総額（大型/中型/小型）の傾向
- バリュエーション（PER/PBR）の傾向
- 株価位置（高値圏/安値圏）の傾向
- ボラティリティの傾向

具体的で実践的なアドバイスをお願いします。"""

    elif category == "purchase":
        failure_text = "外れた購入推奨:\n"
        for f in failures[:3]:
            rec_label = {"buy": "買い推奨", "stay": "様子見推奨", "remove": "見送り推奨"}.get(f["recommendation"], f["recommendation"])
            failure_text += f"- {f['name']}: {rec_label}→{f['performance']:+.1f}%\n"
            failure_text += f"  判断理由: {f.get('reason', '不明')[:100]}\n"

        prompt = f"""{failure_text}
上記の外れた判断を分析し、今後の判断精度を上げるための改善ポイントを1-2行（60文字以内）で提案してください。
具体的で実践的なアドバイスをお願いします。"""

    elif category == "analysis":
        failure_text = "外れた予測:\n"
        for f in failures[:3]:
            trend_label = {"up": "上昇予測", "down": "下落予測", "neutral": "横ばい予測"}.get(f["shortTermTrend"], f["shortTermTrend"])
            failure_text += f"- {f['name']}: {trend_label}→{f['performance']:+.1f}%\n"
            failure_text += f"  アドバイス: {f.get('advice', '不明')[:100]}\n"

        prompt = f"""{failure_text}
上記の外れた予測を分析し、今後の予測精度を上げるための改善ポイントを1-2行（60文字以内）で提案してください。
具体的で実践的なアドバイスをお願いします。"""

    else:
        return None

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "あなたは株式投資AIの分析改善アドバイザーです。簡潔に日本語で回答してください。"},
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
            max_tokens=150,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        print(f"    Warning: {category} improvement suggestion failed: {e}")
        return None


def generate_ai_insights(daily: dict, purchase: dict, analysis: dict) -> dict | None:
    """各カテゴリごとにAIインサイトを生成"""
    client = get_openai_client()
    if not client:
        return None

    total_count = daily["count"] + purchase["count"] + analysis["count"]
    if total_count == 0:
        return None

    insights = {}

    # 各カテゴリのインサイトを生成
    if daily["count"] > 0:
        insights["daily"] = generate_single_insight(client, "daily", daily)

    if purchase["count"] > 0:
        insights["purchase"] = generate_single_insight(client, "purchase", purchase)

    if analysis["count"] > 0:
        insights["analysis"] = generate_single_insight(client, "analysis", analysis)

    # 失敗例から改善提案を生成
    if daily.get("failures"):
        insights["dailyImprovement"] = generate_improvement_suggestion(client, "daily", daily["failures"])

    if purchase.get("failures"):
        insights["purchaseImprovement"] = generate_improvement_suggestion(client, "purchase", purchase["failures"])

    if analysis.get("failures"):
        insights["analysisImprovement"] = generate_improvement_suggestion(client, "analysis", analysis["failures"])

    return insights if any(insights.values()) else None


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
    """おすすめ銘柄を取得（多角的分析用の追加情報含む）"""
    target_date = datetime.now(timezone.utc) - timedelta(days=days_ago)

    with conn.cursor() as cur:
        cur.execute('''
            SELECT
                r.date,
                s."tickerCode",
                s.name,
                s.sector,
                s."marketCap",
                s.per,
                s.pbr,
                s.volatility,
                s."fiftyTwoWeekHigh",
                s."fiftyTwoWeekLow",
                s."latestPrice"
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
                "marketCap": float(row[4]) if row[4] else None,
                "per": float(row[5]) if row[5] else None,
                "pbr": float(row[6]) if row[6] else None,
                "volatility": float(row[7]) if row[7] else None,
                "fiftyTwoWeekHigh": float(row[8]) if row[8] else None,
                "fiftyTwoWeekLow": float(row[9]) if row[9] else None,
                "latestPrice": float(row[10]) if row[10] else None,
            }
            for row in cur.fetchall()
        ]


def analyze_daily_recommendations(data: list[dict], prices: dict) -> dict:
    """おすすめ銘柄のパフォーマンスを分析

    成功基準: 騰落率 > -3%（大きく下がらなければ成功）
    """
    today = datetime.now(timezone.utc).date()
    valid = []

    for d in data:
        price_at_rec, current_price = get_price_at_date(prices, d["tickerCode"], d["date"], today)
        if price_at_rec and current_price:
            perf = ((current_price - price_at_rec) / price_at_rec) * 100
            valid.append({**d, "performance": perf})

    if not valid:
        return {"count": 0, "avgReturn": 0, "positiveRate": 0, "successRate": 0, "best": [], "worst": [], "failures": []}

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

    # セクター別分析
    by_sector = defaultdict(list)
    for v in valid:
        sector = v.get("sector") or "その他"
        by_sector[sector].append(v["performance"])

    sector_stats = {}
    for sector, perfs_list in by_sector.items():
        if len(perfs_list) >= 2:  # 2件以上のみ
            sector_stats[sector] = {
                "count": len(perfs_list),
                "avgReturn": sum(perfs_list) / len(perfs_list),
                "successRate": sum(1 for p in perfs_list if p > -3) / len(perfs_list) * 100,  # 緩和: -3%以上
            }

    # 成績順にソート
    sorted_sectors = sorted(sector_stats.items(), key=lambda x: x[1]["avgReturn"], reverse=True)
    top_sectors = sorted_sectors[:3] if len(sorted_sectors) >= 3 else sorted_sectors
    bottom_sectors = sorted_sectors[-3:] if len(sorted_sectors) >= 3 else []

    # 失敗例を収集（-3%以下のもの）- 多角的分析用
    def categorize_market_cap(mc):
        if mc is None:
            return "不明"
        if mc >= 10000:
            return "大型株"
        if mc >= 1000:
            return "中型株"
        return "小型株"

    def categorize_valuation(per, pbr):
        if per is None and pbr is None:
            return "不明"
        issues = []
        if per and per > 20:
            issues.append("高PER")
        if pbr and pbr > 2:
            issues.append("高PBR")
        if per and per < 10:
            issues.append("低PER")
        if pbr and pbr < 1:
            issues.append("低PBR")
        return "・".join(issues) if issues else "標準"

    def categorize_price_position(latest, high, low):
        if latest is None or high is None or low is None:
            return "不明"
        if high == low:
            return "横ばい"
        position = (latest - low) / (high - low) * 100
        if position >= 80:
            return "高値圏"
        if position <= 20:
            return "安値圏"
        return "中間"

    failures = [
        {
            "name": v["name"],
            "tickerCode": v["tickerCode"],
            "sector": v.get("sector") or "その他",
            "performance": v["performance"],
            "marketCapCategory": categorize_market_cap(v.get("marketCap")),
            "valuation": categorize_valuation(v.get("per"), v.get("pbr")),
            "pricePosition": categorize_price_position(
                v.get("latestPrice"), v.get("fiftyTwoWeekHigh"), v.get("fiftyTwoWeekLow")
            ),
            "volatility": v.get("volatility"),
        }
        for v in valid
        if v["performance"] <= -3
    ]
    # パフォーマンスが悪い順にソート
    failures.sort(key=lambda x: x["performance"])

    return {
        "count": len(valid),
        "avgReturn": sum(perfs) / len(perfs),
        "positiveRate": sum(1 for p in perfs if p > 0) / len(perfs) * 100,
        "successRate": sum(1 for p in perfs if p > -3) / len(perfs) * 100,  # 緩和: -3%以上で成功
        "best": unique_best,
        "worst": unique_worst,
        "topSectors": top_sectors,
        "bottomSectors": bottom_sectors,
        "failures": failures[:3],  # 上位3件
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
                s.sector,
                p.reason
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
                "reason": row[5],
            }
            for row in cur.fetchall()
        ]


def analyze_purchase_recommendations(data: list[dict], prices: dict) -> dict:
    """購入推奨のパフォーマンスを分析

    成功基準（緩和版）:
    - buy: 騰落率 > -3%（大きく下がらなければ成功）
    - stay: 騰落率 <= 5%（5%以上の急騰を見逃さなければ成功）
    - remove: 騰落率 < 3%（大きく上がらなければ成功）
    """
    today = datetime.now(timezone.utc).date()
    valid = []

    for d in data:
        price_at_rec, current_price = get_price_at_date(prices, d["tickerCode"], d["date"], today)
        if price_at_rec and current_price:
            perf = ((current_price - price_at_rec) / price_at_rec) * 100
            rec = d["recommendation"]
            if rec == "buy":
                is_success = perf > -3  # 緩和: -3%以上
            elif rec == "stay":
                is_success = perf <= 5  # 緩和: 5%以下
            elif rec == "remove":
                is_success = perf < 3   # 緩和: 3%未満
            else:
                is_success = None
            valid.append({**d, "performance": perf, "isSuccess": is_success})

    if not valid:
        return {"count": 0, "avgReturn": 0, "successRate": 0, "byRecommendation": {}, "failures": []}

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

    # セクター別分析
    by_sector = defaultdict(list)
    for v in valid:
        if v["isSuccess"] is not None:
            sector = v.get("sector") or "その他"
            by_sector[sector].append(v["isSuccess"])

    sector_stats = {}
    for sector, results in by_sector.items():
        if len(results) >= 2:
            sector_stats[sector] = {
                "count": len(results),
                "successRate": sum(1 for r in results if r) / len(results) * 100,
            }

    sorted_sectors = sorted(sector_stats.items(), key=lambda x: x[1]["successRate"], reverse=True)
    top_sectors = sorted_sectors[:3] if len(sorted_sectors) >= 3 else sorted_sectors
    bottom_sectors = sorted_sectors[-3:] if len(sorted_sectors) >= 3 else []

    # 失敗例を収集（reason付き）
    failures = [
        {
            "name": v["name"],
            "tickerCode": v["tickerCode"],
            "recommendation": v["recommendation"],
            "performance": v["performance"],
            "reason": v.get("reason") or "",
        }
        for v in valid
        if v["isSuccess"] is False and v.get("reason")
    ]
    # パフォーマンスが悪い順にソート（buyなら下落幅が大きい順、stayなら上昇幅が大きい順）
    failures.sort(key=lambda x: -x["performance"] if x["recommendation"] == "stay" else x["performance"])

    return {
        "count": len(valid),
        "avgReturn": sum(perfs) / len(perfs),
        "successRate": sum(1 for s in successes if s) / len(successes) * 100 if successes else 0,
        "byRecommendation": by_rec_stats,
        "topSectors": top_sectors,
        "bottomSectors": bottom_sectors,
        "failures": failures[:3],  # 上位3件
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
                s.sector,
                a.advice
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
                "advice": row[6],
            }
            for row in cur.fetchall()
        ]


def analyze_stock_analyses(data: list[dict], prices: dict) -> dict:
    """ポートフォリオ分析のパフォーマンスを分析

    成功基準（緩和版）:
    - up: 騰落率 > -3%（大きく下がらなければ成功）
    - down: 騰落率 < 3%（大きく上がらなければ成功）
    - neutral: -5% <= 騰落率 <= 5%（大きく動かなければ成功）
    """
    today = datetime.now(timezone.utc).date()
    valid = []

    for d in data:
        price_at_rec, current_price = get_price_at_date(prices, d["tickerCode"], d["date"], today)
        if price_at_rec and current_price:
            perf = ((current_price - price_at_rec) / price_at_rec) * 100
            trend = d["shortTermTrend"]
            if trend == "up":
                is_success = perf > -3  # 緩和: -3%以上
            elif trend == "down":
                is_success = perf < 3   # 緩和: 3%未満
            elif trend == "neutral":
                is_success = -5 <= perf <= 5  # 緩和: ±5%以内
            else:
                is_success = None
            valid.append({**d, "performance": perf, "isSuccess": is_success})

    if not valid:
        return {"count": 0, "avgReturn": 0, "successRate": 0, "byTrend": {}, "failures": []}

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

    # セクター別分析
    by_sector = defaultdict(list)
    for v in valid:
        if v["isSuccess"] is not None:
            sector = v.get("sector") or "その他"
            by_sector[sector].append(v["isSuccess"])

    sector_stats = {}
    for sector, results in by_sector.items():
        if len(results) >= 2:
            sector_stats[sector] = {
                "count": len(results),
                "successRate": sum(1 for r in results if r) / len(results) * 100,
            }

    sorted_sectors = sorted(sector_stats.items(), key=lambda x: x[1]["successRate"], reverse=True)
    top_sectors = sorted_sectors[:3] if len(sorted_sectors) >= 3 else sorted_sectors
    bottom_sectors = sorted_sectors[-3:] if len(sorted_sectors) >= 3 else []

    # 失敗例を収集（advice付き）
    failures = [
        {
            "name": v["name"],
            "tickerCode": v["tickerCode"],
            "shortTermTrend": v["shortTermTrend"],
            "performance": v["performance"],
            "advice": v.get("advice") or "",
        }
        for v in valid
        if v["isSuccess"] is False and v.get("advice")
    ]
    # 予測と実際の乖離が大きい順にソート
    failures.sort(key=lambda x: abs(x["performance"]), reverse=True)

    return {
        "count": len(valid),
        "avgReturn": sum(perfs) / len(perfs),
        "successRate": sum(1 for s in successes if s) / len(successes) * 100 if successes else 0,
        "byTrend": by_trend_stats,
        "topSectors": top_sectors,
        "bottomSectors": bottom_sectors,
        "failures": failures[:3],  # 上位3件
    }


# ===== Slack通知 =====

def generate_slack_message(daily: dict, purchase: dict, analysis: dict, insights: dict | None = None) -> dict:
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
        # セクター分析
        if daily.get("topSectors") or daily.get("bottomSectors"):
            sector_parts = []
            if daily.get("topSectors"):
                top_text = ", ".join([f"{s}({d['avgReturn']:+.1f}%)" for s, d in daily["topSectors"][:2]])
                sector_parts.append(f"🔥好調: {top_text}")
            if daily.get("bottomSectors"):
                bottom_text = ", ".join([f"{s}({d['avgReturn']:+.1f}%)" for s, d in daily["bottomSectors"][:2]])
                sector_parts.append(f"🧊不調: {bottom_text}")
            if sector_parts:
                blocks.append({
                    "type": "context",
                    "elements": [{"type": "mrkdwn", "text": " | ".join(sector_parts)}]
                })
        # AIインサイト（おすすめ）
        if insights and insights.get("daily"):
            blocks.append({
                "type": "context",
                "elements": [{"type": "mrkdwn", "text": f"💡 _{insights['daily']}_"}]
            })
        # 失敗例（おすすめ銘柄）
        if daily.get("failures"):
            failure_lines = []
            for f in daily["failures"][:2]:
                failure_lines.append(f"• {f['name']} ({f['sector']}): {f['performance']:+.1f}%")
            blocks.append({
                "type": "context",
                "elements": [{"type": "mrkdwn", "text": "📝 *パフォーマンス不振:*\n" + "\n".join(failure_lines)}]
            })
            # 改善ポイント（おすすめ銘柄）
            if insights and insights.get("dailyImprovement"):
                blocks.append({
                    "type": "context",
                    "elements": [{"type": "mrkdwn", "text": f"🔧 *改善ポイント:* {insights['dailyImprovement']}"}]
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
        # セクター分析
        if purchase.get("topSectors") or purchase.get("bottomSectors"):
            sector_parts = []
            if purchase.get("topSectors"):
                top_text = ", ".join([f"{s}({d['successRate']:.0f}%)" for s, d in purchase["topSectors"][:2]])
                sector_parts.append(f"🎯的中: {top_text}")
            if purchase.get("bottomSectors"):
                bottom_text = ", ".join([f"{s}({d['successRate']:.0f}%)" for s, d in purchase["bottomSectors"][:2]])
                sector_parts.append(f"❌外れ: {bottom_text}")
            if sector_parts:
                blocks.append({
                    "type": "context",
                    "elements": [{"type": "mrkdwn", "text": " | ".join(sector_parts)}]
                })
        # AIインサイト（購入推奨）
        if insights and insights.get("purchase"):
            blocks.append({
                "type": "context",
                "elements": [{"type": "mrkdwn", "text": f"💡 _{insights['purchase']}_"}]
            })
        # 失敗例（購入推奨）
        if purchase.get("failures"):
            failure_lines = []
            for f in purchase["failures"][:2]:
                rec_label = {"buy": "買い→", "stay": "様子見→"}.get(f["recommendation"], "")
                reason_short = f["reason"][:30] + "..." if len(f["reason"]) > 30 else f["reason"]
                failure_lines.append(f"• {f['name']}: {rec_label}{f['performance']:+.1f}%「{reason_short}」")
            blocks.append({
                "type": "context",
                "elements": [{"type": "mrkdwn", "text": "📝 *外れた判断:*\n" + "\n".join(failure_lines)}]
            })
            # 改善ポイント（購入推奨）
            if insights and insights.get("purchaseImprovement"):
                blocks.append({
                    "type": "context",
                    "elements": [{"type": "mrkdwn", "text": f"🔧 *改善ポイント:* {insights['purchaseImprovement']}"}]
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
        # セクター分析
        if analysis.get("topSectors") or analysis.get("bottomSectors"):
            sector_parts = []
            if analysis.get("topSectors"):
                top_text = ", ".join([f"{s}({d['successRate']:.0f}%)" for s, d in analysis["topSectors"][:2]])
                sector_parts.append(f"🎯的中: {top_text}")
            if analysis.get("bottomSectors"):
                bottom_text = ", ".join([f"{s}({d['successRate']:.0f}%)" for s, d in analysis["bottomSectors"][:2]])
                sector_parts.append(f"❌外れ: {bottom_text}")
            if sector_parts:
                blocks.append({
                    "type": "context",
                    "elements": [{"type": "mrkdwn", "text": " | ".join(sector_parts)}]
                })
        # AIインサイト（ポートフォリオ分析）
        if insights and insights.get("analysis"):
            blocks.append({
                "type": "context",
                "elements": [{"type": "mrkdwn", "text": f"💡 _{insights['analysis']}_"}]
            })
        # 失敗例（ポートフォリオ分析）
        if analysis.get("failures"):
            failure_lines = []
            for f in analysis["failures"][:2]:
                trend_label = {"up": "上昇予測→", "down": "下落予測→", "neutral": "横ばい予測→"}.get(f["shortTermTrend"], "")
                advice_short = f["advice"][:30] + "..." if len(f["advice"]) > 30 else f["advice"]
                failure_lines.append(f"• {f['name']}: {trend_label}{f['performance']:+.1f}%「{advice_short}」")
            blocks.append({
                "type": "context",
                "elements": [{"type": "mrkdwn", "text": "📝 *外れた予測:*\n" + "\n".join(failure_lines)}]
            })
            # 改善ポイント（ポートフォリオ分析）
            if insights and insights.get("analysisImprovement"):
                blocks.append({
                    "type": "context",
                    "elements": [{"type": "mrkdwn", "text": f"🔧 *改善ポイント:* {insights['analysisImprovement']}"}]
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

        # 5. AIインサイト生成
        print("\n4. Generating AI insights...")
        insights = generate_ai_insights(daily_stats, purchase_stats, analysis_stats)
        if insights:
            for key, value in insights.items():
                if value:
                    label = {
                        "daily": "おすすめ",
                        "purchase": "購入推奨",
                        "analysis": "分析",
                        "dailyImprovement": "おすすめ・改善",
                        "purchaseImprovement": "購入推奨・改善",
                        "analysisImprovement": "分析・改善"
                    }.get(key, key)
                    print(f"   {label}: {value[:50]}...")
        else:
            print("   Skipped (no API key or error)")

        # 6. Slack通知
        print("\n5. Sending Slack notification...")
        message = generate_slack_message(daily_stats, purchase_stats, analysis_stats, insights)
        send_slack_notification(get_slack_webhook(), message)

        print("\n" + "=" * 60)
        print("Report completed!")

    finally:
        conn.close()


if __name__ == "__main__":
    main()
