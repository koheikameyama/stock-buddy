import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { addStockToPortfolio } from "@/lib/portfolio"

/**
 * Add Stock to Portfolio API
 *
 * POST /api/portfolio/add-stock
 * Body: { stockId, quantity, price, purchaseDate }
 */
export async function POST(request: NextRequest) {
  try {
    // 認証チェック
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { stockId, quantity, price, purchaseDate } = body

    // バリデーション
    if (!stockId || !quantity || !price) {
      return NextResponse.json(
        { error: "stockId, quantity, price are required" },
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

    // 株式が存在するか確認
    const stock = await prisma.stock.findUnique({
      where: { id: stockId },
    })

    if (!stock) {
      return NextResponse.json({ error: "Stock not found" }, { status: 404 })
    }

    // ポートフォリオに追加（モジュールを使用）
    const result = await addStockToPortfolio({
      userId: user.id,
      stockId,
      quantity,
      price,
      purchaseDate: purchaseDate ? new Date(purchaseDate) : undefined,
    })

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      message: result.message,
    })
  } catch (error) {
    console.error("Error adding stock to portfolio:", error)
    return NextResponse.json(
      { error: "Failed to add stock to portfolio" },
      { status: 500 }
    )
  }
}
