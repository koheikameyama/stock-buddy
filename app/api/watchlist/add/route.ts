import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { addStockToWatchlist } from "@/lib/watchlist"

/**
 * ウォッチリストに銘柄を追加するAPI
 */
export async function POST(request: Request) {
  try {
    const session = await auth()

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { stockId } = body

    if (!stockId) {
      return NextResponse.json(
        { error: "stockId is required" },
        { status: 400 }
      )
    }

    // セッションからユーザーを取得
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // ウォッチリストに追加
    const result = await addStockToWatchlist({
      userId: user.id,
      stockId: stockId,
    })

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      message: result.message,
      watchlistId: result.watchlistId,
      isNew: result.isNew,
    })
  } catch (error) {
    console.error("Error adding to watchlist:", error)
    return NextResponse.json(
      { error: "Failed to add to watchlist" },
      { status: 500 }
    )
  }
}
