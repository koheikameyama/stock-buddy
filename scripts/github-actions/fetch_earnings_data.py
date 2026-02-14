#!/usr/bin/env python3
"""
業績・財務データを取得してDBに保存するスクリプト

yfinanceから損益計算書データと財務指標を取得し、Stockテーブルを更新する。
週次で実行（毎週日曜 10:00 JST）

取得データ:
【業績データ（income_stmt）】
- latestRevenue: 直近通期売上高
- latestNetIncome: 直近通期純利益
- revenueGrowth: 売上高前年比（%）
- netIncomeGrowth: 純利益前年比（%）
- eps: 1株当たり利益（EPS）
- isProfitable: 黒字かどうか
- profitTrend: 'increasing' | 'decreasing' | 'stable'

【財務指標（stock.info）】
- marketCap: 時価総額（億円）
- dividendYield: 配当利回り（%）
- pbr: 株価純資産倍率
- per: 株価収益率
- roe: 自己資本利益率
- fiftyTwoWeekHigh: 52週高値
- fiftyTwoWeekLow: 52週安値
- operatingCF: 営業キャッシュフロー
- freeCF: フリーキャッシュフロー
"""

import os
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from threading import Lock

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
    """DBから全銘柄一覧を取得（おすすめ表示で全銘柄のデータが必要なため）"""
    with conn.cursor() as cur:
        cur.execute('''
            SELECT id, "tickerCode", name
            FROM "Stock"
            ORDER BY "tickerCode"
        ''')
        rows = cur.fetchall()

    return [{"id": row[0], "tickerCode": row[1], "name": row[2]} for row in rows]


def fetch_earnings_data(ticker_code: str) -> dict | None:
    """yfinanceから業績データと財務指標を取得"""
    try:
        stock = yf.Ticker(ticker_code)

        # === 財務指標（stock.info）===
        info = stock.info

        # 時価総額（円 → 億円）
        market_cap = info.get("marketCap")
        market_cap_oku = market_cap / 100_000_000 if market_cap else None

        # 配当利回り（小数 → %）
        dividend_yield = info.get("dividendYield")
        dividend_yield_pct = dividend_yield * 100 if dividend_yield else None

        # PBR（株価純資産倍率）
        pbr = info.get("priceToBook")

        # PER（株価収益率）- trailingPEを優先、なければforwardPE
        per = info.get("trailingPE") or info.get("forwardPE")

        # ROE（自己資本利益率）- 小数のまま保存
        roe = info.get("returnOnEquity")

        # 52週高値/安値
        fifty_two_week_high = info.get("fiftyTwoWeekHigh")
        fifty_two_week_low = info.get("fiftyTwoWeekLow")

        # 営業CF / フリーCF（円 → 億円）
        operating_cf = info.get("operatingCashflow")
        operating_cf_oku = operating_cf / 100_000_000 if operating_cf else None

        free_cf = info.get("freeCashflow")
        free_cf_oku = free_cf / 100_000_000 if free_cf else None

        # === 業績データ（income_stmt）===
        income = stock.income_stmt

        latest_revenue = None
        latest_net_income = None
        revenue_growth = None
        net_income_growth = None
        eps = None
        is_profitable = None
        profit_trend = None

        if income is not None and not income.empty:
            # 直近2年分のデータを取得
            years = income.columns[:2] if len(income.columns) >= 2 else income.columns

            # 売上高（Total Revenue）
            prev_revenue = None
            if "Total Revenue" in income.index:
                latest_revenue = float(income.loc["Total Revenue", years[0]]) if len(years) > 0 else None
                prev_revenue = float(income.loc["Total Revenue", years[1]]) if len(years) > 1 else None

            # 純利益（Net Income）
            prev_net_income = None
            if "Net Income" in income.index:
                latest_net_income = float(income.loc["Net Income", years[0]]) if len(years) > 0 else None
                prev_net_income = float(income.loc["Net Income", years[1]]) if len(years) > 1 else None

            # EPS（1株当たり利益）- Basic EPSを優先、なければDiluted EPS
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
            if latest_revenue and prev_revenue and prev_revenue != 0:
                revenue_growth = ((latest_revenue - prev_revenue) / abs(prev_revenue)) * 100

            if latest_net_income and prev_net_income and prev_net_income != 0:
                net_income_growth = ((latest_net_income - prev_net_income) / abs(prev_net_income)) * 100

            # 黒字判定
            is_profitable = latest_net_income > 0 if latest_net_income is not None else None

            # トレンド判定
            if net_income_growth is not None:
                if net_income_growth > 5:
                    profit_trend = "increasing"
                elif net_income_growth < -5:
                    profit_trend = "decreasing"
                else:
                    profit_trend = "stable"

        return {
            # 財務指標
            "marketCap": market_cap_oku,
            "dividendYield": dividend_yield_pct,
            "pbr": pbr,
            "per": per,
            "roe": roe,
            "fiftyTwoWeekHigh": fifty_two_week_high,
            "fiftyTwoWeekLow": fifty_two_week_low,
            "operatingCF": operating_cf_oku,
            "freeCF": free_cf_oku,
            # 業績データ
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


def update_financial_data(conn, stock_id: str, data: dict):
    """業績データと財務指標をDBに更新"""
    with conn.cursor() as cur:
        cur.execute('''
            UPDATE "Stock"
            SET
                -- 財務指標
                "marketCap" = %s,
                "dividendYield" = %s,
                "pbr" = %s,
                "per" = %s,
                "roe" = %s,
                "fiftyTwoWeekHigh" = %s,
                "fiftyTwoWeekLow" = %s,
                "operatingCF" = %s,
                "freeCF" = %s,
                "financialDataUpdatedAt" = NOW(),
                -- 業績データ
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
            # 財務指標
            data.get("marketCap"),
            data.get("dividendYield"),
            data.get("pbr"),
            data.get("per"),
            data.get("roe"),
            data.get("fiftyTwoWeekHigh"),
            data.get("fiftyTwoWeekLow"),
            data.get("operatingCF"),
            data.get("freeCF"),
            # 業績データ
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
    print("業績・財務データの取得を開始")
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

        # === Phase 1: yfinanceから並列取得 ===
        print("\n[Phase 1] yfinanceからデータ取得（並列処理）...")

        results = {}  # stock_id -> data
        fetch_errors = 0
        counter_lock = Lock()
        processed = [0]  # mutableにするためリストで

        def fetch_with_progress(stock):
            nonlocal fetch_errors
            data = fetch_earnings_data(stock["tickerCode"])
            with counter_lock:
                processed[0] += 1
                if processed[0] % 100 == 0:
                    print(f"  進捗: {processed[0]}/{len(stocks)} 銘柄取得完了")
            return stock["id"], data

        with ThreadPoolExecutor(max_workers=10) as executor:
            futures = {executor.submit(fetch_with_progress, stock): stock for stock in stocks}

            for future in as_completed(futures):
                stock_id, data = future.result()
                if data:
                    results[stock_id] = data
                else:
                    fetch_errors += 1

        print(f"  取得完了: 成功={len(results)}, 失敗={fetch_errors}")

        # === Phase 2: DBに一括更新 ===
        print("\n[Phase 2] DBに更新中...")

        success_count = 0
        db_errors = 0

        for stock in stocks:
            stock_id = stock["id"]
            data = results.get(stock_id)

            if not data:
                continue

            try:
                update_financial_data(conn, stock_id, data)
                success_count += 1

                # 100件ごとにコミット（パフォーマンス向上）
                if success_count % 100 == 0:
                    conn.commit()
                    print(f"  進捗: {success_count} 銘柄更新完了")

            except Exception as e:
                print(f"  DB更新エラー ({stock['tickerCode']}): {e}")
                conn.rollback()
                db_errors += 1

        # 残りをコミット
        conn.commit()

        print("\n" + "=" * 60)
        print("完了:")
        print(f"  - yfinance取得成功: {len(results)}")
        print(f"  - yfinance取得失敗: {fetch_errors}")
        print(f"  - DB更新成功: {success_count}")
        print(f"  - DB更新失敗: {db_errors}")
        print(f"終了時刻: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("=" * 60)

        # 全員失敗した場合はエラー終了
        if success_count == 0 and db_errors > 0:
            sys.exit(1)

    finally:
        conn.close()


if __name__ == "__main__":
    main()
