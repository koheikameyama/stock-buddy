import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { searchAndAddStock } from "@/lib/stock-fetcher"
import { Decimal } from "@prisma/client/runtime/library"
import { calculatePortfolioFromTransactions } from "@/lib/portfolio-calculator"
import { MAX_WATCHLIST_STOCKS, MAX_PORTFOLIO_STOCKS } from "@/lib/constants"
import { fetchStockPrices } from "@/lib/stock-price-fetcher"
import { runPurchaseRecommendation, runPortfolioAnalysis } from "@/lib/analysis-job-runner"

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
  // 分析日時（StockAnalysisから取得）
  analyzedAt?: string | null
  // ステータス（Portfolio only）
  statusType?: string | null
  // 売却提案（Portfolio only）
  suggestedSellPrice?: number | null
  sellCondition?: string | null
  // 買い時通知（Watchlist only）
  targetBuyPrice?: number | null
  // Transaction data
  transactions?: {
    id: string
    type: string
    quantity: number
    price: number
    totalAmount: number
    transactionDate: string
  }[]
  stock: {
    id: string
    tickerCode: string
    name: string
    sector: string | null
    market: string
    currentPrice: number | null
    fetchFailCount?: number
    isDelisted?: boolean
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

    let watchlistStocks: Awaited<ReturnType<typeof prisma.watchlistStock.findMany<{
      where: { userId: string }
      include: { stock: { select: { id: true; tickerCode: true; name: true; sector: true; market: true; fetchFailCount: true; isDelisted: true } } }
    }>>> = []
    let portfolioStocks: Awaited<ReturnType<typeof prisma.portfolioStock.findMany<{
      where: { userId: string }
      include: {
        stock: { select: { id: true; tickerCode: true; name: true; sector: true; market: true; fetchFailCount: true; isDelisted: true; analyses: { select: { recommendation: true; analyzedAt: true }; orderBy: { analyzedAt: "desc" }; take: 1 } } }
        transactions: { orderBy: { transactionDate: "asc" } }
      }
    }>>> = []

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
              fetchFailCount: true,
              isDelisted: true,
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
              fetchFailCount: true,
              isDelisted: true,
              // 最新のStockAnalysisからrecommendationとanalyzedAtを取得
              analyses: {
                select: {
                  recommendation: true,
                  analyzedAt: true,
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

    // Format response (株価はクライアント側で非同期取得)
    const watchlistResponse: UserStockResponse[] = watchlistStocks.map((ws) => ({
      id: ws.id,
      userId: ws.userId,
      stockId: ws.stockId,
      type: "watchlist" as const,
      targetBuyPrice: ws.targetBuyPrice ? Number(ws.targetBuyPrice) : null,
      stock: {
        id: ws.stock.id,
        tickerCode: ws.stock.tickerCode,
        name: ws.stock.name,
        sector: ws.stock.sector,
        market: ws.stock.market,
        currentPrice: null, // クライアント側で非同期取得
        fetchFailCount: ws.stock.fetchFailCount,
        isDelisted: ws.stock.isDelisted,
      },
      createdAt: ws.createdAt.toISOString(),
      updatedAt: ws.updatedAt.toISOString(),
    }))

    const portfolioResponse: UserStockResponse[] = portfolioStocks.map((ps) => {
      // Calculate from transactions
      const { quantity, averagePurchasePrice } = calculatePortfolioFromTransactions(
        ps.transactions
      )
      const firstBuyTransaction = ps.transactions.find((t) => t.type === "buy")
      const purchaseDate = firstBuyTransaction?.transactionDate || ps.createdAt

      // 最新のStockAnalysisからrecommendationとanalyzedAtを取得
      const latestAnalysis = ps.stock.analyses?.[0]
      const recommendation = latestAnalysis?.recommendation as "buy" | "sell" | "hold" | null
      const analyzedAt = latestAnalysis?.analyzedAt ? latestAnalysis.analyzedAt.toISOString() : null

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
        analyzedAt,
        // ステータス
        statusType: ps.statusType,
        // 売却提案
        suggestedSellPrice: ps.suggestedSellPrice ? Number(ps.suggestedSellPrice) : null,
        sellCondition: ps.sellCondition,
        transactions: ps.transactions.map((t) => ({
          id: t.id,
          type: t.type,
          quantity: t.quantity,
          price: t.price.toNumber(),
          totalAmount: t.totalAmount.toNumber(),
          transactionDate: t.transactionDate.toISOString(),
        })),
        stock: {
          id: ps.stock.id,
          tickerCode: ps.stock.tickerCode,
          name: ps.stock.name,
          sector: ps.stock.sector,
          market: ps.stock.market,
          currentPrice: null, // クライアント側で非同期取得
          fetchFailCount: ps.stock.fetchFailCount,
          isDelisted: ps.stock.isDelisted,
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
 * - watchlist: addedReason?
 * - portfolio: quantity, averagePurchasePrice, purchaseDate?
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
    }

    // Check if stock already exists
    const [existingWatchlist, existingPortfolio, existingPassedStock] = await Promise.all([
      prisma.watchlistStock.findUnique({
        where: { userId_stockId: { userId, stockId: stock.id } },
      }),
      prisma.portfolioStock.findUnique({
        where: { userId_stockId: { userId, stockId: stock.id } },
        include: {
          transactions: {
            orderBy: { transactionDate: "asc" },
          },
        },
      }),
      prisma.trackedStock.findFirst({
        where: { userId, stockId: stock.id },
      }),
    ])

    // ポートフォリオの保有数を計算（保有してた銘柄かどうかの判定用）
    let portfolioQuantity = 0
    if (existingPortfolio) {
      const { quantity } = calculatePortfolioFromTransactions(existingPortfolio.transactions)
      portfolioQuantity = quantity
    }

    // ポートフォリオに追加しようとしている場合
    if (type === "portfolio" && existingPortfolio) {
      // 保有数 > 0（現在保有中）ならエラー
      if (portfolioQuantity > 0) {
        return NextResponse.json(
          { error: "この銘柄は既にポートフォリオに登録されています" },
          { status: 400 }
        )
      }
      // 保有数 === 0（保有してた銘柄）の場合は、再購入として処理を続行
    }

    // ウォッチリストに追加しようとしている場合
    if (type === "watchlist") {
      // 既にウォッチリストにある場合
      if (existingWatchlist) {
        return NextResponse.json(
          { error: "この銘柄は既にウォッチリストに登録されています" },
          { status: 400 }
        )
      }
      // 保有数 > 0（現在保有中）の場合はエラー
      if (existingPortfolio && portfolioQuantity > 0) {
        return NextResponse.json(
          { error: "すでに保有している銘柄です" },
          { status: 400 }
        )
      }
      // 保有数 === 0（保有してた銘柄）の場合は、WatchlistStock作成を続行
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

    // 追跡銘柄から追加する場合、TrackedStockから削除
    if (existingPassedStock) {
      await prisma.trackedStock.delete({
        where: { id: existingPassedStock.id },
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
            },
          },
        },
      })

      // 非同期でAI分析（購入判断）を実行（レスポンスをブロックしない）
      const analysisJob = await prisma.analysisJob.create({
        data: {
          userId,
          type: "purchase-recommendation",
          targetId: stock.id,
          status: "pending",
        },
      })
      Promise.resolve().then(async () => {
        await runPurchaseRecommendation(analysisJob.id, userId, stock.id)
      }).catch((error) => {
        console.error("Failed to run purchase recommendation analysis:", error)
      })

      // リアルタイム株価を取得
      const prices = await fetchStockPrices([watchlistStock.stock.tickerCode])
      const currentPrice = prices[0]?.currentPrice ?? null

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
          currentPrice,
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

      // 保有してた銘柄の再購入か、新規追加かで処理を分岐
      const isRepurchase = existingPortfolio && portfolioQuantity === 0

      let result: {
        portfolioStock: {
          id: string
          userId: string
          stockId: string
          lastAnalysis: Date | null
          shortTerm: string | null
          mediumTerm: string | null
          longTerm: string | null
          createdAt: Date
          updatedAt: Date
          stock: {
            id: string
            tickerCode: string
            name: string
            sector: string | null
            market: string
          }
        }
        transaction: {
          id: string
          type: string
          quantity: number
          price: Decimal
          totalAmount: Decimal
          transactionDate: Date
        }
        allTransactions: {
          id: string
          type: string
          quantity: number
          price: Decimal
          totalAmount: Decimal
          transactionDate: Date
        }[]
      }

      if (isRepurchase) {
        // 保有してた銘柄への再購入：既存PortfolioStockにトランザクションを追加
        const transaction = await prisma.transaction.create({
          data: {
            userId,
            stockId: stock.id,
            portfolioStockId: existingPortfolio.id,
            type: "buy",
            quantity,
            price: new Decimal(averagePurchasePrice),
            totalAmount: new Decimal(quantity).times(averagePurchasePrice),
            transactionDate,
          },
        })

        // 更新されたPortfolioStockを取得
        const portfolioStock = await prisma.portfolioStock.findUnique({
          where: { id: existingPortfolio.id },
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
        })

        if (!portfolioStock) {
          throw new Error("Failed to fetch portfolio stock after repurchase")
        }

        result = {
          portfolioStock,
          transaction,
          allTransactions: portfolioStock.transactions,
        }
      } else {
        // 新規追加：PortfolioStockと購入履歴を同時に作成
        const txResult = await prisma.$transaction(async (tx) => {
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
                },
              },
            },
          })

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

        result = {
          ...txResult,
          allTransactions: [txResult.transaction],
        }
      }

      // 非同期でAI分析（ポートフォリオ分析）を実行（レスポンスをブロックしない）
      const analysisJob = await prisma.analysisJob.create({
        data: {
          userId,
          type: "portfolio-analysis",
          targetId: stock.id,
          status: "pending",
        },
      })
      Promise.resolve().then(async () => {
        await runPortfolioAnalysis(analysisJob.id, userId, stock.id)
      }).catch((error) => {
        console.error("Failed to run portfolio analysis:", error)
      })

      // リアルタイム株価を取得
      const prices = await fetchStockPrices([result.portfolioStock.stock.tickerCode])
      const currentPrice = prices[0]?.currentPrice ?? null

      // 全トランザクションから保有数と平均取得単価を計算
      const calculated = calculatePortfolioFromTransactions(result.allTransactions)
      const firstBuyTx = result.allTransactions.find((t) => t.type === "buy")
      const calculatedPurchaseDate = firstBuyTx?.transactionDate || result.portfolioStock.createdAt

      const response: UserStockResponse = {
        id: result.portfolioStock.id,
        userId: result.portfolioStock.userId,
        stockId: result.portfolioStock.stockId,
        type: "portfolio",
        quantity: calculated.quantity,
        averagePurchasePrice: calculated.averagePurchasePrice.toNumber(),
        purchaseDate: calculatedPurchaseDate instanceof Date
          ? calculatedPurchaseDate.toISOString()
          : calculatedPurchaseDate,
        lastAnalysis: result.portfolioStock.lastAnalysis ? result.portfolioStock.lastAnalysis.toISOString() : null,
        shortTerm: result.portfolioStock.shortTerm,
        mediumTerm: result.portfolioStock.mediumTerm,
        longTerm: result.portfolioStock.longTerm,
        transactions: result.allTransactions.map((t) => ({
          id: t.id,
          type: t.type,
          quantity: t.quantity,
          price: t.price instanceof Decimal ? t.price.toNumber() : Number(t.price),
          totalAmount: t.totalAmount instanceof Decimal ? t.totalAmount.toNumber() : Number(t.totalAmount),
          transactionDate: t.transactionDate instanceof Date
            ? t.transactionDate.toISOString()
            : t.transactionDate,
        })),
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
