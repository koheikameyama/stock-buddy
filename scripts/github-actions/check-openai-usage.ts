#!/usr/bin/env npx tsx
/**
 * OpenAI API使用量チェックスクリプト
 *
 * GitHub Actionsから毎日実行され、OpenAI APIの実際のコストを取得します。
 * 予算の80%を超えた場合はアラートを出力します。
 *
 * Costs APIを使用して、OpenAIが計算した実際の請求額を取得します。
 */

// 環境変数
const OPENAI_ADMIN_KEY = process.env.OPENAI_ADMIN_KEY
const OPENAI_PROJECT_ID = process.env.OPENAI_PROJECT_ID
const SLACK_WEBHOOK_URL = process.env.OPENAI_SLACK_WEBHOOK_URL
const MONTHLY_BUDGET_USD = parseFloat(process.env.MONTHLY_BUDGET_USD || "50")

interface CostsResult {
  amount?: {
    value?: string | number
  }
}

interface CostsBucket {
  results?: CostsResult[]
  amount?: {
    value?: string | number
  }
}

interface CostsResponse {
  data?: CostsBucket[]
}

async function getCostsData(startTimestamp: number, endTimestamp: number): Promise<CostsResponse> {
  const url = new URL("https://api.openai.com/v1/organization/costs")
  url.searchParams.set("start_time", startTimestamp.toString())
  url.searchParams.set("end_time", endTimestamp.toString())
  url.searchParams.set("bucket_width", "1d")

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${OPENAI_ADMIN_KEY}`,
        "Content-Type": "application/json",
        "OpenAI-Project": OPENAI_PROJECT_ID!,
      },
      signal: AbortSignal.timeout(30000),
    })

    if (!response.ok) {
      const text = await response.text()
      console.error(`❌ Error fetching costs data: ${response.status}`)
      console.error(`Response: ${text}`)
      process.exit(1)
    }

    return await response.json()
  } catch (error) {
    console.error(`❌ Error fetching costs data: ${error}`)
    process.exit(1)
  }
}

function calculateTotalCost(costsData: CostsResponse): number {
  let totalCost = 0.0

  if (!costsData.data) {
    return totalCost
  }

  for (const bucket of costsData.data) {
    if (bucket.results) {
      for (const result of bucket.results) {
        const amountValue = result.amount?.value ?? 0
        const costUsd = typeof amountValue === "string" ? parseFloat(amountValue) : amountValue
        totalCost += costUsd || 0
      }
    } else if (bucket.amount) {
      const amountValue = bucket.amount.value ?? 0
      const costUsd = typeof amountValue === "string" ? parseFloat(amountValue) : amountValue
      totalCost += costUsd || 0
    }
  }

  return totalCost
}

async function sendSlackNotification(message: string, isAlert: boolean = false): Promise<void> {
  if (!SLACK_WEBHOOK_URL) {
    console.log("⚠️  Slack webhook URL not configured, skipping notification")
    return
  }

  const color = isAlert ? "#ff0000" : "#36a64f"
  const payload = {
    attachments: [
      {
        color,
        title: isAlert ? "🚨 OpenAI APIコストアラート" : "📊 OpenAI API使用量レポート",
        text: message,
        footer: "Stock Buddy Monitoring",
        ts: Math.floor(Date.now() / 1000),
      },
    ],
  }

  try {
    const response = await fetch(SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    console.log("✅ Slack notification sent")
  } catch (error) {
    console.log(`⚠️  Failed to send Slack notification: ${error}`)
  }
}

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0]
}

async function main(): Promise<void> {
  if (!OPENAI_ADMIN_KEY) {
    console.error("❌ Error: OPENAI_ADMIN_KEY environment variable is not set")
    process.exit(1)
  }

  if (!OPENAI_PROJECT_ID) {
    console.error("❌ Error: OPENAI_PROJECT_ID environment variable is not set")
    process.exit(1)
  }

  const today = new Date()
  let startOfMonth: Date
  let endOfDay: Date
  let periodLabel: string

  if (today.getDate() === 1) {
    // 月初の場合は先月のデータを取得
    const lastMonth = new Date(today)
    lastMonth.setDate(0) // 先月の最終日
    startOfMonth = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1, 0, 0, 0, 0)
    endOfDay = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), lastMonth.getDate(), 23, 59, 59, 999)
    periodLabel = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")} (先月分)`
  } else {
    // 月初以外は今月のデータを昨日まで取得
    const yesterday = new Date(today)
    yesterday.setDate(today.getDate() - 1)
    startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0, 0)
    endOfDay = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59, 999)
    periodLabel = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")} (今月)`
  }

  const startTimestamp = Math.floor(startOfMonth.getTime() / 1000)
  const endTimestamp = Math.floor(endOfDay.getTime() / 1000)

  console.log(`📊 Checking OpenAI API costs: ${periodLabel}`)
  console.log(`📅 Period: ${formatDate(startOfMonth)} to ${formatDate(endOfDay)}`)
  console.log(`🎯 Project: Stock Buddy (${OPENAI_PROJECT_ID})`)
  console.log(`💰 Monthly budget: $${MONTHLY_BUDGET_USD}`)
  console.log()

  // コストデータを取得
  const costsData = await getCostsData(startTimestamp, endTimestamp)

  // 実際のコストを集計
  const totalCost = calculateTotalCost(costsData)
  const usagePercentage = (totalCost / MONTHLY_BUDGET_USD) * 100

  // 結果を表示
  console.log(`✅ Total cost this month: $${totalCost.toFixed(2)}`)
  console.log(`📈 Budget usage: ${usagePercentage.toFixed(1)}%`)
  console.log(`💵 Remaining budget: $${(MONTHLY_BUDGET_USD - totalCost).toFixed(2)}`)
  console.log()

  // Slack通知メッセージを作成
  let slackMessage = `
*期間*: ${formatDate(startOfMonth)} 〜 ${formatDate(endOfDay)} (${periodLabel})
*プロジェクト*: Stock Buddy
*総コスト*: $${totalCost.toFixed(2)}
*予算*: $${MONTHLY_BUDGET_USD}
*使用率*: ${usagePercentage.toFixed(1)}%
*残り*: $${(MONTHLY_BUDGET_USD - totalCost).toFixed(2)}
`

  // アラート判定とSlack通知
  if (usagePercentage >= 100) {
    console.log("🚨 CRITICAL: Budget exceeded! Immediate action required.")
    console.log("   - Consider reducing AI analysis frequency")
    console.log("   - Review API usage patterns")
    slackMessage += "\n⚠️ *予算を超過しました！早急な対応が必要です*"
    await sendSlackNotification(slackMessage, true)
    process.exit(1)
  } else if (usagePercentage >= 80) {
    console.log("⚠️  WARNING: 80% of monthly budget used")
    console.log("   - Monitor usage closely")
    console.log("   - Consider optimizing prompts")
    slackMessage += "\n⚠️ 予算の80%に達しました。使用量を注視してください"
    await sendSlackNotification(slackMessage, true)
  } else if (usagePercentage >= 50) {
    console.log("ℹ️  INFO: 50% of monthly budget used")
    slackMessage += "\nℹ️ 予算の50%に達しました"
    await sendSlackNotification(slackMessage, false)
  } else {
    console.log("✅ Usage is within normal range")
    await sendSlackNotification(slackMessage, false)
  }

  // 詳細データをMarkdown形式で出力（GitHub Actions Summaryで使用）
  console.log()
  console.log("## Usage Details")
  console.log(`- **Period**: ${formatDate(startOfMonth)} to ${formatDate(endOfDay)} (${periodLabel})`)
  console.log(`- **Project**: Stock Buddy (${OPENAI_PROJECT_ID})`)
  console.log(`- **Total Cost**: $${totalCost.toFixed(2)}`)
  console.log(`- **Budget**: $${MONTHLY_BUDGET_USD}`)
  console.log(`- **Usage**: ${usagePercentage.toFixed(1)}%`)
  console.log(`- **Remaining**: $${(MONTHLY_BUDGET_USD - totalCost).toFixed(2)}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

export {}
