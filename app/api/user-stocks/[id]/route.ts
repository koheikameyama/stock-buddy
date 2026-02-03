import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { UserStockResponse } from "../route"

interface UpdateUserStockRequest {
  type?: "watchlist" | "portfolio"
  // Watchlist fields
  addedReason?: string
  alertPrice?: number
  // Portfolio fields
  quantity?: number
  averagePurchasePrice?: number
  purchaseDate?: string
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
    prisma.portfolioStock.findUnique({ where: { id }, include: { stock: true } }),
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

    // Delete from watchlist
    await prisma.watchlistStock.delete({ where: { id } })

    // Create in portfolio
    const newPortfolioStock = await prisma.portfolioStock.create({
      data: {
        userId,
        stockId: watchlistStock.stockId,
        quantity,
        averagePurchasePrice,
        purchaseDate: purchaseDate ? new Date(purchaseDate) : new Date(),
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

    const response: UserStockResponse = {
      id: newPortfolioStock.id,
      userId: newPortfolioStock.userId,
      stockId: newPortfolioStock.stockId,
      type: "portfolio",
      quantity: newPortfolioStock.quantity,
      averagePurchasePrice: Number(newPortfolioStock.averagePurchasePrice),
      purchaseDate: newPortfolioStock.purchaseDate.toISOString(),
      note: newPortfolioStock.note,
      stock: {
        id: newPortfolioStock.stock.id,
        tickerCode: newPortfolioStock.stock.tickerCode,
        name: newPortfolioStock.stock.name,
        sector: newPortfolioStock.stock.sector,
        market: newPortfolioStock.stock.market,
        currentPrice: newPortfolioStock.stock.currentPrice
          ? Number(newPortfolioStock.stock.currentPrice)
          : null,
      },
      createdAt: newPortfolioStock.createdAt.toISOString(),
      updatedAt: newPortfolioStock.updatedAt.toISOString(),
    }

    return NextResponse.json(response)
  } else if (convertTo === "watchlist" && portfolioStock) {
    // Portfolio → Watchlist
    await prisma.portfolioStock.delete({ where: { id } })

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
    prisma.portfolioStock.findUnique({ where: { id }, include: { stock: true } }),
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
    // Update portfolio
    const updateData: any = { note: body.note }

    if (body.quantity !== undefined) updateData.quantity = body.quantity
    if (body.averagePurchasePrice !== undefined) updateData.averagePurchasePrice = body.averagePurchasePrice
    if (body.purchaseDate !== undefined) updateData.purchaseDate = new Date(body.purchaseDate)

    const updated = await prisma.portfolioStock.update({
      where: { id },
      data: updateData,
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
      type: "portfolio",
      quantity: updated.quantity,
      averagePurchasePrice: Number(updated.averagePurchasePrice),
      purchaseDate: updated.purchaseDate.toISOString(),
      lastAnalysis: updated.lastAnalysis ? updated.lastAnalysis.toISOString() : null,
      shortTerm: updated.shortTerm,
      mediumTerm: updated.mediumTerm,
      longTerm: updated.longTerm,
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
      await prisma.portfolioStock.delete({ where: { id } })
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
