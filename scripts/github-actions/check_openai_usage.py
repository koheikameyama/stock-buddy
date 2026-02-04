#!/usr/bin/env python3
"""
OpenAI API使用量チェックスクリプト

GitHub Actionsから毎日実行され、OpenAI APIのトークン使用量を取得してコストを試算します。
予算の80%を超えた場合はアラートを出力します。

Usage APIを使用してトークン数を取得し、モデル別料金表から実際のコストを計算します。
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

def get_usage_data(start_timestamp: int, end_timestamp: int) -> dict:
    """
    OpenAI Usage APIからトークン使用量データを取得（Stock Buddyプロジェクト専用）

    Args:
        start_timestamp: 開始日（UNIXタイムスタンプ）
        end_timestamp: 終了日（UNIXタイムスタンプ）

    Returns:
        使用量データ
    """
    url = "https://api.openai.com/v1/organization/usage/completions"

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
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"❌ Error fetching usage data: {e}")
        if hasattr(e, 'response') and e.response is not None:
            print(f"Response: {e.response.text}")
        sys.exit(1)

def calculate_total_cost(usage_data: dict) -> float:
    """
    トークン使用量から総コストを計算

    料金（2026年1月時点）:
    - GPT-4o: $2.50/1M input, $10.00/1M output
    - GPT-4o Mini: $0.15/1M input, $0.60/1M output
    - GPT-4o Realtime: $5.00/1M input, $20.00/1M output
    - o1: $15.00/1M input, $60.00/1M output
    - o1-mini: $3.00/1M input, $12.00/1M output

    Args:
        usage_data: OpenAI Usage APIから取得したデータ

    Returns:
        総コスト（ドル）
    """
    # モデル別料金表（$/1M tokens）
    MODEL_PRICING = {
        "gpt-4o": {"input": 2.50, "output": 10.00},
        "gpt-4o-mini": {"input": 0.15, "output": 0.60},
        "gpt-4o-realtime": {"input": 5.00, "output": 20.00},
        "o1": {"input": 15.00, "output": 60.00},
        "o1-mini": {"input": 3.00, "output": 12.00},
        "gpt-4-turbo": {"input": 10.00, "output": 30.00},
    }

    total_cost = 0.0

    if "data" not in usage_data:
        return total_cost

    for bucket in usage_data["data"]:
        if "results" not in bucket:
            continue

        for result in bucket["results"]:
            model_name = result.get("model", "")
            num_requests = result.get("num_model_requests", 0)

            # トークン数を取得
            input_tokens = result.get("input_tokens", 0)
            output_tokens = result.get("output_tokens", 0)

            # デバッグ出力
            print(f"🔍 Debug: model={model_name or 'None'}, requests={num_requests}, input={input_tokens:,}, output={output_tokens:,}")

            # モデル名からベースモデルを判定
            model_pricing = None
            if model_name:
                for model_key in MODEL_PRICING:
                    if model_key in model_name.lower():
                        model_pricing = MODEL_PRICING[model_key]
                        break

            # 料金が見つからない場合はデフォルト（GPT-4o料金）
            if not model_pricing:
                model_pricing = MODEL_PRICING["gpt-4o"]
                if model_name:
                    print(f"⚠️  Unknown model: {model_name}, using GPT-4o pricing")

            # コスト計算（tokens / 1M * price）
            input_cost = (input_tokens / 1_000_000) * model_pricing["input"]
            output_cost = (output_tokens / 1_000_000) * model_pricing["output"]

            print(f"   💰 Cost: input=${input_cost:.4f} + output=${output_cost:.4f} = ${input_cost + output_cost:.4f}")

            total_cost += input_cost + output_cost

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

    # 使用量データを取得
    usage_data = get_usage_data(start_timestamp, end_timestamp)

    # トークン使用量からコストを計算
    total_cost = calculate_total_cost(usage_data)
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
