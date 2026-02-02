import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

// Constants
const MAX_HOLDINGS = 5
const MAX_WATCHLIST = 5

// Types
export interface UserStockResponse {
  id: string
  userId: string
  stockId: string
  quantity: number | null
  averagePrice: number | null
  purchaseDate: string | null
  lastAnalysis: string | null
  shortTerm: string | null
  mediumTerm: string | null
  longTerm: string | null
  stock: {
    id: string
    tickerCode: string
    name: string
    sector: string | null
    market: string
    currentPrice: number | null
  }
  createdAt: string
  updatedAt: string
}

interface CreateUserStockRequest {
  tickerCode: string
  quantity?: number | null
  averagePrice?: number | null
  purchaseDate?: string | null
}

/**
 * GET /api/user-stocks
 * Retrieve all user stocks (both holdings and watchlist)
 *
 * Query params:
 * - mode: "holdings" | "watchlist" | "all" (default: "all")
 * - sort: "name" | "value" | "date" (default: "date")
 */
export async function GET(request: NextRequest) {
  try {
    // Authentication check
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = session.user.id
    const { searchParams } = new URL(request.url)
    const mode = searchParams.get("mode") || "all"
    const sort = searchParams.get("sort") || "date"

    // Build where clause based on mode
    const whereClause: { userId: string; quantity?: { not: null } | null } = { userId }

    if (mode === "holdings") {
      whereClause.quantity = { not: null }
    } else if (mode === "watchlist") {
      whereClause.quantity = null
    }
    // mode === "all" means no additional filtering

    // Fetch user stocks with stock details
    const userStocks = await prisma.userStock.findMany({
      where: whereClause,
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
      orderBy:
        sort === "name"
          ? { stock: { name: "asc" } }
          : sort === "value"
          ? { quantity: "desc" }
          : { createdAt: "desc" }, // default: date
    })

    // Format response
    const response: UserStockResponse[] = userStocks.map((us) => ({
      id: us.id,
      userId: us.userId,
      stockId: us.stockId,
      quantity: us.quantity,
      averagePrice: us.averagePrice,
      purchaseDate: us.purchaseDate ? us.purchaseDate.toISOString() : null,
      lastAnalysis: us.lastAnalysis ? us.lastAnalysis.toISOString() : null,
      shortTerm: us.shortTerm,
      mediumTerm: us.mediumTerm,
      longTerm: us.longTerm,
      stock: {
        id: us.stock.id,
        tickerCode: us.stock.tickerCode,
        name: us.stock.name,
        sector: us.stock.sector,
        market: us.stock.market,
        currentPrice: us.stock.currentPrice ? Number(us.stock.currentPrice) : null,
      },
      createdAt: us.createdAt.toISOString(),
      updatedAt: us.updatedAt.toISOString(),
    }))

    return NextResponse.json(response)
  } catch (error) {
    console.error("Error fetching user stocks:", error)
    return NextResponse.json(
      { error: "Failed to fetch user stocks" },
      { status: 500 }
    )
  }
}

/**
 * POST /api/user-stocks
 * Add stock to holdings or watchlist
 *
 * Body:
 * - tickerCode: string (required)
 * - quantity?: number (if provided → holding, if null → watchlist)
 * - averagePrice?: number
 * - purchaseDate?: string (ISO format)
 */
export async function POST(request: NextRequest) {
  try {
    // Authentication check
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = session.user.id
    const body: CreateUserStockRequest = await request.json()
    const { tickerCode, quantity, averagePrice, purchaseDate } = body

    // Validation
    if (!tickerCode) {
      return NextResponse.json(
        { error: "tickerCode is required" },
        { status: 400 }
      )
    }

    // Find stock by ticker code
    const stock = await prisma.stock.findUnique({
      where: { tickerCode },
    })

    if (!stock) {
      return NextResponse.json(
        { error: `Stock with ticker code "${tickerCode}" not found` },
        { status: 404 }
      )
    }

    // Check if stock already exists for this user
    const existingUserStock = await prisma.userStock.findUnique({
      where: {
        userId_stockId: {
          userId,
          stockId: stock.id,
        },
      },
    })

    if (existingUserStock) {
      return NextResponse.json(
        { error: "Stock already exists in your portfolio or watchlist" },
        { status: 400 }
      )
    }

    // Determine if this is a holding or watchlist item
    const isHolding = quantity !== null && quantity !== undefined

    // Check limits
    if (isHolding) {
      const holdingsCount = await prisma.userStock.count({
        where: { userId, quantity: { not: null } },
      })

      if (holdingsCount >= MAX_HOLDINGS) {
        return NextResponse.json(
          { error: `Maximum ${MAX_HOLDINGS} holdings allowed` },
          { status: 400 }
        )
      }

      // Validate holding data
      if (quantity <= 0) {
        return NextResponse.json(
          { error: "Quantity must be greater than 0" },
          { status: 400 }
        )
      }

      if (averagePrice !== undefined && averagePrice !== null && averagePrice <= 0) {
        return NextResponse.json(
          { error: "Average price must be greater than 0" },
          { status: 400 }
        )
      }
    } else {
      // Watchlist mode
      const watchlistCount = await prisma.userStock.count({
        where: { userId, quantity: null },
      })

      if (watchlistCount >= MAX_WATCHLIST) {
        return NextResponse.json(
          { error: `Maximum ${MAX_WATCHLIST} watchlist items allowed` },
          { status: 400 }
        )
      }
    }

    // Create user stock
    const userStock = await prisma.userStock.create({
      data: {
        userId,
        stockId: stock.id,
        quantity: isHolding ? quantity : null,
        averagePrice: isHolding && averagePrice ? averagePrice : null,
        purchaseDate: isHolding && purchaseDate ? new Date(purchaseDate) : null,
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

    // Format response
    const response: UserStockResponse = {
      id: userStock.id,
      userId: userStock.userId,
      stockId: userStock.stockId,
      quantity: userStock.quantity,
      averagePrice: userStock.averagePrice,
      purchaseDate: userStock.purchaseDate ? userStock.purchaseDate.toISOString() : null,
      lastAnalysis: userStock.lastAnalysis ? userStock.lastAnalysis.toISOString() : null,
      shortTerm: userStock.shortTerm,
      mediumTerm: userStock.mediumTerm,
      longTerm: userStock.longTerm,
      stock: {
        id: userStock.stock.id,
        tickerCode: userStock.stock.tickerCode,
        name: userStock.stock.name,
        sector: userStock.stock.sector,
        market: userStock.stock.market,
        currentPrice: userStock.stock.currentPrice ? Number(userStock.stock.currentPrice) : null,
      },
      createdAt: userStock.createdAt.toISOString(),
      updatedAt: userStock.updatedAt.toISOString(),
    }

    return NextResponse.json(response, { status: 201 })
  } catch (error) {
    console.error("Error creating user stock:", error)
    return NextResponse.json(
      { error: "Failed to create user stock" },
      { status: 500 }
    )
  }
}
