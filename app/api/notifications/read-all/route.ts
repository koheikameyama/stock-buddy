import { NextResponse } from "next/server"
import { getAuthUser } from "@/lib/auth-utils"
import { prisma } from "@/lib/prisma"

/**
 * POST /api/notifications/read-all
 * すべての通知を既読にする
 */
export async function POST() {
  const { user, error } = await getAuthUser()
  if (error) return error

  try {
    // すべての未読通知を既読にする
    const result = await prisma.notification.updateMany({
      where: {
        userId: user.id,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    })

    return NextResponse.json({
      success: true,
      updatedCount: result.count,
    })
  } catch (error) {
    console.error("Error marking all notifications as read:", error)
    return NextResponse.json(
      { error: "一括既読処理に失敗しました" },
      { status: 500 }
    )
  }
}
