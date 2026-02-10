import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { searchAndAddStock } from "@/lib/stock-fetcher"
import { Decimal } from "@prisma/client/runtime/library"
import { calculatePortfolioFromTransactions } from "@/lib/portfolio-calculator"

// Constants
const MAX_WATCHLIST_STOCKS = 5
const MAX_PORTFOLIO_STOCKS = 5

// Types
export interface UserStockResponse {
  id: string
  userId: string
  stockId: string
  type: "watchlist" | "portfolio"
  // Portfolio fields (calculated from transactions)
  quantity?: number
  averagePurchasePrice?: number
  purchaseDate?: string
  lastAnalysis?: string | null
  shortTerm?: string | null
  mediumTerm?: string | null
  longTerm?: string | null
  // AI推奨（StockAnalysisから取得）
  recommendation?: "buy" | "sell" | "hold" | null
  // 感情コーチング・ステータス（Portfolio only）
  emotionalCoaching?: string | null
  simpleStatus?: string | null
  statusType?: string | null
  // 売却提案（Portfolio only）
  suggestedSellPrice?: number | null
  sellCondition?: string | null
  // Transaction data
  transactions?: {
    id: string
    type: string
    quantity: number
    price: number
    totalAmount: number
    transactionDate: string
    note: string | null
  }[]
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
  // Portfolio fields
  quantity?: number
  averagePurchasePrice?: number
  purchaseDate?: string
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
              // 最新のStockAnalysisからrecommendationを取得
              analyses: {
                select: {
                  recommendation: true,
                },
                orderBy: { analyzedAt: "desc" },
                take: 1,
              },
            },
          },
          transactions: {
            orderBy: { transactionDate: "asc" },
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

    const portfolioResponse: UserStockResponse[] = portfolioStocks.map((ps) => {
      // Calculate from transactions
      const { quantity, averagePurchasePrice } = calculatePortfolioFromTransactions(
        ps.transactions
      )
      const firstBuyTransaction = ps.transactions.find((t: any) => t.type === "buy")
      const purchaseDate = firstBuyTransaction?.transactionDate || ps.createdAt

      // 最新のStockAnalysisからrecommendationを取得
      const latestAnalysis = ps.stock.analyses?.[0]
      const recommendation = latestAnalysis?.recommendation as "buy" | "sell" | "hold" | null

      return {
        id: ps.id,
        userId: ps.userId,
        stockId: ps.stockId,
        type: "portfolio" as const,
        quantity,
        averagePurchasePrice: averagePurchasePrice.toNumber(),
        purchaseDate: purchaseDate.toISOString(),
        lastAnalysis: ps.lastAnalysis ? ps.lastAnalysis.toISOString() : null,
        shortTerm: ps.shortTerm,
        mediumTerm: ps.mediumTerm,
        longTerm: ps.longTerm,
        recommendation,
        // 感情コーチング・ステータス
        emotionalCoaching: ps.emotionalCoaching,
        simpleStatus: ps.simpleStatus,
        statusType: ps.statusType,
        // 売却提案
        suggestedSellPrice: ps.suggestedSellPrice ? Number(ps.suggestedSellPrice) : null,
        sellCondition: ps.sellCondition,
        transactions: ps.transactions.map((t: any) => ({
          id: t.id,
          type: t.type,
          quantity: t.quantity,
          price: t.price.toNumber(),
          totalAmount: t.totalAmount.toNumber(),
          transactionDate: t.transactionDate.toISOString(),
          note: t.note,
        })),
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
      }
    })

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
 * - watchlist: addedReason?, note?
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
    const { tickerCode, type, quantity, averagePurchasePrice, purchaseDate } = body

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

    // ポートフォリオに追加しようとしている場合、既にポートフォリオにあればエラー
    // ウォッチリストにある場合は、ポートフォリオへの移行として処理（後でウォッチリストから削除）
    if (type === "portfolio" && existingPortfolio) {
      return NextResponse.json(
        { error: "この銘柄は既にポートフォリオに登録されています" },
        { status: 400 }
      )
    }

    // ウォッチリストに追加しようとしている場合、既にどちらかにあればエラー
    if (type === "watchlist" && (existingWatchlist || existingPortfolio)) {
      return NextResponse.json(
        { error: "この銘柄は既に登録されています" },
        { status: 400 }
      )
    }

    // Check limit (separate limits for watchlist and portfolio)
    if (type === "watchlist") {
      const watchlistCount = await prisma.watchlistStock.count({ where: { userId } })
      if (watchlistCount >= MAX_WATCHLIST_STOCKS) {
        return NextResponse.json(
          { error: `ウォッチリストは最大${MAX_WATCHLIST_STOCKS}銘柄まで登録できます` },
          { status: 400 }
        )
      }
    } else {
      // portfolio の場合
      const portfolioCount = await prisma.portfolioStock.count({ where: { userId } })
      // ウォッチリストからポートフォリオへの移行の場合は新規追加ではないのでチェック不要
      if (!existingWatchlist && portfolioCount >= MAX_PORTFOLIO_STOCKS) {
        return NextResponse.json(
          { error: `ポートフォリオは最大${MAX_PORTFOLIO_STOCKS}銘柄まで登録できます` },
          { status: 400 }
        )
      }
    }

    // ウォッチリストからポートフォリオへの移行の場合、ウォッチリストから削除
    if (type === "portfolio" && existingWatchlist) {
      await prisma.watchlistStock.delete({
        where: { id: existingWatchlist.id },
      })
    }

    // Create based on type
    if (type === "watchlist") {
      const watchlistStock = await prisma.watchlistStock.create({
        data: {
          userId,
          stockId: stock.id,
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

      const transactionDate = purchaseDate ? new Date(purchaseDate) : new Date()

      // トランザクション内でポートフォリオと購入履歴を同時に作成
      const result = await prisma.$transaction(async (tx) => {
        // PortfolioStock を作成（quantity, averagePurchasePrice カラムなし）
        const portfolioStock = await tx.portfolioStock.create({
          data: {
            userId,
            stockId: stock.id,
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

        // 購入履歴（トランザクション記録）を作成
        const transaction = await tx.transaction.create({
          data: {
            userId,
            stockId: stock.id,
            portfolioStockId: portfolioStock.id,
            type: "buy",
            quantity,
            price: new Decimal(averagePurchasePrice),
            totalAmount: new Decimal(quantity).times(averagePurchasePrice),
            transactionDate,
          },
        })

        return { portfolioStock, transaction }
      })

      const response: UserStockResponse = {
        id: result.portfolioStock.id,
        userId: result.portfolioStock.userId,
        stockId: result.portfolioStock.stockId,
        type: "portfolio",
        quantity,
        averagePurchasePrice,
        purchaseDate: transactionDate.toISOString(),
        lastAnalysis: result.portfolioStock.lastAnalysis ? result.portfolioStock.lastAnalysis.toISOString() : null,
        shortTerm: result.portfolioStock.shortTerm,
        mediumTerm: result.portfolioStock.mediumTerm,
        longTerm: result.portfolioStock.longTerm,
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
          currentPrice: result.portfolioStock.stock.currentPrice ? Number(result.portfolioStock.stock.currentPrice) : null,
        },
        createdAt: result.portfolioStock.createdAt.toISOString(),
        updatedAt: result.portfolioStock.updatedAt.toISOString(),
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
