import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { PrismaClient } from "@prisma/client"
import { addStockToPortfolio } from "@/lib/portfolio"

const prisma = new PrismaClient()

export async function POST(request: NextRequest) {
  try {
    // 認証チェック
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { watchlistId, quantity, averagePrice, purchaseDate } = await request.json()

    // バリデーション
    if (!watchlistId || !quantity || !averagePrice) {
      return NextResponse.json(
        { error: "必須項目が不足しています" },
        { status: 400 }
      )
    }

    // ユーザーを取得
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // ウォッチリストアイテムを取得
    const watchlistItem = await prisma.watchlist.findUnique({
      where: {
        id: watchlistId,
        userId: user.id,
      },
      include: {
        stock: true,
      },
    })

    if (!watchlistItem) {
      return NextResponse.json(
        { error: "ウォッチリストアイテムが見つかりません" },
        { status: 404 }
      )
    }

    // ポートフォリオに追加（モジュールを使用）
    const result = await addStockToPortfolio({
      userId: user.id,
      stockId: watchlistItem.stockId,
      quantity,
      price: averagePrice,
      purchaseDate: purchaseDate ? new Date(purchaseDate) : undefined,
      reason: watchlistItem.reason,
      note: `ウォッチリストから追加: ${watchlistItem.stock.name}`,
    })

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    // ウォッチリストから削除
    await prisma.watchlist.delete({
      where: { id: watchlistId },
    })

    return NextResponse.json({
      success: true,
      portfolioStockId: result.portfolioStockId,
      message: result.message,
    })
  } catch (error) {
    console.error("Error adding to portfolio:", error)
    return NextResponse.json(
      { error: "ポートフォリオへの追加に失敗しました" },
      { status: 500 }
    )
  }
}
