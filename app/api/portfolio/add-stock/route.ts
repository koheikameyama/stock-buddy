import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

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

    if (quantity <= 0 || price <= 0) {
      return NextResponse.json(
        { error: "quantity and price must be positive" },
        { status: 400 }
      )
    }

    // ユーザーとポートフォリオを取得
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { portfolio: true },
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // ポートフォリオが存在しない場合は作成
    let portfolio = user.portfolio
    if (!portfolio) {
      portfolio = await prisma.portfolio.create({
        data: {
          userId: user.id,
          name: "マイポートフォリオ",
        },
      })
    }

    // 株式が存在するか確認
    const stock = await prisma.stock.findUnique({
      where: { id: stockId },
    })

    if (!stock) {
      return NextResponse.json({ error: "Stock not found" }, { status: 404 })
    }

    // 既存のポートフォリオ銘柄を確認
    const existingPortfolioStock = await prisma.portfolioStock.findUnique({
      where: {
        portfolioId_stockId: {
          portfolioId: portfolio.id,
          stockId: stockId,
        },
      },
    })

    const totalAmount = price * quantity
    const purchaseDateTime = purchaseDate
      ? new Date(purchaseDate)
      : new Date()

    if (existingPortfolioStock) {
      // 既に保有している場合は平均取得単価を更新
      const existingCost =
        Number(existingPortfolioStock.averagePrice) *
        existingPortfolioStock.quantity
      const newTotalCost = existingCost + totalAmount
      const newTotalQuantity = existingPortfolioStock.quantity + quantity
      const newAveragePrice = newTotalCost / newTotalQuantity

      await prisma.portfolioStock.update({
        where: {
          portfolioId_stockId: {
            portfolioId: portfolio.id,
            stockId: stockId,
          },
        },
        data: {
          quantity: newTotalQuantity,
          averagePrice: newAveragePrice,
        },
      })

      // トランザクション記録を追加
      await prisma.transaction.create({
        data: {
          portfolioId: portfolio.id,
          stockId: stockId,
          type: "buy",
          quantity: quantity,
          price: price,
          totalAmount: totalAmount,
          executedAt: purchaseDateTime,
          note: "手動追加",
        },
      })
    } else {
      // 新規追加
      await prisma.portfolioStock.create({
        data: {
          portfolioId: portfolio.id,
          stockId: stockId,
          quantity: quantity,
          averagePrice: price,
        },
      })

      // トランザクション記録を作成
      await prisma.transaction.create({
        data: {
          portfolioId: portfolio.id,
          stockId: stockId,
          type: "buy",
          quantity: quantity,
          price: price,
          totalAmount: totalAmount,
          executedAt: purchaseDateTime,
          note: "手動追加",
        },
      })
    }

    return NextResponse.json({
      success: true,
      message: "ポートフォリオに追加しました",
    })
  } catch (error) {
    console.error("Error adding stock to portfolio:", error)
    return NextResponse.json(
      { error: "Failed to add stock to portfolio" },
      { status: 500 }
    )
  } finally {
    await prisma.$disconnect()
  }
}
