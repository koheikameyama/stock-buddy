#!/usr/bin/env python3
"""
業績データを取得してDBに保存するスクリプト

yfinanceから損益計算書データを取得し、Stockテーブルの業績カラムを更新する。

取得データ:
- latestRevenue: 直近通期売上高
- latestNetIncome: 直近通期純利益
- revenueGrowth: 売上高前年比（%）
- netIncomeGrowth: 純利益前年比（%）
- eps: 1株当たり利益（EPS）
- isProfitable: 黒字かどうか
- profitTrend: 'increasing' | 'decreasing' | 'stable'
"""

import os
import sys
from datetime import datetime

import psycopg2
import psycopg2.extras
import yfinance as yf

# 設定
CONFIG = {
    "BATCH_SIZE": 50,      # yfinance呼び出しバッチサイズ
    "DB_BATCH_SIZE": 100,  # DB更新のバッチサイズ
}


def get_database_url() -> str:
    """データベースURLを取得"""
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("Error: DATABASE_URL environment variable not set")
        sys.exit(1)
    return url


def fetch_stocks(conn) -> list[dict]:
    """DBから銘柄一覧を取得（ユーザー関連銘柄のみ）"""
    with conn.cursor() as cur:
        cur.execute('''
            SELECT DISTINCT s.id, s."tickerCode", s.name
            FROM "Stock" s
            WHERE s.id IN (
                SELECT "stockId" FROM "PortfolioStock"
                UNION
                SELECT "stockId" FROM "WatchlistStock"
                UNION
                SELECT "stockId" FROM "TrackedStock"
            )
            ORDER BY s."tickerCode"
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

        # EPS（1株当たり利益）- Basic EPSを優先、なければDiluted EPS
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
        print(f"  Error fetching {ticker_code}: {e}")
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
    print("業績データの取得を開始")
    print(f"開始時刻: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    conn = psycopg2.connect(get_database_url())

    try:
        # 対象銘柄を取得
        stocks = fetch_stocks(conn)
        print(f"\n対象銘柄数: {len(stocks)}")

        if not stocks:
            print("対象銘柄がありません")
            return

        success_count = 0
        error_count = 0
        skip_count = 0

        for i, stock in enumerate(stocks):
            ticker = stock["tickerCode"]
            print(f"\n[{i+1}/{len(stocks)}] {ticker} ({stock['name']})")

            # 業績データを取得
            data = fetch_earnings_data(ticker)

            if data is None:
                print("  -> データなし（スキップ）")
                skip_count += 1
                continue

            # DBに更新
            try:
                update_earnings_data(conn, stock["id"], data)
                conn.commit()

                # 結果表示
                revenue = data.get("latestRevenue")
                net_income = data.get("latestNetIncome")
                eps = data.get("eps")
                trend = data.get("profitTrend")
                profitable = "黒字" if data.get("isProfitable") else "赤字"

                revenue_str = f"{revenue/1e12:.2f}兆円" if revenue and revenue >= 1e12 else f"{revenue/1e8:.0f}億円" if revenue else "-"
                income_str = f"{net_income/1e12:.2f}兆円" if net_income and abs(net_income) >= 1e12 else f"{net_income/1e8:.0f}億円" if net_income else "-"
                eps_str = f"EPS: ¥{eps:.2f}" if eps else "EPS: -"

                print(f"  -> 売上: {revenue_str}, 純利益: {income_str} ({profitable}, {trend}), {eps_str}")
                success_count += 1

            except Exception as e:
                print(f"  -> DB更新エラー: {e}")
                conn.rollback()
                error_count += 1

        print("\n" + "=" * 60)
        print(f"完了: 成功={success_count}, スキップ={skip_count}, エラー={error_count}")
        print(f"終了時刻: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("=" * 60)

    finally:
        conn.close()


if __name__ == "__main__":
    main()
