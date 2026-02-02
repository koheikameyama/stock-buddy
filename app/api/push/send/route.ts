import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import webpush from "web-push"

// VAPID設定を初期化（初回リクエスト時のみ実行）
let vapidInitialized = false
function initVapid() {
  if (!vapidInitialized && process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:noreply@stock-buddy.net",
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    )
    vapidInitialized = true
  }
}

export async function POST(request: NextRequest) {
  initVapid()

  try {
    // CRON_SECRETで認証
    const authHeader = request.headers.get("authorization")
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { title, body, url } = await request.json()

    // 全ユーザーのプッシュ購読を取得
    const subscriptions = await prisma.pushSubscription.findMany({
      include: {
        user: {
          include: {
            userStocks: true,
          },
        },
      },
    })

    // UserStockを持つユーザーにのみ通知
    const activeSubscriptions = subscriptions.filter(
      (sub) => sub.user.userStocks.length > 0
    )

    const results = {
      sent: 0,
      failed: 0,
      errors: [] as string[],
    }

    // 全購読者に通知を送信
    await Promise.all(
      activeSubscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh,
                auth: sub.auth,
              },
            },
            JSON.stringify({
              title,
              body,
              url,
            })
          )
          results.sent++
        } catch (error: any) {
          console.error(`Failed to send notification to ${sub.userId}:`, error)
          results.failed++
          results.errors.push(error.message)

          // 410 Gone: 購読が無効になった場合は削除
          if (error.statusCode === 410) {
            await prisma.pushSubscription.delete({
              where: { id: sub.id },
            })
          }
        }
      })
    )

    return NextResponse.json({
      success: true,
      sent: results.sent,
      failed: results.failed,
      errors: results.errors,
    })
  } catch (error) {
    console.error("Error sending push notifications:", error)
    return NextResponse.json(
      { error: "Failed to send notifications" },
      { status: 500 }
    )
  }
}
