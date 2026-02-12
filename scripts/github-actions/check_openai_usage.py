#!/usr/bin/env python3
"""OpenAI API使用量チェックスクリプト"""

import os
import sys
from datetime import datetime, timedelta
import requests


OPENAI_ADMIN_KEY = os.environ.get("OPENAI_ADMIN_KEY")
OPENAI_PROJECT_ID = os.environ.get("OPENAI_PROJECT_ID")
SLACK_WEBHOOK_URL = os.environ.get("OPENAI_SLACK_WEBHOOK_URL")
MONTHLY_BUDGET_USD = float(os.environ.get("MONTHLY_BUDGET_USD", "50"))


def get_costs_data(start_timestamp: int, end_timestamp: int) -> dict:
    url = "https://api.openai.com/v1/organization/costs"
    params = {"start_time": str(start_timestamp), "end_time": str(end_timestamp), "bucket_width": "1d"}
    headers = {"Authorization": f"Bearer {OPENAI_ADMIN_KEY}", "Content-Type": "application/json", "OpenAI-Project": OPENAI_PROJECT_ID}

    try:
        response = requests.get(url, params=params, headers=headers, timeout=30)
        if not response.ok:
            print(f"❌ Error fetching costs data: {response.status_code}\nResponse: {response.text}")
            sys.exit(1)
        return response.json()
    except Exception as e:
        print(f"❌ Error fetching costs data: {e}")
        sys.exit(1)


def calculate_total_cost(costs_data: dict) -> float:
    total_cost = 0.0
    for bucket in costs_data.get("data", []):
        results = bucket.get("results", [])
        if results:
            for result in results:
                total_cost += float(result.get("amount", {}).get("value", 0) or 0)
        else:
            total_cost += float(bucket.get("amount", {}).get("value", 0) or 0)
    return total_cost


def send_slack_notification(message: str, is_alert: bool = False):
    if not SLACK_WEBHOOK_URL:
        print("⚠️  Slack webhook URL not configured")
        return
    color = "#ff0000" if is_alert else "#36a64f"
    title = "🚨 OpenAI APIコストアラート" if is_alert else "📊 OpenAI API使用量レポート"
    payload = {"attachments": [{"color": color, "title": title, "text": message, "footer": "Stock Buddy Monitoring", "ts": int(datetime.now().timestamp())}]}
    try:
        requests.post(SLACK_WEBHOOK_URL, json=payload, timeout=10)
        print("✅ Slack notification sent")
    except Exception as e:
        print(f"⚠️  Failed to send Slack notification: {e}")


def main():
    if not OPENAI_ADMIN_KEY:
        print("❌ Error: OPENAI_ADMIN_KEY environment variable is not set")
        sys.exit(1)
    if not OPENAI_PROJECT_ID:
        print("❌ Error: OPENAI_PROJECT_ID environment variable is not set")
        sys.exit(1)

    today = datetime.now()
    if today.day == 1:
        last_month_end = datetime(today.year, today.month, 1) - timedelta(days=1)
        start_of_month = datetime(last_month_end.year, last_month_end.month, 1)
        end_of_day = datetime(last_month_end.year, last_month_end.month, last_month_end.day, 23, 59, 59)
        period_label = f"{last_month_end.year}-{last_month_end.month:02d} (先月分)"
    else:
        yesterday = today - timedelta(days=1)
        start_of_month = datetime(today.year, today.month, 1)
        end_of_day = datetime(yesterday.year, yesterday.month, yesterday.day, 23, 59, 59)
        period_label = f"{today.year}-{today.month:02d} (今月)"

    print(f"📊 Checking OpenAI API costs: {period_label}")
    print(f"📅 Period: {start_of_month.date()} to {end_of_day.date()}")
    print(f"💰 Monthly budget: ${MONTHLY_BUDGET_USD}\n")

    costs_data = get_costs_data(int(start_of_month.timestamp()), int(end_of_day.timestamp()))
    total_cost = calculate_total_cost(costs_data)
    usage_percentage = (total_cost / MONTHLY_BUDGET_USD) * 100

    print(f"✅ Total cost: ${total_cost:.2f}")
    print(f"📈 Budget usage: {usage_percentage:.1f}%")
    print(f"💵 Remaining: ${MONTHLY_BUDGET_USD - total_cost:.2f}\n")

    slack_message = f"*期間*: {start_of_month.date()} 〜 {end_of_day.date()} ({period_label})\n*総コスト*: ${total_cost:.2f}\n*予算*: ${MONTHLY_BUDGET_USD}\n*使用率*: {usage_percentage:.1f}%"

    if usage_percentage >= 100:
        print("🚨 CRITICAL: Budget exceeded!")
        send_slack_notification(slack_message + "\n⚠️ *予算を超過しました！*", True)
        sys.exit(1)
    elif usage_percentage >= 80:
        print("⚠️  WARNING: 80% of budget used")
        send_slack_notification(slack_message + "\n⚠️ 予算の80%に達しました", True)
    else:
        print("✅ Usage is within normal range")
        send_slack_notification(slack_message, False)


if __name__ == "__main__":
    main()
