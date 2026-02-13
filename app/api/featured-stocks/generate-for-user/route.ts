import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { verifyCronOrSession } from "@/lib/cron-auth"
import { prisma } from "@/lib/prisma"
import { fetchHistoricalPrices } from "@/lib/stock-price-fetcher"
import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"

dayjs.extend(utc)

interface StockWithPrices {
  id: string
  tickerCode: string
  name: string
  isProfitable: boolean | null
  profitTrend: string | null
  prices: {
    date: string
    close: number
    volume: number
  }[]
}

interface FeaturedStockCandidate {
  stockId: string
  category: string
  reason: string
  score: number
}

/**
 * POST /api/featured-stocks/generate-for-user
 * ユーザーが手動で、またはCRONで注目銘柄を生成
 */
export async function POST(request: NextRequest) {
  try {
    // 認証チェック（セッションまたはCRON）
    const session = await auth()
    const authResult = verifyCronOrSession(request, session)

    if (authResult instanceof NextResponse) {
      return authResult
    }

    // 銘柄と株価データを取得
    const stocks = await getStocksWithPrices()

    if (stocks.length === 0) {
      return NextResponse.json(
        { error: "十分な株価データがありません" },
        { status: 400 }
      )
    }

    // 各カテゴリの銘柄を抽出
    const surgeStocks = calculateSurgeStocks(stocks)
    const stableStocks = calculateStableStocks(stocks)
    const trendingStocks = calculateTrendingStocks(stocks)

    const allFeatured = [...surgeStocks, ...stableStocks, ...trendingStocks]

    if (allFeatured.length === 0) {
      return NextResponse.json(
        { error: "条件に合う銘柄が見つかりませんでした" },
        { status: 400 }
      )
    }

    // データベースに保存
    await saveDailyFeaturedStocks(allFeatured)

    return NextResponse.json({
      success: true,
      count: allFeatured.length,
      surge: surgeStocks.length,
      stable: stableStocks.length,
      trending: trendingStocks.length,
    })
  } catch (error) {
    console.error("Error generating featured stocks:", error)
    return NextResponse.json(
      { error: "注目銘柄の生成に失敗しました" },
      { status: 500 }
    )
  }
}

/**
 * 全銘柄と過去30日分の株価データを取得（yfinanceからリアルタイム取得）
 */
async function getStocksWithPrices(): Promise<StockWithPrices[]> {
  // 上位50銘柄を取得（全銘柄だと時間がかかりすぎる）
  // 赤字企業は除外（初心者向けに安全な銘柄のみ）
  const stocks = await prisma.stock.findMany({
    where: {
      OR: [
        { isProfitable: true },
        { isProfitable: null }, // 業績データがない場合は除外しない
      ],
    },
    select: {
      id: true,
      tickerCode: true,
      name: true,
      isProfitable: true,
      profitTrend: true,
    },
    orderBy: {
      tickerCode: "asc",
    },
    take: 50,
  })

  // 各銘柄のヒストリカルデータをyfinanceから取得
  const stocksWithPrices: StockWithPrices[] = []

  for (const stock of stocks) {
    try {
      const historicalPrices = await fetchHistoricalPrices(stock.tickerCode, "1m")

      if (historicalPrices.length >= 7) {
        // 新しい順に並べ替え
        const sortedPrices = [...historicalPrices].reverse()
        stocksWithPrices.push({
          id: stock.id,
          tickerCode: stock.tickerCode,
          name: stock.name,
          isProfitable: stock.isProfitable,
          profitTrend: stock.profitTrend,
          prices: sortedPrices.map((p) => ({
            date: p.date,
            close: p.close,
            volume: p.volume,
          })),
        })
      }
    } catch (error) {
      console.error(`Error fetching prices for ${stock.tickerCode}:`, error)
    }
  }

  return stocksWithPrices
}

/**
 * surge（短期急騰）銘柄を抽出
 * 条件: 7日間の株価上昇率+5%以上
 */
function calculateSurgeStocks(
  stocks: StockWithPrices[]
): FeaturedStockCandidate[] {
  const candidates: { stock: StockWithPrices; changeRate: number }[] = []

  for (const stock of stocks) {
    if (stock.prices.length < 7) continue

    const latestPrice = Number(stock.prices[0].close)
    const weekAgoPrice = Number(stock.prices[6].close)

    if (weekAgoPrice === 0) continue

    const changeRate = ((latestPrice - weekAgoPrice) / weekAgoPrice) * 100

    if (changeRate >= 5.0) {
      candidates.push({ stock, changeRate })
    }
  }

  // 上昇率が高い順にソート
  candidates.sort((a, b) => b.changeRate - a.changeRate)

  // Top 3を選出
  return candidates.slice(0, 3).map((c) => {
    let score = Math.round(c.changeRate * 10) // 上昇率をスコアに変換
    // 業績加点: 黒字+増益 +10点、黒字のみ +5点
    if (c.stock.isProfitable === true) {
      score += c.stock.profitTrend === "increasing" ? 10 : 5
    }
    return {
      stockId: c.stock.id,
      category: "surge",
      reason: `この1週間で株価が${c.changeRate.toFixed(1)}%上昇しています`,
      score,
    }
  })
}

/**
 * stable（中長期安定）銘柄を抽出
 * 条件: 30日間のボラティリティ15%以下
 */
function calculateStableStocks(
  stocks: StockWithPrices[]
): FeaturedStockCandidate[] {
  const candidates: { stock: StockWithPrices; volatility: number }[] = []

  for (const stock of stocks) {
    if (stock.prices.length < 30) continue

    // ボラティリティを計算
    const closePrices = stock.prices.map((p) => Number(p.close))
    const avgPrice = closePrices.reduce((a, b) => a + b, 0) / closePrices.length
    const variance =
      closePrices.reduce((sum, p) => sum + Math.pow(p - avgPrice, 2), 0) /
      closePrices.length
    const stdDev = Math.sqrt(variance)

    if (avgPrice === 0) continue

    const volatility = (stdDev / avgPrice) * 100

    if (volatility <= 15.0) {
      candidates.push({ stock, volatility })
    }
  }

  // ボラティリティが低い順にソート（安定している順）
  candidates.sort((a, b) => a.volatility - b.volatility)

  // Top 3を選出
  return candidates.slice(0, 3).map((c) => {
    let score = Math.round(100 - c.volatility * 5) // 安定度をスコアに変換
    // 業績加点: 黒字+増益 +10点、黒字のみ +5点
    if (c.stock.isProfitable === true) {
      score += c.stock.profitTrend === "increasing" ? 10 : 5
    }
    return {
      stockId: c.stock.id,
      category: "stable",
      reason: `安定した値動きで、初心者に最適な銘柄です（変動率${c.volatility.toFixed(1)}%）`,
      score,
    }
  })
}

/**
 * trending（話題）銘柄を抽出
 * 条件: 7日間の平均取引高 > 過去30日間の平均取引高 × 1.5倍
 */
function calculateTrendingStocks(
  stocks: StockWithPrices[]
): FeaturedStockCandidate[] {
  const candidates: { stock: StockWithPrices; volumeRatio: number }[] = []

  for (const stock of stocks) {
    if (stock.prices.length < 30) continue

    // 直近7日の平均取引高
    const recentVolumes = stock.prices
      .slice(0, 7)
      .map((p) => (p.volume ? Number(p.volume) : 0))
      .filter((v) => v > 0)

    if (recentVolumes.length === 0) continue

    const recentAvgVolume =
      recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length

    // 過去30日の平均取引高
    const allVolumes = stock.prices
      .map((p) => (p.volume ? Number(p.volume) : 0))
      .filter((v) => v > 0)

    if (allVolumes.length === 0) continue

    const totalAvgVolume =
      allVolumes.reduce((a, b) => a + b, 0) / allVolumes.length

    if (totalAvgVolume === 0) continue

    const volumeRatio = recentAvgVolume / totalAvgVolume

    if (volumeRatio >= 1.5) {
      candidates.push({ stock, volumeRatio })
    }
  }

  // 取引高増加率が高い順にソート
  candidates.sort((a, b) => b.volumeRatio - a.volumeRatio)

  // Top 3を選出
  return candidates.slice(0, 3).map((c) => {
    let score = Math.round(c.volumeRatio * 30) // 出来高比率をスコアに変換
    // 業績加点: 黒字+増益 +10点、黒字のみ +5点
    if (c.stock.isProfitable === true) {
      score += c.stock.profitTrend === "increasing" ? 10 : 5
    }
    return {
      stockId: c.stock.id,
      category: "trending",
      reason: `最近取引が活発になっている注目銘柄です（取引高${c.volumeRatio.toFixed(1)}倍）`,
      score,
    }
  })
}

/**
 * DailyFeaturedStockテーブルに保存
 */
async function saveDailyFeaturedStocks(
  featuredStocks: FeaturedStockCandidate[]
) {
  const today = dayjs.utc().startOf("day").toDate()

  // 既存データを削除（今日の日付）
  await prisma.dailyFeaturedStock.deleteMany({
    where: { date: today },
  })

  // 新しいデータを挿入
  await prisma.dailyFeaturedStock.createMany({
    data: featuredStocks.map((fs, idx) => ({
      date: today,
      stockId: fs.stockId,
      category: fs.category,
      position: idx + 1,
      reason: fs.reason,
      score: fs.score,
    })),
  })
}
