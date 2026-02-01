import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export const MAX_PORTFOLIO_STOCKS = 5

export type AddStockToPortfolioParams = {
  userId: string
  stockId: string
  quantity: number
  price: number
  purchaseDate?: Date
  isSimulation?: boolean
  note?: string
}

export type AddStockToPortfolioResult = {
  success: true
  portfolioStockId: string
  message: string
} | {
  success: false
  error: string
}

/**
 * ポートフォリオに銘柄を追加する
 * - 5銘柄制限チェック
 * - 既存銘柄の場合は平均取得単価を再計算
 * - トランザクション記録を作成
 */
export async function addStockToPortfolio(
  params: AddStockToPortfolioParams
): Promise<AddStockToPortfolioResult> {
  const {
    userId,
    stockId,
    quantity,
    price,
    purchaseDate = new Date(),
    isSimulation = false,
    note = "手動追加",
  } = params

  try {
    // バリデーション
    if (quantity <= 0 || price <= 0) {
      return {
        success: false,
        error: "数量と価格は正の数である必要があります",
      }
    }

    // ユーザーとポートフォリオを取得
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { portfolio: true },
    })

    if (!user) {
      return { success: false, error: "ユーザーが見つかりません" }
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

    // 既存のポートフォリオ銘柄を確認
    const existingPortfolioStock = await prisma.portfolioStock.findUnique({
      where: {
        portfolioId_stockId: {
          portfolioId: portfolio.id,
          stockId: stockId,
        },
      },
    })

    // 新規追加の場合は銘柄数制限をチェック
    if (!existingPortfolioStock) {
      const portfolioStockCount = await prisma.portfolioStock.count({
        where: { portfolioId: portfolio.id },
      })

      if (portfolioStockCount >= MAX_PORTFOLIO_STOCKS) {
        return {
          success: false,
          error: `ポートフォリオには最大${MAX_PORTFOLIO_STOCKS}銘柄まで登録できます`,
        }
      }
    }

    const totalAmount = price * quantity

    let portfolioStockId: string

    if (existingPortfolioStock) {
      // 既に保有している場合は平均取得単価を更新
      const existingCost =
        Number(existingPortfolioStock.averagePrice) *
        existingPortfolioStock.quantity
      const newTotalCost = existingCost + totalAmount
      const newTotalQuantity = existingPortfolioStock.quantity + quantity
      const newAveragePrice = newTotalCost / newTotalQuantity

      const updated = await prisma.portfolioStock.update({
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

      portfolioStockId = updated.id
    } else {
      // 新規追加
      const created = await prisma.portfolioStock.create({
        data: {
          portfolioId: portfolio.id,
          stockId: stockId,
          quantity: quantity,
          averagePrice: price,
          isSimulation: isSimulation,
        },
      })

      portfolioStockId = created.id
    }

    // トランザクション記録を作成
    await prisma.transaction.create({
      data: {
        portfolioId: portfolio.id,
        stockId: stockId,
        type: "buy",
        quantity: quantity,
        price: price,
        totalAmount: totalAmount,
        executedAt: purchaseDate,
        note: note,
      },
    })

    return {
      success: true,
      portfolioStockId,
      message: "ポートフォリオに追加しました",
    }
  } catch (error) {
    console.error("Error adding stock to portfolio:", error)
    return {
      success: false,
      error: "ポートフォリオへの追加に失敗しました",
    }
  }
}
