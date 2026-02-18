#!/usr/bin/env python3
"""OpenAI API使用量チェックスクリプト

トークン使用量を取得し、モデルごとの料金テーブルからコストを試算する。
"""

import os
import sys
from datetime import datetime, timedelta
import requests

OPENAI_ADMIN_KEY = os.environ.get("OPENAI_ADMIN_KEY")
OPENAI_PROJECT_ID = os.environ.get("OPENAI_PROJECT_ID")
SLACK_WEBHOOK_URL = os.environ.get("OPENAI_SLACK_WEBHOOK_URL")
MONTHLY_BUDGET_USD = float(os.environ.get("MONTHLY_BUDGET_USD", "50"))

# 為替レート（円/ドル）
USD_TO_JPY = 150

# gpt-4o-mini料金で統一計算 (USD per 1M tokens)
# https://openai.com/api/pricing/
GPT4O_MINI_PRICING = {"input": 0.15, "output": 0.60}


def get_usage_data(start_timestamp: int, end_timestamp: int) -> dict:
    """トークン使用量を取得"""
    url = "https://api.openai.com/v1/organization/usage/completions"
    params = {
        "start_time": str(start_timestamp),
        "end_time": str(end_timestamp),
        "bucket_width": "1d",
        "group_by": ["model"],
    }
    headers = {
        "Authorization": f"Bearer {OPENAI_ADMIN_KEY}",
        "Content-Type": "application/json",
    }
    if OPENAI_PROJECT_ID:
        headers["OpenAI-Project"] = OPENAI_PROJECT_ID

    try:
        response = requests.get(url, params=params, headers=headers, timeout=30)
        if not response.ok:
            print(f"❌ Error fetching usage data: {response.status_code}")
            print(f"Response: {response.text}")
            sys.exit(1)
        return response.json()
    except Exception as e:
        print(f"❌ Error fetching usage data: {e}")
        sys.exit(1)


def calculate_cost_from_tokens(usage_data: dict) -> tuple[float, int, int]:
    """トークン使用量からコストを計算（gpt-4o-mini料金で統一）

    Returns:
        tuple[float, int, int]: (総コストUSD, 総inputトークン, 総outputトークン)
    """
    total_input_tokens = 0
    total_output_tokens = 0

    for bucket in usage_data.get("data", []):
        for result in bucket.get("results", []):
            total_input_tokens += result.get("input_tokens", 0)
            total_output_tokens += result.get("output_tokens", 0)

    # gpt-4o-mini料金で計算
    input_cost = (total_input_tokens / 1_000_000) * GPT4O_MINI_PRICING["input"]
    output_cost = (total_output_tokens / 1_000_000) * GPT4O_MINI_PRICING["output"]
    total_cost = input_cost + output_cost

    return total_cost, total_input_tokens, total_output_tokens


def format_tokens(tokens: int) -> str:
    """トークン数を読みやすくフォーマット"""
    if tokens >= 1_000_000:
        return f"{tokens / 1_000_000:.2f}M"
    elif tokens >= 1_000:
        return f"{tokens / 1_000:.1f}K"
    return str(tokens)


def send_slack_notification(message: str, is_alert: bool = False):
    """Slack通知を送信"""
    if not SLACK_WEBHOOK_URL:
        print("⚠️  Slack webhook URL not configured")
        return

    color = "#ff0000" if is_alert else "#36a64f"
    title = "🚨 OpenAI APIコストアラート" if is_alert else "📊 OpenAI API使用量レポート"

    payload = {
        "attachments": [
            {
                "color": color,
                "title": title,
                "text": message,
                "footer": "Stock Buddy Monitoring",
                "ts": int(datetime.now().timestamp()),
            }
        ]
    }

    try:
        requests.post(SLACK_WEBHOOK_URL, json=payload, timeout=10)
        print("✅ Slack notification sent")
    except Exception as e:
        print(f"⚠️  Failed to send Slack notification: {e}")


def main():
    if not OPENAI_ADMIN_KEY:
        print("❌ Error: OPENAI_ADMIN_KEY environment variable is not set")
        sys.exit(1)

    today = datetime.now()

    # 月初の場合は先月分をレポート
    if today.day == 1:
        last_month_end = datetime(today.year, today.month, 1) - timedelta(days=1)
        start_of_month = datetime(last_month_end.year, last_month_end.month, 1)
        end_of_day = datetime(
            last_month_end.year, last_month_end.month, last_month_end.day, 23, 59, 59
        )
        period_label = f"{last_month_end.year}-{last_month_end.month:02d} (先月分)"
    else:
        yesterday = today - timedelta(days=1)
        start_of_month = datetime(today.year, today.month, 1)
        end_of_day = datetime(
            yesterday.year, yesterday.month, yesterday.day, 23, 59, 59
        )
        period_label = f"{today.year}-{today.month:02d} (今月)"

    # 予算を円換算
    budget_jpy = MONTHLY_BUDGET_USD * USD_TO_JPY

    print(f"📊 Checking OpenAI API usage: {period_label}")
    print(f"📅 Period: {start_of_month.date()} to {end_of_day.date()}")
    print(f"💰 Monthly budget: ¥{budget_jpy:,.0f} (${MONTHLY_BUDGET_USD})\n")

    # トークン使用量を取得
    usage_data = get_usage_data(
        int(start_of_month.timestamp()), int(end_of_day.timestamp())
    )

    # コストを計算（gpt-4o-mini料金で統一）
    total_cost_usd, input_tokens, output_tokens = calculate_cost_from_tokens(usage_data)
    total_cost_jpy = total_cost_usd * USD_TO_JPY
    usage_percentage = (total_cost_usd / MONTHLY_BUDGET_USD) * 100

    # コンソール出力
    print(f"✅ Estimated cost: ¥{total_cost_jpy:,.0f} (${total_cost_usd:.4f})")
    print(f"📈 Budget usage: {usage_percentage:.1f}%")
    print(f"💵 Remaining: ¥{budget_jpy - total_cost_jpy:,.0f}")
    print(f"📊 Tokens: in={format_tokens(input_tokens)}, out={format_tokens(output_tokens)}")
    print("ℹ️  ※gpt-4o-mini料金で試算\n")

    # Slack通知メッセージ作成
    slack_lines = [
        f"*期間*: {start_of_month.date()} 〜 {end_of_day.date()} ({period_label})",
        f"*推定コスト*: ¥{total_cost_jpy:,.0f}",
        f"*予算*: ¥{budget_jpy:,.0f}",
        f"*使用率*: {usage_percentage:.1f}%",
        f"*トークン*: in={format_tokens(input_tokens)}, out={format_tokens(output_tokens)}",
        "",
        f"_※gpt-4o-mini料金で試算（$1=¥{USD_TO_JPY}）_",
    ]

    slack_message = "\n".join(slack_lines)

    # アラート判定
    if usage_percentage >= 100:
        print("🚨 CRITICAL: Budget exceeded!")
        send_slack_notification(slack_message + "\n\n⚠️ *予算を超過しました！*", True)
        sys.exit(1)
    elif usage_percentage >= 80:
        print("⚠️  WARNING: 80% of budget used")
        send_slack_notification(slack_message + "\n\n⚠️ 予算の80%に達しました", True)
    else:
        print("✅ Usage is within normal range")
        send_slack_notification(slack_message, False)


if __name__ == "__main__":
    main()
