import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { PrismaClient } from "@prisma/client"

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

    if (quantity <= 0 || averagePrice <= 0) {
      return NextResponse.json(
        { error: "数量と価格は正の数である必要があります" },
        { status: 400 }
      )
    }

    // ユーザーとポートフォリオを取得
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        portfolio: true,
      },
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

    // トランザクションで処理
    const result = await prisma.$transaction(async (tx) => {
      // 既存のポートフォリオ銘柄をチェック
      const existingPortfolioStock = await tx.portfolioStock.findUnique({
        where: {
          portfolioId_stockId: {
            portfolioId: portfolio.id,
            stockId: watchlistItem.stockId,
          },
        },
      })

      let portfolioStock

      if (existingPortfolioStock) {
        // 既に保有している場合は平均価格を再計算
        const totalQuantity = existingPortfolioStock.quantity + quantity
        const totalCost =
          Number(existingPortfolioStock.averagePrice) * existingPortfolioStock.quantity +
          averagePrice * quantity
        const newAveragePrice = totalCost / totalQuantity

        portfolioStock = await tx.portfolioStock.update({
          where: { id: existingPortfolioStock.id },
          data: {
            quantity: totalQuantity,
            averagePrice: newAveragePrice,
          },
        })
      } else {
        // 新規追加
        portfolioStock = await tx.portfolioStock.create({
          data: {
            portfolioId: portfolio.id,
            stockId: watchlistItem.stockId,
            quantity: quantity,
            averagePrice: averagePrice,
            reason: watchlistItem.reason,
          },
        })
      }

      // トランザクション記録を作成
      await tx.transaction.create({
        data: {
          portfolioId: portfolio.id,
          stockId: watchlistItem.stockId,
          type: "buy",
          quantity: quantity,
          price: averagePrice,
          totalAmount: averagePrice * quantity,
          executedAt: purchaseDate ? new Date(purchaseDate) : new Date(),
          note: `ウォッチリストから追加: ${watchlistItem.stock.name}`,
        },
      })

      // ウォッチリストから削除
      await tx.watchlist.delete({
        where: { id: watchlistId },
      })

      return portfolioStock
    })

    return NextResponse.json({
      success: true,
      portfolioStock: result,
      message: "ポートフォリオに追加しました",
    })
  } catch (error) {
    console.error("Error adding to portfolio:", error)
    return NextResponse.json(
      { error: "ポートフォリオへの追加に失敗しました" },
      { status: 500 }
    )
  }
}
