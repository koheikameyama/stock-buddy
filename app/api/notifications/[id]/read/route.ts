import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

/**
 * PATCH /api/notifications/[id]/read
 * 通知を既読にする
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 })
    }

    const { id } = await params

    // 通知を取得して所有者確認
    const notification = await prisma.notification.findUnique({
      where: { id },
    })

    if (!notification) {
      return NextResponse.json({ error: "通知が見つかりません" }, { status: 404 })
    }

    if (notification.userId !== session.user.id) {
      return NextResponse.json({ error: "アクセス権限がありません" }, { status: 403 })
    }

    // 既読にする
    await prisma.notification.update({
      where: { id },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error marking notification as read:", error)
    return NextResponse.json(
      { error: "既読処理に失敗しました" },
      { status: 500 }
    )
  }
}
