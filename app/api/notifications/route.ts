import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/auth-utils"
import { prisma } from "@/lib/prisma"

/**
 * GET /api/notifications
 * 通知一覧を取得（ページネーション対応）
 */
export async function GET(request: NextRequest) {
  const { user, error } = await getAuthUser()
  if (error) return error

  try {
    const { searchParams } = new URL(request.url)
    const unreadOnly = searchParams.get("unreadOnly") === "true"
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50)
    const cursor = searchParams.get("cursor")

    // 通知一覧を取得
    const notifications = await prisma.notification.findMany({
      where: {
        userId: user.id,
        ...(unreadOnly && { isRead: false }),
      },
      include: {
        stock: {
          select: {
            id: true,
            name: true,
            tickerCode: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor && {
        cursor: { id: cursor },
        skip: 1,
      }),
    })

    // 次ページがあるか確認
    const hasMore = notifications.length > limit
    if (hasMore) {
      notifications.pop()
    }

    // 未読件数を取得
    const unreadCount = await prisma.notification.count({
      where: {
        userId: user.id,
        isRead: false,
      },
    })

    return NextResponse.json({
      notifications: notifications.map((n) => ({
        id: n.id,
        type: n.type,
        stockId: n.stockId,
        stock: n.stock,
        title: n.title,
        body: n.body,
        url: n.url,
        triggerPrice: n.triggerPrice ? Number(n.triggerPrice) : null,
        targetPrice: n.targetPrice ? Number(n.targetPrice) : null,
        changeRate: n.changeRate ? Number(n.changeRate) : null,
        isRead: n.isRead,
        createdAt: n.createdAt.toISOString(),
        readAt: n.readAt?.toISOString() || null,
      })),
      hasMore,
      cursor: hasMore ? notifications[notifications.length - 1]?.id : null,
      unreadCount,
    })
  } catch (error) {
    console.error("Error fetching notifications:", error)
    return NextResponse.json(
      { error: "通知の取得に失敗しました" },
      { status: 500 }
    )
  }
}
