import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { searchAndAddStock } from "@/lib/stock-fetcher"

// Constants
const MAX_STOCKS = 5

// Types
export interface UserStockResponse {
  id: string
  userId: string
  stockId: string
  type: "watchlist" | "portfolio"
  // Watchlist fields
  addedReason?: string | null
  alertPrice?: number | null
  // Portfolio fields
  quantity?: number
  averagePurchasePrice?: number
  purchaseDate?: string
  lastAnalysis?: string | null
  shortTerm?: string | null
  mediumTerm?: string | null
  longTerm?: string | null
  // Common fields
  note?: string | null
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
  type: "watchlist" | "portfolio"
  // Watchlist fields
  addedReason?: string
  alertPrice?: number
  // Portfolio fields
  quantity?: number
  averagePurchasePrice?: number
  purchaseDate?: string
  // Common fields
  note?: string
}

/**
 * GET /api/user-stocks
 * Retrieve all user stocks (both watchlist and portfolio)
 *
 * Query params:
 * - mode: "portfolio" | "watchlist" | "all" (default: "all")
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

    let watchlistStocks: any[] = []
    let portfolioStocks: any[] = []

    // Fetch based on mode
    if (mode === "watchlist" || mode === "all") {
      watchlistStocks = await prisma.watchlistStock.findMany({
        where: { userId },
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
        orderBy: { createdAt: "desc" },
      })
    }

    if (mode === "portfolio" || mode === "all") {
      portfolioStocks = await prisma.portfolioStock.findMany({
        where: { userId },
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
        orderBy: { createdAt: "desc" },
      })
    }

    // Format response
    const watchlistResponse: UserStockResponse[] = watchlistStocks.map((ws) => ({
      id: ws.id,
      userId: ws.userId,
      stockId: ws.stockId,
      type: "watchlist" as const,
      addedReason: ws.addedReason,
      alertPrice: ws.alertPrice ? Number(ws.alertPrice) : null,
      note: ws.note,
      stock: {
        id: ws.stock.id,
        tickerCode: ws.stock.tickerCode,
        name: ws.stock.name,
        sector: ws.stock.sector,
        market: ws.stock.market,
        currentPrice: ws.stock.currentPrice ? Number(ws.stock.currentPrice) : null,
      },
      createdAt: ws.createdAt.toISOString(),
      updatedAt: ws.updatedAt.toISOString(),
    }))

    const portfolioResponse: UserStockResponse[] = portfolioStocks.map((ps) => ({
      id: ps.id,
      userId: ps.userId,
      stockId: ps.stockId,
      type: "portfolio" as const,
      quantity: ps.quantity,
      averagePurchasePrice: ps.averagePurchasePrice ? Number(ps.averagePurchasePrice) : undefined,
      purchaseDate: ps.purchaseDate ? ps.purchaseDate.toISOString() : undefined,
      lastAnalysis: ps.lastAnalysis ? ps.lastAnalysis.toISOString() : null,
      shortTerm: ps.shortTerm,
      mediumTerm: ps.mediumTerm,
      longTerm: ps.longTerm,
      note: ps.note,
      stock: {
        id: ps.stock.id,
        tickerCode: ps.stock.tickerCode,
        name: ps.stock.name,
        sector: ps.stock.sector,
        market: ps.stock.market,
        currentPrice: ps.stock.currentPrice ? Number(ps.stock.currentPrice) : null,
      },
      createdAt: ps.createdAt.toISOString(),
      updatedAt: ps.updatedAt.toISOString(),
    }))

    const response = [...watchlistResponse, ...portfolioResponse]

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
 * Add stock to watchlist or portfolio
 *
 * Body:
 * - tickerCode: string (required)
 * - type: "watchlist" | "portfolio" (required)
 * - watchlist: addedReason?, alertPrice?, note?
 * - portfolio: quantity, averagePurchasePrice, purchaseDate?, note?
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
    const { tickerCode, type, addedReason, alertPrice, quantity, averagePurchasePrice, purchaseDate, note } = body

    // Validation
    if (!tickerCode) {
      return NextResponse.json(
        { error: "tickerCode is required" },
        { status: 400 }
      )
    }

    if (!type || !["watchlist", "portfolio"].includes(type)) {
      return NextResponse.json(
        { error: "type must be 'watchlist' or 'portfolio'" },
        { status: 400 }
      )
    }

    // Normalize ticker code
    let normalizedTickerCode = tickerCode
    if (/^\d+$/.test(tickerCode)) {
      normalizedTickerCode = `${tickerCode}.T`
    }

    // Find stock
    let stock = await prisma.stock.findUnique({
      where: { tickerCode: normalizedTickerCode },
    })

    // マスタにない場合はyfinanceで検索して追加を試みる
    if (!stock) {
      console.log(`Stock not found in master, searching with yfinance: ${normalizedTickerCode}`)

      const searchResult = await searchAndAddStock(normalizedTickerCode)

      if (!searchResult.success || !searchResult.stock) {
        return NextResponse.json(
          {
            error: searchResult.error || `銘柄 "${normalizedTickerCode}" が見つかりませんでした。銘柄コードが正しいか確認してください。`
          },
          { status: 404 }
        )
      }

      // 新しく追加された銘柄を取得
      stock = await prisma.stock.findUnique({
        where: { id: searchResult.stock.id },
      })

      if (!stock) {
        return NextResponse.json(
          { error: "銘柄の登録に失敗しました" },
          { status: 500 }
        )
      }

      console.log(`Successfully added new stock to master: ${stock.tickerCode} - ${stock.name}`)
    }

    // Check if stock already exists
    const [existingWatchlist, existingPortfolio] = await Promise.all([
      prisma.watchlistStock.findUnique({
        where: { userId_stockId: { userId, stockId: stock.id } },
      }),
      prisma.portfolioStock.findUnique({
        where: { userId_stockId: { userId, stockId: stock.id } },
      }),
    ])

    if (existingWatchlist || existingPortfolio) {
      return NextResponse.json(
        { error: "この銘柄は既に登録されています" },
        { status: 400 }
      )
    }

    // Check limit (combined watchlist + portfolio)
    const [watchlistCount, portfolioCount] = await Promise.all([
      prisma.watchlistStock.count({ where: { userId } }),
      prisma.portfolioStock.count({ where: { userId } }),
    ])

    const totalStocks = watchlistCount + portfolioCount

    if (totalStocks >= MAX_STOCKS) {
      return NextResponse.json(
        { error: `最大${MAX_STOCKS}銘柄まで登録できます` },
        { status: 400 }
      )
    }

    // Create based on type
    if (type === "watchlist") {
      const watchlistStock = await prisma.watchlistStock.create({
        data: {
          userId,
          stockId: stock.id,
          addedReason,
          alertPrice,
          note,
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
        id: watchlistStock.id,
        userId: watchlistStock.userId,
        stockId: watchlistStock.stockId,
        type: "watchlist",
        addedReason: watchlistStock.addedReason,
        alertPrice: watchlistStock.alertPrice ? Number(watchlistStock.alertPrice) : null,
        note: watchlistStock.note,
        stock: {
          id: watchlistStock.stock.id,
          tickerCode: watchlistStock.stock.tickerCode,
          name: watchlistStock.stock.name,
          sector: watchlistStock.stock.sector,
          market: watchlistStock.stock.market,
          currentPrice: watchlistStock.stock.currentPrice ? Number(watchlistStock.stock.currentPrice) : null,
        },
        createdAt: watchlistStock.createdAt.toISOString(),
        updatedAt: watchlistStock.updatedAt.toISOString(),
      }

      return NextResponse.json(response, { status: 201 })
    } else {
      // Portfolio validation
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

      const portfolioStock = await prisma.portfolioStock.create({
        data: {
          userId,
          stockId: stock.id,
          quantity,
          averagePurchasePrice,
          purchaseDate: purchaseDate ? new Date(purchaseDate) : new Date(),
          note,
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
        id: portfolioStock.id,
        userId: portfolioStock.userId,
        stockId: portfolioStock.stockId,
        type: "portfolio",
        quantity: portfolioStock.quantity,
        averagePurchasePrice: Number(portfolioStock.averagePurchasePrice),
        purchaseDate: portfolioStock.purchaseDate.toISOString(),
        lastAnalysis: portfolioStock.lastAnalysis ? portfolioStock.lastAnalysis.toISOString() : null,
        shortTerm: portfolioStock.shortTerm,
        mediumTerm: portfolioStock.mediumTerm,
        longTerm: portfolioStock.longTerm,
        note: portfolioStock.note,
        stock: {
          id: portfolioStock.stock.id,
          tickerCode: portfolioStock.stock.tickerCode,
          name: portfolioStock.stock.name,
          sector: portfolioStock.stock.sector,
          market: portfolioStock.stock.market,
          currentPrice: portfolioStock.stock.currentPrice ? Number(portfolioStock.stock.currentPrice) : null,
        },
        createdAt: portfolioStock.createdAt.toISOString(),
        updatedAt: portfolioStock.updatedAt.toISOString(),
      }

      return NextResponse.json(response, { status: 201 })
    }
  } catch (error) {
    console.error("Error creating user stock:", error)
    return NextResponse.json(
      { error: "Failed to create user stock" },
      { status: 500 }
    )
  }
}
