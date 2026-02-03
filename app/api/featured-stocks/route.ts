import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

/**
 * GET /api/featured-stocks
 * 今日の注目銘柄を取得（ユーザーの投資スタイルに応じてパーソナライズ）
 */
export async function GET() {
  try {
    // 今日の日付をUTC 00:00:00で取得
    const now = new Date()
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))

    // 前日の日付も含めて検索（データ生成タイミングのズレを考慮）
    const yesterday = new Date(today)
    yesterday.setUTCDate(yesterday.getUTCDate() - 1)

    // 認証チェック
    const session = await auth()
    const userId = session?.user?.id

    // ユーザーの投資スタイルと保有銘柄を取得
    let investmentPeriod: string | undefined
    let riskTolerance: string | undefined
    let userStockIds: string[] = []

    if (userId) {
      const [userSettings, userStocks] = await Promise.all([
        prisma.userSettings.findUnique({
          where: { userId },
          select: {
            investmentPeriod: true,
            riskTolerance: true,
          },
        }),
        prisma.userStock.findMany({
          where: { userId },
          select: { stockId: true },
        }),
      ])

      if (userSettings) {
        investmentPeriod = userSettings.investmentPeriod
        riskTolerance = userSettings.riskTolerance
      }

      userStockIds = userStocks.map((us) => us.stockId)
    }

    // 投資スタイルに応じてカテゴリを決定
    const preferredCategories = determinePreferredCategories(
      investmentPeriod,
      riskTolerance
    )

    // 今日または前日の注目銘柄を取得（データ生成タイミングのズレを考慮）
    const featuredStocks = await prisma.dailyFeaturedStock.findMany({
      where: {
        date: {
          gte: yesterday,
          lte: today,
        },
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
        { date: "desc" }, // 最新の日付を優先
        { position: "asc" },
      ],
    })

    // 注目銘柄が存在しない場合
    if (featuredStocks.length === 0) {
      return NextResponse.json(
        { featuredStocks: [], needsGeneration: true },
        { status: 200 }
      )
    }

    // カテゴリ別に並び替え（優先カテゴリを上位に）
    const sortedStocks = [...featuredStocks].sort((a, b) => {
      const aIndex = preferredCategories.indexOf(a.category)
      const bIndex = preferredCategories.indexOf(b.category)

      // 優先カテゴリに含まれる場合、その順序で並べる
      if (aIndex !== -1 && bIndex !== -1) {
        return aIndex - bIndex
      }
      if (aIndex !== -1) return -1
      if (bIndex !== -1) return 1

      // それ以外はposition順
      return a.position - b.position
    })

    // レスポンス整形
    const response = sortedStocks.map((fs) => ({
      id: fs.id,
      stockId: fs.stockId,
      position: fs.position,
      category: fs.category,
      reason: fs.reason,
      score: fs.score,
      isOwned: userStockIds.includes(fs.stockId), // 保有中かどうか
      isRecommended: preferredCategories[0] === fs.category, // 最優先カテゴリかどうか
      stock: {
        id: fs.stock.id,
        tickerCode: fs.stock.tickerCode,
        name: fs.stock.name,
        sector: fs.stock.sector,
        currentPrice: fs.stock.prices[0]
          ? Number(fs.stock.prices[0].close)
          : null,
      },
    }))

    return NextResponse.json({
      featuredStocks: response,
      preferredCategory: preferredCategories[0], // 優先カテゴリ情報
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
 *
 * @param investmentPeriod 投資期間（short/medium/long）
 * @param riskTolerance リスク許容度（low/medium/high）
 * @returns 優先カテゴリの配列（優先順）
 */
function determinePreferredCategories(
  investmentPeriod?: string,
  riskTolerance?: string
): string[] {
  // デフォルトは安定→話題→急騰
  let categories = ["stable", "trending", "surge"]

  // 投資期間が短期の場合
  if (investmentPeriod === "short") {
    categories = ["surge", "trending", "stable"]
  }
  // 投資期間が中期の場合
  else if (investmentPeriod === "medium") {
    categories = ["trending", "stable", "surge"]
  }
  // 投資期間が長期の場合
  else if (investmentPeriod === "long") {
    categories = ["stable", "trending", "surge"]
  }

  // リスク許容度が高い場合は急騰を優先
  if (riskTolerance === "high") {
    categories = ["surge", ...categories.filter((c) => c !== "surge")]
  }
  // リスク許容度が低い場合は安定を優先
  else if (riskTolerance === "low") {
    categories = ["stable", ...categories.filter((c) => c !== "stable")]
  }

  return categories
}
