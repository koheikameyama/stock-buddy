#!/usr/bin/env npx tsx
/**
 * プッシュ通知を送信するスクリプト
 *
 * Usage:
 *   APP_URL="https://..." CRON_SECRET="..." npx tsx scripts/github-actions/send-push-notification.ts \
 *     --title "通知タイトル" \
 *     --body "通知本文" \
 *     --url "/path"
 */

interface PushResult {
  sent?: number
  failed?: number
  errors?: string[]
}

async function sendPushNotification(
  appUrl: string,
  cronSecret: string,
  title: string,
  body: string,
  url: string
): Promise<number> {
  const apiUrl = `${appUrl}/api/push/send`
  const headers = {
    Authorization: `Bearer ${cronSecret}`,
    "Content-Type": "application/json",
  }
  const payload = { title, body, url }

  console.log("📡 Sending push notification...")
  console.log(`   Title: ${title}`)
  console.log(`   Body: ${body}`)
  console.log(`   URL: ${url}`)

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000),
    })

    if (!response.ok) {
      const text = await response.text()
      console.error(`❌ API Error: ${response.status}`)
      console.error(`   Response: ${text}`)
      process.exit(1)
    }

    const result: PushResult = await response.json()
    console.log("✅ Push notification sent successfully")
    console.log(`   - Sent: ${result.sent ?? 0}`)
    console.log(`   - Failed: ${result.failed ?? 0}`)

    if (result.errors && result.errors.length > 0) {
      console.log("⚠️  Errors:")
      result.errors.slice(0, 5).forEach((error) => {
        console.log(`   - ${error}`)
      })
    }

    return 0
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      console.error("❌ Error: API request timed out")
    } else {
      console.error(`❌ Error sending push notification: ${error}`)
    }
    process.exit(1)
  }
}

function parseArgs(): { title: string; body: string; url: string } {
  const args = process.argv.slice(2)
  let title = ""
  let body = ""
  let url = ""

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--title" && args[i + 1]) {
      title = args[++i]
    } else if (args[i] === "--body" && args[i + 1]) {
      body = args[++i]
    } else if (args[i] === "--url" && args[i + 1]) {
      url = args[++i]
    }
  }

  if (!title || !body || !url) {
    console.error("Usage: npx tsx send-push-notification.ts --title <title> --body <body> --url <url>")
    process.exit(1)
  }

  return { title, body, url }
}

async function main(): Promise<number> {
  const { title, body, url } = parseArgs()

  const appUrl = process.env.APP_URL || "http://localhost:3000"
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret) {
    console.error("❌ Error: CRON_SECRET environment variable is required")
    process.exit(1)
  }

  return sendPushNotification(appUrl, cronSecret, title, body, url)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
