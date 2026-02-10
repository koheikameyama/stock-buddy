import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"

dayjs.extend(utc)
dayjs.extend(timezone)

/**
 * GET /api/featured-stocks
 * 今日の注目銘柄を取得
 * - あなたへのおすすめ（3件）: UserDailyRecommendation（AIがユーザーごとに生成）
 * - みんなが注目（3件）: DailyFeaturedStock の trending カテゴリ
 */
export async function GET() {
  try {
    const session = await auth()
    const userId = session?.user?.id

    if (!userId) {
      return NextResponse.json(
        { error: "認証が必要です" },
        { status: 401 }
      )
    }

    // ユーザーの銘柄IDを取得
    const [watchlist, portfolio] = await Promise.all([
      prisma.watchlistStock.findMany({
        where: { userId },
        select: { stockId: true },
      }),
      prisma.portfolioStock.findMany({
        where: { userId },
        select: { stockId: true },
      }),
    ])
    // 保有中 = ポートフォリオにある銘柄のみ
    const portfolioStockIds = portfolio.map((s) => s.stockId)
    // 登録済み = ウォッチリストまたはポートフォリオにある銘柄
    const registeredStockIds = [...watchlist, ...portfolio].map((s) => s.stockId)

    // --- あなたへのおすすめ（ユーザーごとのAI生成） ---
    let personalRecommendations: {
      id: string
      stockId: string
      reason: string
      category: string | null
      isOwned: boolean
      isRegistered: boolean
      stock: {
        id: string
        tickerCode: string
        name: string
        sector: string | null
        currentPrice: number | null
      }
    }[] = []

    let recommendationDate: Date | null = null

    // 最新日付のおすすめを取得
    const latestRec = await prisma.userDailyRecommendation.findFirst({
      where: { userId },
      select: { date: true },
      orderBy: { date: "desc" },
    })

    if (latestRec) {
      recommendationDate = latestRec.date

      const recs = await prisma.userDailyRecommendation.findMany({
        where: {
          userId,
          date: latestRec.date,
        },
        include: {
          stock: true,
        },
        orderBy: { position: "asc" },
      })

      personalRecommendations = recs.map((r) => ({
        id: r.id,
        stockId: r.stockId,
        reason: r.reason,
        category: null, // UserDailyRecommendation にはカテゴリがない
        isOwned: portfolioStockIds.includes(r.stockId),
        isRegistered: registeredStockIds.includes(r.stockId),
        stock: {
          id: r.stock.id,
          tickerCode: r.stock.tickerCode,
          name: r.stock.name,
          sector: r.stock.sector,
          currentPrice: r.stock.currentPrice
            ? Number(r.stock.currentPrice)
            : null,
        },
      }))
    }

    // --- みんなが注目（DailyFeaturedStock の trending） ---
    const latestFeatured = await prisma.dailyFeaturedStock.findFirst({
      where: { category: "trending" },
      select: { date: true },
      orderBy: { date: "desc" },
    })

    let trendingStocks: {
      id: string
      stockId: string
      reason: string
      category: string
      isOwned: boolean
      isRegistered: boolean
      stock: {
        id: string
        tickerCode: string
        name: string
        sector: string | null
        currentPrice: number | null
      }
    }[] = []

    if (latestFeatured) {
      const trending = await prisma.dailyFeaturedStock.findMany({
        where: {
          date: latestFeatured.date,
          category: "trending",
        },
        include: {
          stock: true,
        },
        orderBy: { position: "asc" },
        take: 3,
      })

      trendingStocks = trending.map((t) => ({
        id: t.id,
        stockId: t.stockId,
        reason: t.reason,
        category: t.category,
        isOwned: portfolioStockIds.includes(t.stockId),
        isRegistered: registeredStockIds.includes(t.stockId),
        stock: {
          id: t.stock.id,
          tickerCode: t.stock.tickerCode,
          name: t.stock.name,
          sector: t.stock.sector,
          currentPrice: t.stock.currentPrice
            ? Number(t.stock.currentPrice)
            : null,
        },
      }))
    }

    return NextResponse.json({
      personalRecommendations,
      trendingStocks,
      date: recommendationDate || latestFeatured?.date || null,
    }, { status: 200 })
  } catch (error) {
    console.error("Error fetching featured stocks:", error)
    return NextResponse.json(
      { error: "注目銘柄の取得に失敗しました" },
      { status: 500 }
    )
  }
}
