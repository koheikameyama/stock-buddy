#!/usr/bin/env python3
"""
OpenAI API使用量チェックスクリプト

GitHub Actionsから毎日実行され、OpenAI APIの実際のコストを取得します。
予算の80%を超えた場合はアラートを出力します。

Costs APIを使用して、OpenAIが計算した実際の請求額を取得します。
"""

import os
import sys
import requests
from datetime import datetime, timedelta

# 環境変数
OPENAI_ADMIN_KEY = os.getenv("OPENAI_ADMIN_KEY")
OPENAI_PROJECT_ID = os.getenv("OPENAI_PROJECT_ID")
SLACK_WEBHOOK_URL = os.getenv("OPENAI_SLACK_WEBHOOK_URL")
MONTHLY_BUDGET_USD = float(os.getenv("MONTHLY_BUDGET_USD", "50"))

def get_costs_data(start_timestamp: int, end_timestamp: int) -> dict:
    """
    OpenAI Costs APIから実際のコストデータを取得（Stock Buddyプロジェクト専用）

    Args:
        start_timestamp: 開始日（UNIXタイムスタンプ）
        end_timestamp: 終了日（UNIXタイムスタンプ）

    Returns:
        コストデータ
    """
    url = "https://api.openai.com/v1/organization/costs"

    headers = {
        "Authorization": f"Bearer {OPENAI_ADMIN_KEY}",
        "Content-Type": "application/json",
        "OpenAI-Project": OPENAI_PROJECT_ID,
    }

    params = {
        "start_time": start_timestamp,
        "end_time": end_timestamp,
        "bucket_width": "1d",  # 日単位で集計
    }

    try:
        response = requests.get(url, headers=headers, params=params, timeout=30)
        response.raise_for_status()
        data = response.json()

        # デバッグ: レスポンス構造を出力
        print(f"📋 Costs API Response:")
        print(f"   Keys: {list(data.keys())}")
        if "data" in data and len(data["data"]) > 0:
            print(f"   First bucket: {data['data'][0]}")

        return data
    except requests.exceptions.RequestException as e:
        print(f"❌ Error fetching costs data: {e}")
        if hasattr(e, 'response') and e.response is not None:
            print(f"Response: {e.response.text}")
        sys.exit(1)

def calculate_total_cost(costs_data: dict) -> float:
    """
    Costs APIから取得した実際のコストを集計

    Args:
        costs_data: OpenAI Costs APIから取得したデータ

    Returns:
        総コスト（ドル）
    """
    total_cost = 0.0

    if "data" not in costs_data:
        print("⚠️  No 'data' field in costs response")
        return total_cost

    print(f"🔍 Processing {len(costs_data['data'])} buckets...")

    for bucket in costs_data["data"]:
        print(f"   Bucket keys: {list(bucket.keys())}")

        if "results" in bucket:
            for result in bucket["results"]:
                # amount.value がコスト（ドル単位、文字列）
                amount_value = result.get("amount", {}).get("value", 0)
                # 文字列の場合もあるのでfloatにキャスト（既にドル単位）
                cost_usd = float(amount_value) if amount_value else 0.0

                print(f"      Result: {result.get('line_item', 'unknown')} = ${cost_usd:.4f}")
                total_cost += cost_usd
        elif "amount" in bucket:
            # bucketレベルにamountがある場合
            amount_value = bucket.get("amount", {}).get("value", 0)
            cost_usd = float(amount_value) if amount_value else 0.0

            print(f"   Bucket amount: ${cost_usd:.4f}")
            total_cost += cost_usd

    return total_cost

def send_slack_notification(message: str, is_alert: bool = False):
    """
    Slack通知を送信

    Args:
        message: 送信するメッセージ
        is_alert: アラートかどうか（色を変える）
    """
    if not SLACK_WEBHOOK_URL:
        print("⚠️  Slack webhook URL not configured, skipping notification")
        return

    color = "#ff0000" if is_alert else "#36a64f"
    payload = {
        "attachments": [{
            "color": color,
            "title": "🚨 OpenAI APIコストアラート" if is_alert else "📊 OpenAI API使用量レポート",
            "text": message,
            "footer": "Stock Buddy Monitoring",
            "ts": int(datetime.now().timestamp())
        }]
    }

    try:
        response = requests.post(SLACK_WEBHOOK_URL, json=payload, timeout=10)
        response.raise_for_status()
        print(f"✅ Slack notification sent")
    except requests.exceptions.RequestException as e:
        print(f"⚠️  Failed to send Slack notification: {e}")

def main():
    """メイン処理"""

    if not OPENAI_ADMIN_KEY:
        print("❌ Error: OPENAI_ADMIN_KEY environment variable is not set")
        sys.exit(1)

    if not OPENAI_PROJECT_ID:
        print("❌ Error: OPENAI_PROJECT_ID environment variable is not set")
        sys.exit(1)

    # 今月の開始日と終了日を取得
    # OpenAI API仕様: end_date must come after start_date
    # 月初（1日）の場合は先月のデータを取得する
    today = datetime.now()

    if today.day == 1:
        # 月初の場合は先月のデータを取得
        last_month = today.replace(day=1) - timedelta(days=1)
        start_of_month = last_month.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        end_of_day = last_month.replace(hour=23, minute=59, second=59, microsecond=999999)
        period_label = f"{last_month.strftime('%Y-%m')} (先月分)"
    else:
        # 月初以外は今月のデータを昨日まで取得
        yesterday = today - timedelta(days=1)
        start_of_month = today.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        end_of_day = yesterday.replace(hour=23, minute=59, second=59, microsecond=999999)
        period_label = f"{today.strftime('%Y-%m')} (今月)"

    # UNIXタイムスタンプに変換
    start_timestamp = int(start_of_month.timestamp())
    end_timestamp = int(end_of_day.timestamp())

    print(f"📊 Checking OpenAI API costs: {period_label}")
    print(f"📅 Period: {start_of_month.strftime('%Y-%m-%d')} to {end_of_day.strftime('%Y-%m-%d')}")
    print(f"🎯 Project: Stock Buddy ({OPENAI_PROJECT_ID})")
    print(f"💰 Monthly budget: ${MONTHLY_BUDGET_USD}")
    print()

    # コストデータを取得
    costs_data = get_costs_data(start_timestamp, end_timestamp)

    # 実際のコストを集計
    total_cost = calculate_total_cost(costs_data)
    usage_percentage = (total_cost / MONTHLY_BUDGET_USD) * 100

    # 結果を表示
    print(f"✅ Total cost this month: ${total_cost:.2f}")
    print(f"📈 Budget usage: {usage_percentage:.1f}%")
    print(f"💵 Remaining budget: ${MONTHLY_BUDGET_USD - total_cost:.2f}")
    print()

    # Slack通知メッセージを作成
    slack_message = f"""
*期間*: {start_of_month.strftime('%Y-%m-%d')} 〜 {end_of_day.strftime('%Y-%m-%d')} ({period_label})
*プロジェクト*: Stock Buddy
*総コスト*: ${total_cost:.2f}
*予算*: ${MONTHLY_BUDGET_USD}
*使用率*: {usage_percentage:.1f}%
*残り*: ${MONTHLY_BUDGET_USD - total_cost:.2f}
"""

    # アラート判定とSlack通知
    is_alert = False
    if usage_percentage >= 100:
        print("🚨 CRITICAL: Budget exceeded! Immediate action required.")
        print("   - Consider reducing AI analysis frequency")
        print("   - Review API usage patterns")
        slack_message += "\n⚠️ *予算を超過しました！早急な対応が必要です*"
        is_alert = True
        send_slack_notification(slack_message, is_alert=True)
        sys.exit(1)
    elif usage_percentage >= 80:
        print("⚠️  WARNING: 80% of monthly budget used")
        print("   - Monitor usage closely")
        print("   - Consider optimizing prompts")
        slack_message += "\n⚠️ 予算の80%に達しました。使用量を注視してください"
        is_alert = True
        send_slack_notification(slack_message, is_alert=True)
    elif usage_percentage >= 50:
        print("ℹ️  INFO: 50% of monthly budget used")
        slack_message += "\nℹ️ 予算の50%に達しました"
        send_slack_notification(slack_message, is_alert=False)
    else:
        print("✅ Usage is within normal range")
        # 通常範囲の場合も毎日レポートを送信
        send_slack_notification(slack_message, is_alert=False)

    # 詳細データをMarkdown形式で出力（GitHub Actions Summaryで使用）
    print()
    print("## Usage Details")
    print(f"- **Period**: {start_of_month.strftime('%Y-%m-%d')} to {end_of_day.strftime('%Y-%m-%d')} ({period_label})")
    print(f"- **Project**: Stock Buddy ({OPENAI_PROJECT_ID})")
    print(f"- **Total Cost**: ${total_cost:.2f}")
    print(f"- **Budget**: ${MONTHLY_BUDGET_USD}")
    print(f"- **Usage**: {usage_percentage:.1f}%")
    print(f"- **Remaining**: ${MONTHLY_BUDGET_USD - total_cost:.2f}")

if __name__ == "__main__":
    main()
