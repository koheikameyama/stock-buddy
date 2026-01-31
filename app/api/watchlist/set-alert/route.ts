import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

/**
 * POST /api/watchlist/set-alert
 *
 * ウォッチリスト銘柄の価格アラート設定を更新
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.email) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user) {
      return NextResponse.json(
        { error: "ユーザーが見つかりません" },
        { status: 404 }
      )
    }

    const body = await req.json()
    const { watchlistId, targetPrice, priceAlert } = body

    if (!watchlistId) {
      return NextResponse.json(
        { error: "watchlistIdが必要です" },
        { status: 400 }
      )
    }

    // ウォッチリストアイテムの存在確認と所有者チェック
    const watchlist = await prisma.watchlist.findUnique({
      where: { id: watchlistId },
    })

    if (!watchlist) {
      return NextResponse.json(
        { error: "ウォッチリストが見つかりません" },
        { status: 404 }
      )
    }

    if (watchlist.userId !== user.id) {
      return NextResponse.json(
        { error: "このウォッチリストにアクセスする権限がありません" },
        { status: 403 }
      )
    }

    // アラート設定を更新
    const updated = await prisma.watchlist.update({
      where: { id: watchlistId },
      data: {
        targetPrice: targetPrice ? Number(targetPrice) : null,
        priceAlert: priceAlert !== undefined ? priceAlert : watchlist.priceAlert,
      },
    })

    return NextResponse.json({
      success: true,
      message: "アラート設定を更新しました",
      watchlist: {
        id: updated.id,
        targetPrice: updated.targetPrice,
        priceAlert: updated.priceAlert,
      },
    })
  } catch (error) {
    console.error("Error setting price alert:", error)
    return NextResponse.json(
      { error: "アラート設定の更新に失敗しました" },
      { status: 500 }
    )
  }
}
