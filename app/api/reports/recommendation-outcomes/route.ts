import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getDaysAgoForDB } from "@/lib/date-utils"

/**
 * 成功基準の判定
 */
function isSuccess(prediction: string, returnValue: number | null): boolean | null {
  if (returnValue === null) return null

  switch (prediction) {
    case "buy":
      // 大きく下がらなければ成功
      return returnValue > -3
    case "stay":
      // 見逃した急騰がなければ成功
      return returnValue <= 5
    case "remove":
      // 大きく上がらなければ成功
      return returnValue < 3
    case "up":
      // 予測方向に概ね合っていれば成功
      return returnValue > -3
    case "down":
      return returnValue < 3
    case "neutral":
      // 大きく動かなければ成功
      return returnValue >= -5 && returnValue <= 5
    default:
      return null
  }
}

/**
 * GET /api/reports/recommendation-outcomes
 * 個別推薦結果の取得
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)

  const type = searchParams.get("type") as "daily" | "purchase" | "analysis" | null
  const sector = searchParams.get("sector")
  const days = parseInt(searchParams.get("days") || "30")
  const limit = parseInt(searchParams.get("limit") || "50")

  try {
    const sinceDate = getDaysAgoForDB(days)

    // 検索条件を構築
    const where: Record<string, unknown> = {
      recommendedAt: { gte: sinceDate },
    }

    if (type) {
      where.type = type
    }

    if (sector) {
      where.sector = sector
    }

    // Outcomeレコードを取得
    const outcomes = await prisma.recommendationOutcome.findMany({
      where,
      include: {
        stock: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        recommendedAt: "desc",
      },
      take: limit,
    })

    // 7日後リターンが評価済みのもののみでサマリーを計算
    const evaluatedOutcomes = outcomes.filter(o => o.returnAfter7Days !== null)

    let successCount = 0
    let totalReturn = 0
    let benchmarkTotalReturn = 0
    let benchmarkCount = 0

    for (const outcome of evaluatedOutcomes) {
      const ret7 = Number(outcome.returnAfter7Days)
      totalReturn += ret7

      if (isSuccess(outcome.prediction, ret7)) {
        successCount++
      }

      if (outcome.benchmarkReturn7Days !== null) {
        benchmarkTotalReturn += Number(outcome.benchmarkReturn7Days)
        benchmarkCount++
      }
    }

    const summary = {
      totalCount: outcomes.length,
      evaluatedCount: evaluatedOutcomes.length,
      successRate7Days: evaluatedOutcomes.length > 0
        ? Math.round((successCount / evaluatedOutcomes.length) * 100)
        : null,
      avgReturn7Days: evaluatedOutcomes.length > 0
        ? Math.round((totalReturn / evaluatedOutcomes.length) * 100) / 100
        : null,
      benchmarkAvgReturn7Days: benchmarkCount > 0
        ? Math.round((benchmarkTotalReturn / benchmarkCount) * 100) / 100
        : null,
    }

    // レスポンス整形
    const responseOutcomes = outcomes.map(o => ({
      id: o.id,
      type: o.type,
      stockId: o.stockId,
      stockName: o.stock.name,
      tickerCode: o.tickerCode,
      sector: o.sector,
      recommendedAt: o.recommendedAt.toISOString(),
      priceAtRec: Number(o.priceAtRec),
      prediction: o.prediction,
      confidence: o.confidence ? Number(o.confidence) : null,
      returnAfter1Day: o.returnAfter1Day ? Number(o.returnAfter1Day) : null,
      returnAfter3Days: o.returnAfter3Days ? Number(o.returnAfter3Days) : null,
      returnAfter7Days: o.returnAfter7Days ? Number(o.returnAfter7Days) : null,
      returnAfter14Days: o.returnAfter14Days ? Number(o.returnAfter14Days) : null,
      benchmarkReturn7Days: o.benchmarkReturn7Days ? Number(o.benchmarkReturn7Days) : null,
      isSuccess7Days: isSuccess(o.prediction, o.returnAfter7Days ? Number(o.returnAfter7Days) : null),
    }))

    return NextResponse.json({
      outcomes: responseOutcomes,
      summary,
    })
  } catch (error) {
    console.error("Error fetching recommendation outcomes:", error)
    return NextResponse.json(
      { error: "推薦結果の取得に失敗しました" },
      { status: 500 }
    )
  }
}
