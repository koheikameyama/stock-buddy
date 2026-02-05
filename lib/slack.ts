/**
 * Slack通知ユーティリティ
 */

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL

type SlackColor = "good" | "warning" | "danger" | string

interface SlackNotifyOptions {
  title: string
  message: string
  color?: SlackColor
  fields?: Array<{
    title: string
    value: string
    short?: boolean
  }>
}

/**
 * Slackにメッセージを送信
 */
export async function notifySlack(options: SlackNotifyOptions): Promise<void> {
  if (!SLACK_WEBHOOK_URL) {
    console.log("⚠️  SLACK_WEBHOOK_URL not configured, skipping notification")
    return
  }

  const payload = {
    attachments: [
      {
        color: options.color || "good",
        title: options.title,
        text: options.message,
        fields: options.fields,
        footer: "Stock Buddy",
        ts: Math.floor(Date.now() / 1000),
      },
    ],
  }

  try {
    const response = await fetch(SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      console.error(`Slack notification failed: ${response.status}`)
    }
  } catch (error) {
    console.error("Failed to send Slack notification:", error)
  }
}

/**
 * 進捗通知を送信
 */
export async function notifyProgress(
  title: string,
  current: number,
  total: number,
  details?: string
): Promise<void> {
  const percentage = Math.round((current / total) * 100)
  const message = `${current}/${total} (${percentage}%)${details ? `\n${details}` : ""}`

  await notifySlack({
    title,
    message,
    color: percentage === 100 ? "good" : "#439FE0",
  })
}
