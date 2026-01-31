import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import webpush from "web-push"

/**
 * POST /api/watchlist/check-alerts
 *
 * ウォッチリスト銘柄の価格アラートをチェック
 * 目標価格以下になった銘柄をプッシュ通知
 * GitHub Actionsから定期実行される
 */
export async function POST() {
  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // アラート有効なウォッチリストを取得
    const watchlists = await prisma.watchlist.findMany({
      where: {
        priceAlert: true,
        targetPrice: {
          not: null,
        },
      },
      include: {
        stock: {
          select: {
            id: true,
            tickerCode: true,
            name: true,
          },
        },
        user: {
          include: {
            pushSubscriptions: true,
          },
        },
      },
    })

    let notifiedCount = 0
    let skippedCount = 0

    for (const watchlist of watchlists) {
      // 今日の株価を取得
      const stockPrice = await prisma.stockPrice.findFirst({
        where: {
          stockId: watchlist.stockId,
          date: today,
        },
        select: {
          close: true,
        },
      })

      if (!stockPrice) {
        skippedCount++
        continue
      }

      const currentPrice = Number(stockPrice.close)
      const targetPrice = Number(watchlist.targetPrice)

      // 目標価格以下かチェック
      if (currentPrice <= targetPrice) {
        // 最後の通知から24時間以上経過しているかチェック
        const oneDayAgo = new Date()
        oneDayAgo.setHours(oneDayAgo.getHours() - 24)

        if (
          watchlist.lastAlertSent &&
          watchlist.lastAlertSent > oneDayAgo
        ) {
          // 24時間以内に通知済みなのでスキップ
          skippedCount++
          continue
        }

        // プッシュ通知を送信
        const notificationSent = await sendPriceAlert(
          watchlist.user.pushSubscriptions,
          watchlist.stock.name,
          watchlist.stock.tickerCode,
          currentPrice,
          targetPrice
        )

        if (notificationSent) {
          // 最後の通知日時を更新
          await prisma.watchlist.update({
            where: { id: watchlist.id },
            data: {
              lastAlertSent: new Date(),
            },
          })

          notifiedCount++
        } else {
          skippedCount++
        }
      } else {
        skippedCount++
      }
    }

    return NextResponse.json({
      success: true,
      message: "価格アラートをチェックしました",
      notifiedCount,
      skippedCount,
      totalCount: watchlists.length,
    })
  } catch (error) {
    console.error("Error checking price alerts:", error)
    return NextResponse.json(
      { error: "価格アラートのチェックに失敗しました" },
      { status: 500 }
    )
  }
}

/**
 * プッシュ通知を送信
 */
async function sendPriceAlert(
  subscriptions: Array<{
    endpoint: string
    p256dh: string
    auth: string
  }>,
  stockName: string,
  tickerCode: string,
  currentPrice: number,
  targetPrice: number
): Promise<boolean> {
  if (!subscriptions || subscriptions.length === 0) {
    return false
  }

  // VAPID設定
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY
  const vapidEmail = process.env.VAPID_EMAIL || "mailto:example@yourdomain.com"

  if (!vapidPublicKey || !vapidPrivateKey) {
    console.error("VAPID keys are not configured")
    return false
  }

  webpush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey)

  const payload = JSON.stringify({
    title: "🎯 買い時アラート",
    body: `${stockName}(${tickerCode})が目標価格(¥${targetPrice.toLocaleString()})以下になりました！\n現在価格: ¥${currentPrice.toLocaleString()}`,
    icon: "/icon-192x192.png",
    badge: "/icon-192x192.png",
    tag: `price-alert-${tickerCode}`,
    data: {
      url: "/dashboard",
    },
  })

  let sentCount = 0

  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
        },
        payload
      )
      sentCount++
    } catch (error) {
      console.error("Failed to send notification:", error)
    }
  }

  return sentCount > 0
}
