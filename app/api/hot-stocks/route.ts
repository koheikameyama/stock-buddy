import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

/**
 * GET /api/hot-stocks
 *
 * 今週のチャンス銘柄を取得
 *
 * クエリパラメータ:
 * - limit: 取得件数（デフォルト: 5）
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get("limit") || "5")

    // 有効期限内のチャンス銘柄を取得
    const hotStocks = await prisma.hotStock.findMany({
      where: {
        validUntil: {
          gte: new Date(),
        },
      },
      include: {
        stock: {
          select: {
            id: true,
            tickerCode: true,
            name: true,
            sector: true,
            currentPrice: true,
            beginnerScore: true,
          },
        },
      },
      orderBy: {
        hotScore: "desc",
      },
      take: limit,
    })

    // ユーザーのポートフォリオとウォッチリストをチェック
    const portfolio = await prisma.portfolio.findUnique({
      where: { userId: session.user.id },
      include: {
        stocks: {
          select: { stockId: true },
        },
      },
    })

    const watchlist = await prisma.watchlist.findMany({
      where: { userId: session.user.id },
      select: { stockId: true },
    })

    const portfolioStockIds = new Set(portfolio?.stocks.map((s) => s.stockId) || [])
    const watchlistStockIds = new Set(watchlist.map((w) => w.stockId))

    // レスポンスを整形
    const response = hotStocks.map((hot) => ({
      id: hot.id,
      stock: {
        id: hot.stock.id,
        ticker: hot.stock.tickerCode,
        name: hot.stock.name,
        sector: hot.stock.sector,
        currentPrice: hot.stock.currentPrice,
        beginnerFriendlyScore: hot.stock.beginnerScore,
      },
      hotScore: hot.hotScore,
      reasons: hot.reasons,
      risks: hot.risks,
      recommendedBudgetPercent: hot.recommendedBudgetPercent,
      recommendation: hot.recommendation,
      confidence: hot.confidence,
      validUntil: hot.validUntil,
      analyzedAt: hot.analyzedAt,
      // ユーザーの保有・監視状況
      isInPortfolio: portfolioStockIds.has(hot.stockId),
      isInWatchlist: watchlistStockIds.has(hot.stockId),
    }))

    return NextResponse.json({
      hotStocks: response,
      count: response.length,
    })
  } catch (error) {
    console.error("チャンス銘柄取得エラー:", error)
    return NextResponse.json(
      { error: "チャンス銘柄の取得に失敗しました" },
      { status: 500 }
    )
  }
}
