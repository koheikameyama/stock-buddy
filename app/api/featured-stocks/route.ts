import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { getTodayForDB } from "@/lib/date-utils"

/**
 * GET /api/featured-stocks
 * 今日の注目銘柄を取得
 * - あなたへのおすすめ（3件）: UserDailyRecommendation（AIがユーザーごとに生成）
 * - みんなが注目（3件）: DailyFeaturedStock の trending カテゴリ
 * - 当日データがなければ最新データを返し、isToday: false を返す
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

    // 日本時間で今日の00:00:00をUTCに変換
    const todayUTC = getTodayForDB()

    // ユーザーの銘柄IDを取得
    const [watchlist, portfolio, tracked] = await Promise.all([
      prisma.watchlistStock.findMany({
        where: { userId },
        select: { stockId: true },
      }),
      prisma.portfolioStock.findMany({
        where: { userId },
        select: { stockId: true },
      }),
      prisma.trackedStock.findMany({
        where: { userId },
        select: { stockId: true },
      }),
    ])
    // 保有中 = ポートフォリオにある銘柄のみ
    const portfolioStockIds = portfolio.map((s) => s.stockId)
    // 登録済み = ウォッチリスト、ポートフォリオ、または追跡中にある銘柄
    const registeredStockIds = [...watchlist, ...portfolio, ...tracked].map((s) => s.stockId)

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
    let isRecommendationToday = false

    // まず当日データを取得
    let recs = await prisma.userDailyRecommendation.findMany({
      where: {
        userId,
        date: todayUTC,
      },
      include: {
        stock: true,
      },
      orderBy: { position: "asc" },
    })

    if (recs.length > 0) {
      recommendationDate = todayUTC
      isRecommendationToday = true
    } else {
      // 当日データがなければ最新データを取得
      const latestRec = await prisma.userDailyRecommendation.findFirst({
        where: { userId },
        select: { date: true },
        orderBy: { date: "desc" },
      })

      if (latestRec) {
        recs = await prisma.userDailyRecommendation.findMany({
          where: {
            userId,
            date: latestRec.date,
          },
          include: {
            stock: true,
          },
          orderBy: { position: "asc" },
        })
        recommendationDate = latestRec.date
        isRecommendationToday = false
      }
    }

    if (recs.length > 0) {
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
          currentPrice: null, // リアルタイム取得で後から設定
        },
      }))
    }

    // --- みんなが注目（DailyFeaturedStock の trending） ---
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

    let trendingDate: Date | null = null
    let isTrendingToday = false

    // まず当日データを取得
    let trending = await prisma.dailyFeaturedStock.findMany({
      where: {
        date: todayUTC,
        category: "trending",
      },
      include: {
        stock: true,
      },
      orderBy: { position: "asc" },
      take: 3,
    })

    if (trending.length > 0) {
      trendingDate = todayUTC
      isTrendingToday = true
    } else {
      // 当日データがなければ最新データを取得
      const latestFeatured = await prisma.dailyFeaturedStock.findFirst({
        where: { category: "trending" },
        select: { date: true },
        orderBy: { date: "desc" },
      })

      if (latestFeatured) {
        trending = await prisma.dailyFeaturedStock.findMany({
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
        trendingDate = latestFeatured.date
        isTrendingToday = false
      }
    }

    if (trending.length > 0) {
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
          currentPrice: null, // リアルタイム取得で後から設定
        },
      }))
    }

    // isTodayは両方のデータが当日かどうか（片方でも古ければfalse）
    const isToday = isRecommendationToday && isTrendingToday

    return NextResponse.json({
      personalRecommendations,
      trendingStocks,
      date: recommendationDate || trendingDate || null,
      isToday,
    }, { status: 200 })
  } catch (error) {
    console.error("Error fetching featured stocks:", error)
    return NextResponse.json(
      { error: "注目銘柄の取得に失敗しました" },
      { status: 500 }
    )
  }
}
