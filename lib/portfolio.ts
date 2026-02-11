import { prisma } from "@/lib/prisma"
import { calculatePortfolioFromTransactions } from "@/lib/portfolio-calculator"
import { Decimal } from "@prisma/client/runtime/library"

/**
 * PortfolioStock と Transactions から計算された保有情報を取得
 */
export async function getPortfolioStockWithCalculations(portfolioStockId: string) {
  const portfolioStock = await prisma.portfolioStock.findUnique({
    where: { id: portfolioStockId },
    include: {
      stock: true,
      transactions: {
        orderBy: { transactionDate: "asc" },
      },
    },
  })

  if (!portfolioStock) {
    return null
  }

  const { quantity, averagePurchasePrice } = calculatePortfolioFromTransactions(
    portfolioStock.transactions
  )

  // 最初の購入日を取得
  const firstBuyTransaction = portfolioStock.transactions.find((t) => t.type === "buy")
  const purchaseDate = firstBuyTransaction?.transactionDate || portfolioStock.createdAt

  return {
    ...portfolioStock,
    quantity,
    averagePurchasePrice,
    purchaseDate,
  }
}

/**
 * ユーザーの全ポートフォリオを計算値付きで取得
 */
export async function getUserPortfolioStocksWithCalculations(userId: string) {
  const portfolioStocks = await prisma.portfolioStock.findMany({
    where: { userId },
    include: {
      stock: {
        select: {
          id: true,
          tickerCode: true,
          name: true,
          sector: true,
          market: true,
        },
      },
      transactions: {
        orderBy: { transactionDate: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  })

  return portfolioStocks.map((ps) => {
    const { quantity, averagePurchasePrice } = calculatePortfolioFromTransactions(
      ps.transactions
    )

    // 最初の購入日を取得
    const firstBuyTransaction = ps.transactions.find((t) => t.type === "buy")
    const purchaseDate = firstBuyTransaction?.transactionDate || ps.createdAt

    return {
      ...ps,
      quantity,
      averagePurchasePrice,
      purchaseDate,
    }
  })
}

/**
 * PortfolioStockとそのTransactionを削除
 * ポートフォリオから銘柄を完全に削除する際に使用
 */
export async function deletePortfolioStock(
  portfolioStockId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await prisma.$transaction(async (tx) => {
      // 関連するTransactionを削除
      await tx.transaction.deleteMany({
        where: { portfolioStockId },
      })

      // PortfolioStockを削除
      await tx.portfolioStock.delete({
        where: { id: portfolioStockId },
      })
    })

    return { success: true }
  } catch (error) {
    console.error("Failed to delete portfolio stock:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "削除に失敗しました",
    }
  }
}

/**
 * 新しいポートフォリオ銘柄を作成（Transaction も同時に作成）
 */
export async function createPortfolioStock(params: {
  userId: string
  stockId: string
  quantity: number
  price: number
  purchaseDate?: Date
}): Promise<{ success: boolean; portfolioStockId?: string; error?: string }> {
  const { userId, stockId, quantity, price, purchaseDate } = params
  const transactionDate = purchaseDate || new Date()

  try {
    const result = await prisma.$transaction(async (tx) => {
      // PortfolioStock を作成
      const portfolioStock = await tx.portfolioStock.create({
        data: {
          userId,
          stockId,
        },
      })

      // Transaction を作成
      await tx.transaction.create({
        data: {
          userId,
          stockId,
          portfolioStockId: portfolioStock.id,
          type: "buy",
          quantity,
          price: new Decimal(price),
          totalAmount: new Decimal(quantity).times(price),
          transactionDate,
        },
      })

      return portfolioStock
    })

    return { success: true, portfolioStockId: result.id }
  } catch (error) {
    console.error("Failed to create portfolio stock:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "作成に失敗しました",
    }
  }
}
