#!/usr/bin/env python3
"""
OpenAI API使用量チェックスクリプト

GitHub Actionsから毎週月曜日に実行され、OpenAI APIの使用量とコストを取得します。
予算の80%を超えた場合はアラートを出力します。
"""

import os
import sys
import requests
from datetime import datetime, timedelta

# 環境変数
OPENAI_ADMIN_KEY = os.getenv("OPENAI_ADMIN_KEY")
MONTHLY_BUDGET_USD = 50  # 月次予算（ドル）

def get_usage_data(start_date: str, end_date: str) -> dict:
    """
    OpenAI Usage APIから使用量データを取得

    Args:
        start_date: 開始日（YYYY-MM-DD）
        end_date: 終了日（YYYY-MM-DD）

    Returns:
        使用量データ
    """
    url = "https://api.openai.com/v1/usage"

    headers = {
        "Authorization": f"Bearer {OPENAI_ADMIN_KEY}",
        "Content-Type": "application/json",
    }

    params = {
        "start_date": start_date,
        "end_date": end_date,
    }

    try:
        response = requests.get(url, headers=headers, params=params, timeout=30)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"❌ Error fetching usage data: {e}")
        sys.exit(1)

def calculate_cost(usage_data: dict) -> float:
    """
    使用量データからコストを計算

    Args:
        usage_data: OpenAI APIから取得した使用量データ

    Returns:
        総コスト（ドル）
    """
    total_cost = 0.0

    if "data" in usage_data:
        for day_data in usage_data["data"]:
            # APIレスポンスに応じて調整が必要
            # 例: day_data.get("cost", 0)
            total_cost += day_data.get("cost", 0)

    return total_cost

def main():
    """メイン処理"""

    if not OPENAI_ADMIN_KEY:
        print("❌ Error: OPENAI_ADMIN_KEY environment variable is not set")
        sys.exit(1)

    # 今月の開始日と今日の日付を取得
    today = datetime.now()
    start_of_month = today.replace(day=1).strftime("%Y-%m-%d")
    today_str = today.strftime("%Y-%m-%d")

    print(f"📊 Checking OpenAI API usage from {start_of_month} to {today_str}")
    print(f"💰 Monthly budget: ${MONTHLY_BUDGET_USD}")
    print()

    # 使用量データを取得
    usage_data = get_usage_data(start_of_month, today_str)

    # コストを計算
    total_cost = calculate_cost(usage_data)
    usage_percentage = (total_cost / MONTHLY_BUDGET_USD) * 100

    # 結果を表示
    print(f"✅ Total cost this month: ${total_cost:.2f}")
    print(f"📈 Budget usage: {usage_percentage:.1f}%")
    print(f"💵 Remaining budget: ${MONTHLY_BUDGET_USD - total_cost:.2f}")
    print()

    # アラート判定
    if usage_percentage >= 100:
        print("🚨 CRITICAL: Budget exceeded! Immediate action required.")
        print("   - Consider reducing AI analysis frequency")
        print("   - Review API usage patterns")
        sys.exit(1)
    elif usage_percentage >= 80:
        print("⚠️  WARNING: 80% of monthly budget used")
        print("   - Monitor usage closely")
        print("   - Consider optimizing prompts")
    elif usage_percentage >= 50:
        print("ℹ️  INFO: 50% of monthly budget used")
    else:
        print("✅ Usage is within normal range")

    # 詳細データをJSON形式で出力（GitHub Actions Summaryで使用）
    print()
    print("## Usage Details")
    print(f"- **Period**: {start_of_month} to {today_str}")
    print(f"- **Total Cost**: ${total_cost:.2f}")
    print(f"- **Budget**: ${MONTHLY_BUDGET_USD}")
    print(f"- **Usage**: {usage_percentage:.1f}%")
    print(f"- **Remaining**: ${MONTHLY_BUDGET_USD - total_cost:.2f}")

if __name__ == "__main__":
    main()
