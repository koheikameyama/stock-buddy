import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { Decimal } from "@prisma/client/runtime/library"
import { calculatePortfolioFromTransactions } from "@/lib/portfolio-calculator"
import { UserStockResponse } from "../route"
import { fetchStockPrices } from "@/lib/stock-price-fetcher"

interface UpdateUserStockRequest {
  type?: "watchlist" | "portfolio"
}

interface ConvertRequest {
  convertTo: "watchlist" | "portfolio"
  // Portfolio fields (when converting to portfolio)
  quantity?: number
  averagePurchasePrice?: number
  purchaseDate?: string
}

/**
 * PATCH /api/user-stocks/[id]
 * Update or convert stock between watchlist and portfolio
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = session.user.id
    const body = await request.json()

    // Check if this is a conversion request
    if ("convertTo" in body) {
      return handleConversion(id, userId, body as ConvertRequest)
    }

    // Regular update
    return handleUpdate(id, userId, body as UpdateUserStockRequest)
  } catch (error) {
    console.error("Error updating user stock:", error)
    return NextResponse.json(
      { error: "Failed to update user stock" },
      { status: 500 }
    )
  }
}

async function handleConversion(id: string, userId: string, body: ConvertRequest) {
  const { convertTo, quantity, averagePurchasePrice, purchaseDate } = body

  // Find in both tables
  const [watchlistStock, portfolioStock] = await Promise.all([
    prisma.watchlistStock.findUnique({ where: { id }, include: { stock: true } }),
    prisma.portfolioStock.findUnique({
      where: { id },
      include: { stock: true, transactions: { orderBy: { transactionDate: "asc" } } },
    }),
  ])

  const existingStock = watchlistStock || portfolioStock
  if (!existingStock) {
    return NextResponse.json({ error: "Stock not found" }, { status: 404 })
  }

  if (existingStock.userId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  if (convertTo === "portfolio" && watchlistStock) {
    // Watchlist → Portfolio
    if (!quantity || quantity <= 0) {
      return NextResponse.json(
        { error: "quantity is required and must be greater than 0" },
        { status: 400 }
      )
    }

    if (!averagePurchasePrice || averagePurchasePrice <= 0) {
      return NextResponse.json(
        { error: "averagePurchasePrice is required and must be greater than 0" },
        { status: 400 }
      )
    }

    const transactionDate = purchaseDate ? new Date(purchaseDate) : new Date()

    // Delete from watchlist and create in portfolio with transaction
    const result = await prisma.$transaction(async (tx) => {
      await tx.watchlistStock.delete({ where: { id } })

      const newPortfolioStock = await tx.portfolioStock.create({
        data: {
          userId,
          stockId: watchlistStock.stockId,
        },
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
        },
      })

      const transaction = await tx.transaction.create({
        data: {
          userId,
          stockId: watchlistStock.stockId,
          portfolioStockId: newPortfolioStock.id,
          type: "buy",
          quantity,
          price: new Decimal(averagePurchasePrice),
          totalAmount: new Decimal(quantity).times(averagePurchasePrice),
          transactionDate,
        },
      })

      return { portfolioStock: newPortfolioStock, transaction }
    })

    // リアルタイム株価を取得
    const prices = await fetchStockPrices([result.portfolioStock.stock.tickerCode])
    const currentPrice = prices[0]?.currentPrice ?? null

    const response: UserStockResponse = {
      id: result.portfolioStock.id,
      userId: result.portfolioStock.userId,
      stockId: result.portfolioStock.stockId,
      type: "portfolio",
      quantity,
      averagePurchasePrice,
      purchaseDate: transactionDate.toISOString(),
      transactions: [{
        id: result.transaction.id,
        type: result.transaction.type,
        quantity: result.transaction.quantity,
        price: result.transaction.price.toNumber(),
        totalAmount: result.transaction.totalAmount.toNumber(),
        transactionDate: result.transaction.transactionDate.toISOString(),
      }],
      stock: {
        id: result.portfolioStock.stock.id,
        tickerCode: result.portfolioStock.stock.tickerCode,
        name: result.portfolioStock.stock.name,
        sector: result.portfolioStock.stock.sector,
        market: result.portfolioStock.stock.market,
        currentPrice,
      },
      createdAt: result.portfolioStock.createdAt.toISOString(),
      updatedAt: result.portfolioStock.updatedAt.toISOString(),
    }

    return NextResponse.json(response)
  } else if (convertTo === "watchlist" && portfolioStock) {
    // Portfolio → Watchlist
    // Delete portfolio and its transactions
    await prisma.$transaction(async (tx) => {
      // Delete transactions
      await tx.transaction.deleteMany({
        where: { portfolioStockId: id },
      })
      await tx.portfolioStock.delete({ where: { id } })
    })

    const newWatchlistStock = await prisma.watchlistStock.create({
      data: {
        userId,
        stockId: portfolioStock.stockId,
      },
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
      },
    })

    // リアルタイム株価を取得
    const watchlistPrices = await fetchStockPrices([newWatchlistStock.stock.tickerCode])
    const watchlistCurrentPrice = watchlistPrices[0]?.currentPrice ?? null

    const response: UserStockResponse = {
      id: newWatchlistStock.id,
      userId: newWatchlistStock.userId,
      stockId: newWatchlistStock.stockId,
      type: "watchlist",
      stock: {
        id: newWatchlistStock.stock.id,
        tickerCode: newWatchlistStock.stock.tickerCode,
        name: newWatchlistStock.stock.name,
        sector: newWatchlistStock.stock.sector,
        market: newWatchlistStock.stock.market,
        currentPrice: watchlistCurrentPrice,
      },
      createdAt: newWatchlistStock.createdAt.toISOString(),
      updatedAt: newWatchlistStock.updatedAt.toISOString(),
    }

    return NextResponse.json(response)
  } else {
    return NextResponse.json(
      { error: "Invalid conversion request" },
      { status: 400 }
    )
  }
}

async function handleUpdate(id: string, userId: string, body: UpdateUserStockRequest) {
  // Find in both tables
  const [watchlistStock, portfolioStock] = await Promise.all([
    prisma.watchlistStock.findUnique({ where: { id }, include: { stock: true } }),
    prisma.portfolioStock.findUnique({
      where: { id },
      include: { stock: true, transactions: { orderBy: { transactionDate: "asc" } } },
    }),
  ])

  const existingStock = watchlistStock || portfolioStock
  if (!existingStock) {
    return NextResponse.json({ error: "Stock not found" }, { status: 404 })
  }

  if (existingStock.userId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  if (watchlistStock) {
    // リアルタイム株価を取得
    const watchlistPrices = await fetchStockPrices([watchlistStock.stock.tickerCode])
    const watchlistCurrentPrice = watchlistPrices[0]?.currentPrice ?? null

    // Watchlist has no editable fields now, just return current data
    const response: UserStockResponse = {
      id: watchlistStock.id,
      userId: watchlistStock.userId,
      stockId: watchlistStock.stockId,
      type: "watchlist",
      stock: {
        id: watchlistStock.stock.id,
        tickerCode: watchlistStock.stock.tickerCode,
        name: watchlistStock.stock.name,
        sector: watchlistStock.stock.sector,
        market: watchlistStock.stock.market,
        currentPrice: watchlistCurrentPrice,
      },
      createdAt: watchlistStock.createdAt.toISOString(),
      updatedAt: watchlistStock.updatedAt.toISOString(),
    }

    return NextResponse.json(response)
  } else if (portfolioStock) {
    // リアルタイム株価を取得
    const portfolioPrices = await fetchStockPrices([portfolioStock.stock.tickerCode])
    const portfolioCurrentPrice = portfolioPrices[0]?.currentPrice ?? null

    // Portfolio has no editable fields now (transactions are updated separately)
    const updated = portfolioStock

    // Calculate from transactions
    const { quantity, averagePurchasePrice } = calculatePortfolioFromTransactions(
      updated.transactions
    )
    const firstBuyTransaction = updated.transactions.find((t) => t.type === "buy")
    const purchaseDate = firstBuyTransaction?.transactionDate || updated.createdAt

    const response: UserStockResponse = {
      id: updated.id,
      userId: updated.userId,
      stockId: updated.stockId,
      type: "portfolio",
      quantity,
      averagePurchasePrice: averagePurchasePrice.toNumber(),
      purchaseDate: purchaseDate.toISOString(),
      lastAnalysis: updated.lastAnalysis ? updated.lastAnalysis.toISOString() : null,
      shortTerm: updated.shortTerm,
      mediumTerm: updated.mediumTerm,
      longTerm: updated.longTerm,
      transactions: updated.transactions.map((t) => ({
        id: t.id,
        type: t.type,
        quantity: t.quantity,
        price: t.price.toNumber(),
        totalAmount: t.totalAmount.toNumber(),
        transactionDate: t.transactionDate.toISOString(),
      })),
      stock: {
        id: updated.stock.id,
        tickerCode: updated.stock.tickerCode,
        name: updated.stock.name,
        sector: updated.stock.sector,
        market: updated.stock.market,
        currentPrice: portfolioCurrentPrice,
      },
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    }

    return NextResponse.json(response)
  }

  return NextResponse.json({ error: "Invalid request" }, { status: 400 })
}

/**
 * DELETE /api/user-stocks/[id]
 * Remove stock from watchlist or portfolio
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = session.user.id

    // Find in both tables
    const [watchlistStock, portfolioStock] = await Promise.all([
      prisma.watchlistStock.findUnique({ where: { id }, include: { stock: true } }),
      prisma.portfolioStock.findUnique({ where: { id }, include: { stock: true } }),
    ])

    const existingStock = watchlistStock || portfolioStock
    if (!existingStock) {
      return NextResponse.json({ error: "Stock not found" }, { status: 404 })
    }

    if (existingStock.userId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Delete from appropriate table
    if (watchlistStock) {
      await prisma.watchlistStock.delete({ where: { id } })
    } else if (portfolioStock) {
      // Delete transactions and portfolio
      await prisma.$transaction(async (tx) => {
        await tx.transaction.deleteMany({
          where: { portfolioStockId: id },
        })
        await tx.portfolioStock.delete({ where: { id } })
      })
    }

    return NextResponse.json({
      success: true,
      message: `Stock ${existingStock.stock.name} (${existingStock.stock.tickerCode}) removed successfully`,
    })
  } catch (error) {
    console.error("Error deleting user stock:", error)
    return NextResponse.json(
      { error: "Failed to delete user stock" },
      { status: 500 }
    )
  }
}
