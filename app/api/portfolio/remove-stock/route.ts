import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

/**
 * Remove Stock from Portfolio API
 *
 * DELETE /api/portfolio/remove-stock
 * Body: { portfolioStockId }
 */
export async function DELETE(request: NextRequest) {
  try {
    // 認証チェック
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { portfolioStockId } = body

    // バリデーション
    if (!portfolioStockId) {
      return NextResponse.json(
        { error: "portfolioStockId is required" },
        { status: 400 }
      )
    }

    // ユーザーとポートフォリオを取得
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { portfolio: true },
    })

    if (!user || !user.portfolio) {
      return NextResponse.json({ error: "Portfolio not found" }, { status: 404 })
    }

    // ポートフォリオ銘柄を取得して所有権確認
    const portfolioStock = await prisma.portfolioStock.findUnique({
      where: { id: portfolioStockId },
      include: { stock: true },
    })

    if (!portfolioStock) {
      return NextResponse.json(
        { error: "Portfolio stock not found" },
        { status: 404 }
      )
    }

    // 所有権確認
    if (portfolioStock.portfolioId !== user.portfolio.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // 売却トランザクションを記録（全数量売却として記録）
    await prisma.transaction.create({
      data: {
        portfolioId: user.portfolio.id,
        stockId: portfolioStock.stockId,
        type: "sell",
        quantity: portfolioStock.quantity,
        price: portfolioStock.averagePrice,
        totalAmount:
          Number(portfolioStock.averagePrice) * portfolioStock.quantity,
        executedAt: new Date(),
        note: "ポートフォリオから削除",
      },
    })

    // ポートフォリオから削除
    await prisma.portfolioStock.delete({
      where: { id: portfolioStockId },
    })

    return NextResponse.json({
      success: true,
      message: `${portfolioStock.stock.name}をポートフォリオから削除しました`,
    })
  } catch (error) {
    console.error("Error removing stock from portfolio:", error)
    return NextResponse.json(
      { error: "Failed to remove stock from portfolio" },
      { status: 500 }
    )
  } finally {
    await prisma.$disconnect()
  }
}
