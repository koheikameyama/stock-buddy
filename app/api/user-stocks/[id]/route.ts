import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { Decimal } from "@prisma/client/runtime/library"
import { calculatePortfolioFromTransactions } from "@/lib/portfolio-calculator"
import { UserStockResponse } from "../route"

interface UpdateUserStockRequest {
  type?: "watchlist" | "portfolio"
  // Watchlist fields
  addedReason?: string
  alertPrice?: number
  // Portfolio fields - 売却目標設定
  targetReturnRate?: number | null
  stopLossRate?: number | null
  // Common
  note?: string
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
          note: watchlistStock.note,
        },
        include: {
          stock: {
            select: {
              id: true,
              tickerCode: true,
              name: true,
              sector: true,
              market: true,
              currentPrice: true,
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

    const response: UserStockResponse = {
      id: result.portfolioStock.id,
      userId: result.portfolioStock.userId,
      stockId: result.portfolioStock.stockId,
      type: "portfolio",
      quantity,
      averagePurchasePrice,
      purchaseDate: transactionDate.toISOString(),
      note: result.portfolioStock.note,
      transactions: [{
        id: result.transaction.id,
        type: result.transaction.type,
        quantity: result.transaction.quantity,
        price: result.transaction.price.toNumber(),
        totalAmount: result.transaction.totalAmount.toNumber(),
        transactionDate: result.transaction.transactionDate.toISOString(),
        note: result.transaction.note,
      }],
      stock: {
        id: result.portfolioStock.stock.id,
        tickerCode: result.portfolioStock.stock.tickerCode,
        name: result.portfolioStock.stock.name,
        sector: result.portfolioStock.stock.sector,
        market: result.portfolioStock.stock.market,
        currentPrice: result.portfolioStock.stock.currentPrice
          ? Number(result.portfolioStock.stock.currentPrice)
          : null,
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
        note: portfolioStock.note,
      },
      include: {
        stock: {
          select: {
            id: true,
            tickerCode: true,
            name: true,
            sector: true,
            market: true,
            currentPrice: true,
          },
        },
      },
    })

    const response: UserStockResponse = {
      id: newWatchlistStock.id,
      userId: newWatchlistStock.userId,
      stockId: newWatchlistStock.stockId,
      type: "watchlist",
      addedReason: newWatchlistStock.addedReason,
      alertPrice: newWatchlistStock.alertPrice ? Number(newWatchlistStock.alertPrice) : null,
      note: newWatchlistStock.note,
      stock: {
        id: newWatchlistStock.stock.id,
        tickerCode: newWatchlistStock.stock.tickerCode,
        name: newWatchlistStock.stock.name,
        sector: newWatchlistStock.stock.sector,
        market: newWatchlistStock.stock.market,
        currentPrice: newWatchlistStock.stock.currentPrice
          ? Number(newWatchlistStock.stock.currentPrice)
          : null,
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
    // Update watchlist
    const updated = await prisma.watchlistStock.update({
      where: { id },
      data: {
        addedReason: body.addedReason,
        alertPrice: body.alertPrice,
        note: body.note,
      },
      include: {
        stock: {
          select: {
            id: true,
            tickerCode: true,
            name: true,
            sector: true,
            market: true,
            currentPrice: true,
          },
        },
      },
    })

    const response: UserStockResponse = {
      id: updated.id,
      userId: updated.userId,
      stockId: updated.stockId,
      type: "watchlist",
      addedReason: updated.addedReason,
      alertPrice: updated.alertPrice ? Number(updated.alertPrice) : null,
      note: updated.note,
      stock: {
        id: updated.stock.id,
        tickerCode: updated.stock.tickerCode,
        name: updated.stock.name,
        sector: updated.stock.sector,
        market: updated.stock.market,
        currentPrice: updated.stock.currentPrice ? Number(updated.stock.currentPrice) : null,
      },
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    }

    return NextResponse.json(response)
  } else if (portfolioStock) {
    // Validate target return rate
    const validReturnRates = [5, 10, 15, 20, 30]
    if (body.targetReturnRate !== undefined && body.targetReturnRate !== null && !validReturnRates.includes(body.targetReturnRate)) {
      return NextResponse.json(
        { error: "無効な目標利益率です" },
        { status: 400 }
      )
    }

    // Validate stop loss rate
    const validStopLossRates = [-5, -10, -15, -20]
    if (body.stopLossRate !== undefined && body.stopLossRate !== null && !validStopLossRates.includes(body.stopLossRate)) {
      return NextResponse.json(
        { error: "無効な損切りラインです" },
        { status: 400 }
      )
    }

    // Update portfolio
    const updated = await prisma.portfolioStock.update({
      where: { id },
      data: {
        note: body.note,
        targetReturnRate: body.targetReturnRate,
        stopLossRate: body.stopLossRate,
      },
      include: {
        stock: {
          select: {
            id: true,
            tickerCode: true,
            name: true,
            sector: true,
            market: true,
            currentPrice: true,
          },
        },
        transactions: {
          orderBy: { transactionDate: "asc" },
        },
      },
    })

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
      targetReturnRate: updated.targetReturnRate,
      stopLossRate: updated.stopLossRate,
      transactions: updated.transactions.map((t) => ({
        id: t.id,
        type: t.type,
        quantity: t.quantity,
        price: t.price.toNumber(),
        totalAmount: t.totalAmount.toNumber(),
        transactionDate: t.transactionDate.toISOString(),
        note: t.note,
      })),
      note: updated.note,
      stock: {
        id: updated.stock.id,
        tickerCode: updated.stock.tickerCode,
        name: updated.stock.name,
        sector: updated.stock.sector,
        market: updated.stock.market,
        currentPrice: updated.stock.currentPrice ? Number(updated.stock.currentPrice) : null,
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
