import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { verifyCronOrSession } from "@/lib/cron-auth"
import { prisma } from "@/lib/prisma"
import { getTodayForDB } from "@/lib/date-utils"
import { Decimal } from "@prisma/client/runtime/library"

interface StockWithMetrics {
  id: string
  tickerCode: string
  name: string
  isProfitable: boolean | null
  profitTrend: string | null
  weekChangeRate: Decimal | null
  volatility: Decimal | null
  volumeRatio: Decimal | null
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
 *
 * 事前にfetch-stock-pricesジョブで更新されたDBデータを使用
 */
export async function POST(request: NextRequest) {
  try {
    // 認証チェック（セッションまたはCRON）
    const session = await auth()
    const authResult = verifyCronOrSession(request, session)

    if (authResult instanceof NextResponse) {
      return authResult
    }

    // 銘柄と事前計算済み指標を取得
    const stocks = await getStocksWithMetrics()

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
 * 全銘柄と事前計算済み指標を取得（DBから直接取得）
 *
 * fetch-stock-pricesジョブで更新された以下のフィールドを使用:
 * - weekChangeRate: 週間変化率（%）
 * - volatility: 30日間ボラティリティ（%）
 * - volumeRatio: 出来高比率（直近3日/4-30日前）
 */
async function getStocksWithMetrics(): Promise<StockWithMetrics[]> {
  // priceUpdatedAtが存在する銘柄のみ取得（株価データが更新済み）
  // 赤字企業は除外（初心者向けに安全な銘柄のみ）
  const stocks = await prisma.stock.findMany({
    where: {
      priceUpdatedAt: { not: null },
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
      weekChangeRate: true,
      volatility: true,
      volumeRatio: true,
    },
    orderBy: {
      marketCap: "desc",
    },
  })

  return stocks
}

/**
 * surge（短期急騰）銘柄を抽出
 * 条件: 週間上昇率+5%以上
 */
function calculateSurgeStocks(
  stocks: StockWithMetrics[]
): FeaturedStockCandidate[] {
  const candidates: { stock: StockWithMetrics; changeRate: number }[] = []

  for (const stock of stocks) {
    if (stock.weekChangeRate === null) continue

    const changeRate = Number(stock.weekChangeRate)

    if (changeRate >= 5.0) {
      candidates.push({ stock, changeRate })
    }
  }

  // 上昇率が高い順にソート
  candidates.sort((a, b) => b.changeRate - a.changeRate)

  // Top 5を選出
  return candidates.slice(0, 5).map((c) => {
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
  stocks: StockWithMetrics[]
): FeaturedStockCandidate[] {
  const candidates: { stock: StockWithMetrics; volatility: number }[] = []

  for (const stock of stocks) {
    if (stock.volatility === null) continue

    const volatility = Number(stock.volatility)

    if (volatility <= 15.0) {
      candidates.push({ stock, volatility })
    }
  }

  // ボラティリティが低い順にソート（安定している順）
  candidates.sort((a, b) => a.volatility - b.volatility)

  // Top 5を選出
  return candidates.slice(0, 5).map((c) => {
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
 * 条件: 出来高比率1.5倍以上
 */
function calculateTrendingStocks(
  stocks: StockWithMetrics[]
): FeaturedStockCandidate[] {
  const candidates: { stock: StockWithMetrics; volumeRatio: number }[] = []

  for (const stock of stocks) {
    if (stock.volumeRatio === null) continue

    const volumeRatio = Number(stock.volumeRatio)

    if (volumeRatio >= 1.5) {
      candidates.push({ stock, volumeRatio })
    }
  }

  // 取引高増加率が高い順にソート
  candidates.sort((a, b) => b.volumeRatio - a.volumeRatio)

  // Top 5を選出
  return candidates.slice(0, 5).map((c) => {
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
  // JSTの今日00:00をUTCに変換
  const today = getTodayForDB()

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
