#!/usr/bin/env python3
"""
ポートフォリオ総評を生成するスクリプト

ポートフォリオ + ウォッチリスト >= 3銘柄のユーザーに対して、
全体の分析（セクター分散度、ボラティリティなど）を生成します。
APIエンドポイントを呼び出してバッチ処理を実行します。

実行タイミング: 15:30 JST（大引け後のみ）
"""

import os
import sys
from datetime import datetime

import psycopg2
import requests


# 環境変数
TIME_CONTEXT = os.environ.get("TIME_CONTEXT", "morning")


def get_database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("Error: DATABASE_URL environment variable not set")
        sys.exit(1)
    return url


def get_app_url() -> str:
    url = os.environ.get("APP_URL")
    if not url:
        print("Error: APP_URL environment variable not set")
        sys.exit(1)
    return url


def get_cron_secret() -> str:
    secret = os.environ.get("CRON_SECRET")
    if not secret:
        print("Error: CRON_SECRET environment variable not set")
        sys.exit(1)
    return secret


def should_run() -> bool:
    """実行すべき時間帯かどうかを判定（15:30のみ）"""
    return TIME_CONTEXT == "close"


def fetch_eligible_users(conn) -> list[dict]:
    """対象ユーザーを取得（ポートフォリオ+ウォッチリスト >= 3銘柄）"""
    with conn.cursor() as cur:
        cur.execute('''
            SELECT
                u.id,
                (SELECT COUNT(*) FROM "PortfolioStock" ps WHERE ps."userId" = u.id) as portfolio_count,
                (SELECT COUNT(*) FROM "WatchlistStock" ws WHERE ws."userId" = u.id) as watchlist_count
            FROM "User" u
            WHERE
                (SELECT COUNT(*) FROM "PortfolioStock" ps WHERE ps."userId" = u.id) +
                (SELECT COUNT(*) FROM "WatchlistStock" ws WHERE ws."userId" = u.id) >= 3
        ''')
        rows = cur.fetchall()
        return [
            {
                "userId": row[0],
                "portfolioCount": row[1],
                "watchlistCount": row[2],
            }
            for row in rows
        ]


def generate_analysis_for_user(app_url: str, cron_secret: str, user_id: str) -> dict | None:
    """APIを呼び出してポートフォリオ総評を生成"""
    try:
        response = requests.post(
            f"{app_url}/api/portfolio/overall-analysis",
            headers={
                "Authorization": f"Bearer {cron_secret}",
                "Content-Type": "application/json",
            },
            json={"userId": user_id},
            timeout=120
        )

        if response.status_code == 200:
            return response.json()
        else:
            print(f"  Error: {response.status_code} - {response.text[:200]}")
            return None
    except requests.exceptions.Timeout:
        print("  Error: Request timed out")
        return None
    except Exception as e:
        print(f"  Error: {e}")
        return None


def main():
    print("=" * 60)
    print("ポートフォリオ総評の生成を開始")
    print(f"TIME_CONTEXT: {TIME_CONTEXT}")
    print("=" * 60)

    # 実行時間帯チェック
    if not should_run():
        print(f"スキップ: TIME_CONTEXT={TIME_CONTEXT}は実行対象外です")
        print("実行対象: close (15:30)のみ")
        return

    app_url = get_app_url()
    cron_secret = get_cron_secret()
    conn = psycopg2.connect(get_database_url())

    try:
        # 対象ユーザーを取得
        users = fetch_eligible_users(conn)
        print(f"\n対象ユーザー数: {len(users)}")

        if not users:
            print("対象ユーザーがいません")
            return

        success_count = 0
        error_count = 0

        for user in users:
            user_id = user["userId"]
            print(f"\n処理中: {user_id[:8]}... (P:{user['portfolioCount']}, W:{user['watchlistCount']})")

            result = generate_analysis_for_user(app_url, cron_secret, user_id)

            if not result:
                print("  -> 分析生成に失敗")
                error_count += 1
                continue

            print(f"  -> 完了: {result.get('overallStatus', 'N/A')}")
            success_count += 1

        print("\n" + "=" * 60)
        print(f"完了: 成功={success_count}, エラー={error_count}")
        print("=" * 60)

        # 全員失敗した場合はエラー終了
        if success_count == 0 and error_count > 0:
            sys.exit(1)

    finally:
        conn.close()


if __name__ == "__main__":
    main()
