#!/usr/bin/env python3
"""
全銘柄の業績データを一括取得するスクリプト

使用方法:
  python scripts/fetch_all_earnings.py

注意:
  - 約2時間かかります
  - .envファイルのDATABASE_URLを使用します
"""

import os
import sys
import time
from datetime import datetime
from pathlib import Path

# .envファイルを読み込む
env_path = Path(__file__).parent.parent / ".env"
if env_path.exists():
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                # クォートを除去
                value = value.strip().strip('"').strip("'")
                os.environ.setdefault(key, value)

import psycopg2
import yfinance as yf


def get_database_url() -> str:
    """データベースURLを取得"""
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("Error: DATABASE_URL environment variable not set")
        print("Hint: .envファイルにDATABASE_URLを設定してください")
        sys.exit(1)
    return url


def fetch_all_stocks(conn) -> list[dict]:
    """全銘柄を取得"""
    with conn.cursor() as cur:
        cur.execute('''
            SELECT id, "tickerCode", name
            FROM "Stock"
            WHERE "earningsUpdatedAt" IS NULL
               OR "earningsUpdatedAt" < NOW() - INTERVAL '30 days'
            ORDER BY "tickerCode"
        ''')
        rows = cur.fetchall()

    return [{"id": row[0], "tickerCode": row[1], "name": row[2]} for row in rows]


def fetch_earnings_data(ticker_code: str) -> dict | None:
    """yfinanceから業績データを取得"""
    try:
        stock = yf.Ticker(ticker_code)
        income = stock.income_stmt

        if income is None or income.empty:
            return None

        # 直近2年分のデータを取得
        years = income.columns[:2] if len(income.columns) >= 2 else income.columns

        # 売上高（Total Revenue）
        latest_revenue = None
        prev_revenue = None
        if "Total Revenue" in income.index:
            latest_revenue = float(income.loc["Total Revenue", years[0]]) if len(years) > 0 else None
            prev_revenue = float(income.loc["Total Revenue", years[1]]) if len(years) > 1 else None

        # 純利益（Net Income）
        latest_net_income = None
        prev_net_income = None
        if "Net Income" in income.index:
            latest_net_income = float(income.loc["Net Income", years[0]]) if len(years) > 0 else None
            prev_net_income = float(income.loc["Net Income", years[1]]) if len(years) > 1 else None

        # EPS（1株当たり利益）
        eps = None
        if "Basic EPS" in income.index and len(years) > 0:
            try:
                eps = float(income.loc["Basic EPS", years[0]])
            except:
                pass
        if eps is None and "Diluted EPS" in income.index and len(years) > 0:
            try:
                eps = float(income.loc["Diluted EPS", years[0]])
            except:
                pass

        # 前年比計算
        revenue_growth = None
        if latest_revenue and prev_revenue and prev_revenue != 0:
            revenue_growth = ((latest_revenue - prev_revenue) / abs(prev_revenue)) * 100

        net_income_growth = None
        if latest_net_income and prev_net_income and prev_net_income != 0:
            net_income_growth = ((latest_net_income - prev_net_income) / abs(prev_net_income)) * 100

        # 黒字判定
        is_profitable = latest_net_income > 0 if latest_net_income is not None else None

        # トレンド判定
        profit_trend = None
        if net_income_growth is not None:
            if net_income_growth > 5:
                profit_trend = "increasing"
            elif net_income_growth < -5:
                profit_trend = "decreasing"
            else:
                profit_trend = "stable"

        return {
            "latestRevenue": latest_revenue,
            "latestNetIncome": latest_net_income,
            "revenueGrowth": revenue_growth,
            "netIncomeGrowth": net_income_growth,
            "eps": eps,
            "isProfitable": is_profitable,
            "profitTrend": profit_trend,
        }

    except Exception as e:
        return None


def update_earnings_data(conn, stock_id: str, data: dict):
    """業績データをDBに更新"""
    with conn.cursor() as cur:
        cur.execute('''
            UPDATE "Stock"
            SET
                "latestRevenue" = %s,
                "latestNetIncome" = %s,
                "revenueGrowth" = %s,
                "netIncomeGrowth" = %s,
                "eps" = %s,
                "isProfitable" = %s,
                "profitTrend" = %s,
                "earningsUpdatedAt" = NOW()
            WHERE id = %s
        ''', (
            data.get("latestRevenue"),
            data.get("latestNetIncome"),
            data.get("revenueGrowth"),
            data.get("netIncomeGrowth"),
            data.get("eps"),
            data.get("isProfitable"),
            data.get("profitTrend"),
            stock_id,
        ))


def main():
    print("=" * 60)
    print("全銘柄の業績データ取得を開始")
    print(f"開始時刻: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    conn = psycopg2.connect(get_database_url())

    try:
        # 対象銘柄を取得（未取得 or 30日以上前に取得した銘柄）
        stocks = fetch_all_stocks(conn)
        print(f"\n対象銘柄数: {len(stocks)}")

        if not stocks:
            print("対象銘柄がありません（全て取得済み）")
            return

        estimated_minutes = len(stocks) * 1.5 / 60
        print(f"推定時間: 約{estimated_minutes:.0f}分")
        print()

        success_count = 0
        error_count = 0
        skip_count = 0
        start_time = time.time()

        for i, stock in enumerate(stocks):
            ticker = stock["tickerCode"]

            # 進捗表示（100件ごと）
            if i > 0 and i % 100 == 0:
                elapsed = time.time() - start_time
                rate = i / elapsed
                remaining = (len(stocks) - i) / rate / 60
                print(f"\n--- 進捗: {i}/{len(stocks)} ({i/len(stocks)*100:.1f}%) 残り約{remaining:.0f}分 ---\n")

            # 業績データを取得
            data = fetch_earnings_data(ticker)

            if data is None:
                skip_count += 1
                continue

            # DBに更新
            try:
                update_earnings_data(conn, stock["id"], data)
                conn.commit()

                # 結果表示（黒字/赤字のみ）
                profitable = "黒" if data.get("isProfitable") else "赤"
                print(f"[{i+1}] {ticker}: {profitable}")
                success_count += 1

            except Exception as e:
                print(f"[{i+1}] {ticker}: DB更新エラー - {e}")
                conn.rollback()
                error_count += 1

            # レート制限対策（0.5秒待機）
            time.sleep(0.5)

        elapsed_total = (time.time() - start_time) / 60
        print("\n" + "=" * 60)
        print(f"完了: 成功={success_count}, スキップ={skip_count}, エラー={error_count}")
        print(f"実行時間: {elapsed_total:.1f}分")
        print(f"終了時刻: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("=" * 60)

    finally:
        conn.close()


if __name__ == "__main__":
    main()
