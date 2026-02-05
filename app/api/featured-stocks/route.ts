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
 * - あなたへのおすすめ（3件）: 投資スタイル・予算に基づきパーソナライズ
 * - みんなが注目（3件）: 全ユーザー共通の話題銘柄
 */
export async function GET() {
  try {
    // 認証チェック
    const session = await auth()
    const userId = session?.user?.id

    // ユーザーの投資スタイルと保有銘柄を取得
    let investmentPeriod: string | undefined
    let riskTolerance: string | undefined
    let investmentBudget: number | null = null
    let userStockIds: string[] = []

    if (userId) {
      const [userSettings, userStocks] = await Promise.all([
        prisma.userSettings.findUnique({
          where: { userId },
          select: {
            investmentPeriod: true,
            riskTolerance: true,
            investmentBudget: true,
          },
        }),
        Promise.all([
          prisma.watchlistStock.findMany({
            where: { userId },
            select: { stockId: true },
          }),
          prisma.portfolioStock.findMany({
            where: { userId },
            select: { stockId: true },
          }),
        ]).then(([watchlist, portfolio]) => [
          ...watchlist,
          ...portfolio,
        ]),
      ])

      if (userSettings) {
        investmentPeriod = userSettings.investmentPeriod
        riskTolerance = userSettings.riskTolerance
        investmentBudget = userSettings.investmentBudget
      }

      userStockIds = userStocks.map((us) => us.stockId)
    }

    // 投資スタイルに応じて優先カテゴリを決定
    const preferredCategories = determinePreferredCategories(
      investmentPeriod,
      riskTolerance
    )

    // 最新の日付を取得
    const latestDate = await prisma.dailyFeaturedStock.findFirst({
      select: { date: true },
      orderBy: { date: "desc" },
    })

    // データが存在しない場合
    if (!latestDate) {
      return NextResponse.json(
        { personalRecommendations: [], trendingStocks: [], needsGeneration: true },
        { status: 200 }
      )
    }

    // 最新日付のデータのみを取得
    const featuredStocks = await prisma.dailyFeaturedStock.findMany({
      where: {
        date: latestDate.date,
      },
      include: {
        stock: {
          include: {
            prices: {
              orderBy: { date: "desc" },
              take: 1,
            },
          },
        },
      },
      orderBy: [
        { score: "desc" },
      ],
    })

    // 注目銘柄が存在しない場合
    if (featuredStocks.length === 0) {
      return NextResponse.json(
        { personalRecommendations: [], trendingStocks: [], needsGeneration: true },
        { status: 200 }
      )
    }

    // レスポンス整形用ヘルパー
    const formatStock = (fs: typeof featuredStocks[number]) => ({
      id: fs.id,
      stockId: fs.stockId,
      position: fs.position,
      category: fs.category,
      reason: fs.reason,
      score: fs.score,
      isOwned: userStockIds.includes(fs.stockId),
      stock: {
        id: fs.stock.id,
        tickerCode: fs.stock.tickerCode,
        name: fs.stock.name,
        sector: fs.stock.sector,
        currentPrice: fs.stock.prices[0]
          ? Number(fs.stock.prices[0].close)
          : null,
      },
    })

    // --- あなたへのおすすめ（surge + stable から予算・スタイルでフィルタ、上位3件）---
    const recommendationCandidates = featuredStocks
      .filter((fs) => fs.category === "surge" || fs.category === "stable")

    // 予算フィルタリング（設定がある場合のみ）
    const budgetFiltered = investmentBudget
      ? recommendationCandidates.filter((fs) => {
          const currentPrice = fs.stock.prices[0]
            ? Number(fs.stock.prices[0].close)
            : null
          if (currentPrice === null) return true
          const minPurchaseAmount = currentPrice * 100
          return minPurchaseAmount <= investmentBudget
        })
      : recommendationCandidates

    // 優先カテゴリ順 → スコア順でソート
    const personalSorted = [...budgetFiltered].sort((a, b) => {
      const aIndex = preferredCategories.indexOf(a.category)
      const bIndex = preferredCategories.indexOf(b.category)
      if (aIndex !== bIndex) return aIndex - bIndex
      return b.score - a.score
    })

    const personalRecommendations = personalSorted.slice(0, 3).map(formatStock)

    // --- みんなが注目（trending カテゴリ、予算フィルタなし、上位3件）---
    const trendingStocks = featuredStocks
      .filter((fs) => fs.category === "trending")
      .slice(0, 3)
      .map(formatStock)

    return NextResponse.json({
      personalRecommendations,
      trendingStocks,
      date: latestDate.date,
    }, { status: 200 })
  } catch (error) {
    console.error("Error fetching featured stocks:", error)
    return NextResponse.json(
      { error: "注目銘柄の取得に失敗しました" },
      { status: 500 }
    )
  }
}

/**
 * 投資スタイルに応じて優先カテゴリを決定
 */
function determinePreferredCategories(
  investmentPeriod?: string,
  riskTolerance?: string
): string[] {
  // デフォルトは安定→話題→急騰
  let categories = ["stable", "trending", "surge"]

  if (investmentPeriod === "short") {
    categories = ["surge", "trending", "stable"]
  } else if (investmentPeriod === "medium") {
    categories = ["trending", "stable", "surge"]
  } else if (investmentPeriod === "long") {
    categories = ["stable", "trending", "surge"]
  }

  if (riskTolerance === "high") {
    categories = ["surge", ...categories.filter((c) => c !== "surge")]
  } else if (riskTolerance === "low") {
    categories = ["stable", ...categories.filter((c) => c !== "stable")]
  }

  return categories
}
