import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { MAX_PASSED_STOCKS_RETRIEVE, DEFAULT_INVESTMENT_BUDGET } from "@/lib/constants"

/**
 * GET /api/passed-stocks
 * ユーザーの見送り銘柄一覧を取得
 */
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user.id

  try {
    const passedStocks = await prisma.passedStockTracking.findMany({
      where: { userId },
      include: {
        stock: {
          select: {
            id: true,
            tickerCode: true,
            name: true,
            sector: true,
            currentPrice: true,
          },
        },
      },
      orderBy: { passedAt: "desc" },
      take: MAX_PASSED_STOCKS_RETRIEVE,
    })

    // レスポンス整形
    const response = passedStocks.map((ps) => {
      const currentPrice = ps.stock.currentPrice ? Number(ps.stock.currentPrice) : null
      const passedPrice = Number(ps.passedPrice)

      // 現在の価格変動を計算
      let priceChangePercent = ps.priceChangePercent ? Number(ps.priceChangePercent) : null
      let whatIfProfit = ps.whatIfProfit ? Number(ps.whatIfProfit) : null

      if (currentPrice && passedPrice) {
        priceChangePercent = ((currentPrice - passedPrice) / passedPrice) * 100
        // 仮定購入数量（予算10万円として100株単位で計算）
        const whatIfQuantity = ps.whatIfQuantity || Math.floor(100000 / passedPrice / 100) * 100
        whatIfProfit = (currentPrice - passedPrice) * whatIfQuantity
      }

      return {
        id: ps.id,
        stockId: ps.stockId,
        stock: {
          id: ps.stock.id,
          tickerCode: ps.stock.tickerCode,
          name: ps.stock.name,
          sector: ps.stock.sector,
          currentPrice,
        },
        passedAt: ps.passedAt.toISOString(),
        passedPrice,
        passedReason: ps.passedReason,
        source: ps.source,
        currentPrice,
        priceChangePercent,
        whatIfProfit,
        whatIfQuantity: ps.whatIfQuantity,
        wasGoodDecision: ps.wasGoodDecision,
        feedbackNote: ps.feedbackNote,
        createdAt: ps.createdAt.toISOString(),
      }
    })

    return NextResponse.json(response)
  } catch (error) {
    console.error("Error fetching passed stocks:", error)
    return NextResponse.json(
      { error: "見送り銘柄の取得に失敗しました" },
      { status: 500 }
    )
  }
}

/**
 * POST /api/passed-stocks
 * 銘柄を見送りとして記録
 */
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user.id

  try {
    const body = await request.json()
    const { stockId, passedReason, source } = body

    if (!stockId) {
      return NextResponse.json(
        { error: "stockId is required" },
        { status: 400 }
      )
    }

    // 銘柄情報を取得
    const stock = await prisma.stock.findUnique({
      where: { id: stockId },
      select: {
        id: true,
        tickerCode: true,
        name: true,
        currentPrice: true,
      },
    })

    if (!stock) {
      return NextResponse.json(
        { error: "銘柄が見つかりません" },
        { status: 404 }
      )
    }

    if (!stock.currentPrice) {
      return NextResponse.json(
        { error: "株価データがありません" },
        { status: 400 }
      )
    }

    // ユーザー設定から予算を取得
    const userSettings = await prisma.userSettings.findUnique({
      where: { userId },
      select: { investmentBudget: true },
    })

    const budget = userSettings?.investmentBudget || DEFAULT_INVESTMENT_BUDGET
    const passedPrice = Number(stock.currentPrice)
    const whatIfQuantity = Math.floor(budget / passedPrice / 100) * 100 || 100

    // 見送り記録を作成
    const passedStock = await prisma.passedStockTracking.create({
      data: {
        userId,
        stockId,
        passedPrice: stock.currentPrice,
        passedReason: passedReason || null,
        source: source || "watchlist",
        currentPrice: stock.currentPrice,
        priceChangePercent: 0,
        whatIfProfit: 0,
        whatIfQuantity,
        lastTrackedAt: new Date(),
      },
      include: {
        stock: {
          select: {
            id: true,
            tickerCode: true,
            name: true,
            sector: true,
            currentPrice: true,
          },
        },
      },
    })

    return NextResponse.json({
      id: passedStock.id,
      stockId: passedStock.stockId,
      stock: {
        id: passedStock.stock.id,
        tickerCode: passedStock.stock.tickerCode,
        name: passedStock.stock.name,
        sector: passedStock.stock.sector,
        currentPrice: passedStock.stock.currentPrice
          ? Number(passedStock.stock.currentPrice)
          : null,
      },
      passedAt: passedStock.passedAt.toISOString(),
      passedPrice: Number(passedStock.passedPrice),
      passedReason: passedStock.passedReason,
      source: passedStock.source,
      message: "見送り銘柄として記録しました",
    }, { status: 201 })
  } catch (error) {
    console.error("Error creating passed stock:", error)
    return NextResponse.json(
      { error: "見送り銘柄の記録に失敗しました" },
      { status: 500 }
    )
  }
}
