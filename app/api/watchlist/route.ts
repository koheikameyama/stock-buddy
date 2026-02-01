import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

/**
 * GET /api/watchlist
 *
 * ユーザーのウォッチリストを取得
 * 買い時スコア、仮想購入情報、現在価格を含む
 */
export async function GET() {
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

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // ウォッチリストを取得
    const watchlist = await prisma.watchlist.findMany({
      where: {
        userId: user.id,
      },
      include: {
        stock: {
          select: {
            id: true,
            tickerCode: true,
            name: true,
            sector: true,
            beginnerScore: true,
            growthScore: true,
            dividendScore: true,
            stabilityScore: true,
            liquidityScore: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc", // 新しく追加した順
      },
    })

    // 各銘柄の現在価格を取得
    const watchlistWithPrices = await Promise.all(
      watchlist.map(async (item) => {
        const latestPrice = await prisma.stockPrice.findFirst({
          where: {
            stockId: item.stock.id,
          },
          orderBy: {
            date: "desc",
          },
          select: {
            date: true,
            close: true,
          },
        })

        return {
          id: item.id,
          stock: item.stock,
          targetPrice: item.targetPrice,
          targetCondition: item.targetCondition,
          priceAlert: item.priceAlert,
          lastAlertSent: item.lastAlertSent,
          currentPrice: latestPrice?.close || null,
          priceDate: latestPrice?.date || null,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        }
      })
    )

    return NextResponse.json({
      success: true,
      watchlist: watchlistWithPrices,
      count: watchlistWithPrices.length,
    })
  } catch (error) {
    console.error("Error fetching watchlist:", error)
    return NextResponse.json(
      { error: "ウォッチリストの取得に失敗しました" },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/watchlist
 *
 * ウォッチリストから銘柄を削除
 */
export async function DELETE(request: Request) {
  try {
    const session = await auth()

    if (!session?.user?.email) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 })
    }

    const { watchlistId } = await request.json()

    if (!watchlistId) {
      return NextResponse.json(
        { error: "watchlistId is required" },
        { status: 400 }
      )
    }

    // ウォッチリストアイテムを取得して所有者を確認
    const watchlistItem = await prisma.watchlist.findUnique({
      where: { id: watchlistId },
      include: { user: true },
    })

    if (!watchlistItem) {
      return NextResponse.json(
        { error: "ウォッチリストアイテムが見つかりません" },
        { status: 404 }
      )
    }

    if (watchlistItem.user.email !== session.user.email) {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 })
    }

    // 削除
    await prisma.watchlist.delete({
      where: { id: watchlistId },
    })

    return NextResponse.json({
      success: true,
      message: "ウォッチリストから削除しました",
    })
  } catch (error) {
    console.error("Error deleting watchlist item:", error)
    return NextResponse.json(
      { error: "削除に失敗しました" },
      { status: 500 }
    )
  }
}
