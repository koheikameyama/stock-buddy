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
      return returnValue > -3
    case "stay":
      return returnValue <= 5
    case "remove":
      return returnValue < 3
    case "up":
      return returnValue > -3
    case "down":
      return returnValue < 3
    case "neutral":
      return returnValue >= -5 && returnValue <= 5
    default:
      return null
  }
}

/**
 * 信頼度のバケットを判定
 */
function getConfidenceBucket(confidence: number | null): string {
  if (confidence === null) return "unknown"
  if (confidence < 0.3) return "低 (0-0.3)"
  if (confidence < 0.6) return "中 (0.3-0.6)"
  return "高 (0.6-1.0)"
}

/**
 * GET /api/reports/recommendation-outcomes/analysis
 * 条件別分析データの取得
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const days = parseInt(searchParams.get("days") || "30")

  try {
    const sinceDate = getDaysAgoForDB(days)

    // 7日後リターンが評価済みのOutcomeを取得
    const outcomes = await prisma.recommendationOutcome.findMany({
      where: {
        recommendedAt: { gte: sinceDate },
        returnAfter7Days: { not: null },
      },
      select: {
        type: true,
        sector: true,
        prediction: true,
        confidence: true,
        volatility: true,
        marketCap: true,
        returnAfter1Day: true,
        returnAfter3Days: true,
        returnAfter7Days: true,
        returnAfter14Days: true,
        benchmarkReturn7Days: true,
      },
    })

    if (outcomes.length === 0) {
      return NextResponse.json({
        byConfidence: [],
        bySector: [],
        byPrediction: [],
        byTimeHorizon: [],
        benchmark: [],
        message: "評価済みのデータがまだありません",
      })
    }

    // 信頼度別分析
    const confidenceBuckets: Record<string, { count: number; successes: number; totalReturn: number }> = {}

    for (const o of outcomes) {
      const bucket = getConfidenceBucket(o.confidence ? Number(o.confidence) : null)
      if (!confidenceBuckets[bucket]) {
        confidenceBuckets[bucket] = { count: 0, successes: 0, totalReturn: 0 }
      }

      const ret7 = Number(o.returnAfter7Days)
      confidenceBuckets[bucket].count++
      confidenceBuckets[bucket].totalReturn += ret7

      if (isSuccess(o.prediction, ret7)) {
        confidenceBuckets[bucket].successes++
      }
    }

    const byConfidence = Object.entries(confidenceBuckets).map(([bucket, data]) => ({
      bucket,
      count: data.count,
      successRate: Math.round((data.successes / data.count) * 100),
      avgReturn: Math.round((data.totalReturn / data.count) * 100) / 100,
    }))

    // セクター別分析
    const sectorGroups: Record<string, {
      count: number
      successes: number
      totalReturn: number
      totalBenchmark: number
      benchmarkCount: number
    }> = {}

    for (const o of outcomes) {
      const sector = o.sector || "その他"
      if (!sectorGroups[sector]) {
        sectorGroups[sector] = { count: 0, successes: 0, totalReturn: 0, totalBenchmark: 0, benchmarkCount: 0 }
      }

      const ret7 = Number(o.returnAfter7Days)
      sectorGroups[sector].count++
      sectorGroups[sector].totalReturn += ret7

      if (isSuccess(o.prediction, ret7)) {
        sectorGroups[sector].successes++
      }

      if (o.benchmarkReturn7Days !== null) {
        sectorGroups[sector].totalBenchmark += Number(o.benchmarkReturn7Days)
        sectorGroups[sector].benchmarkCount++
      }
    }

    const bySector = Object.entries(sectorGroups)
      .map(([sector, data]) => ({
        sector,
        count: data.count,
        successRate: Math.round((data.successes / data.count) * 100),
        avgReturn: Math.round((data.totalReturn / data.count) * 100) / 100,
        excessReturn: data.benchmarkCount > 0
          ? Math.round(((data.totalReturn / data.count) - (data.totalBenchmark / data.benchmarkCount)) * 100) / 100
          : null,
      }))
      .sort((a, b) => b.count - a.count)

    // 予測種類別分析
    const predictionGroups: Record<string, { count: number; successes: number; totalReturn: number }> = {}

    for (const o of outcomes) {
      const pred = o.prediction
      if (!predictionGroups[pred]) {
        predictionGroups[pred] = { count: 0, successes: 0, totalReturn: 0 }
      }

      const ret7 = Number(o.returnAfter7Days)
      predictionGroups[pred].count++
      predictionGroups[pred].totalReturn += ret7

      if (isSuccess(pred, ret7)) {
        predictionGroups[pred].successes++
      }
    }

    const byPrediction = Object.entries(predictionGroups).map(([prediction, data]) => ({
      prediction,
      count: data.count,
      successRate: Math.round((data.successes / data.count) * 100),
      avgReturn: Math.round((data.totalReturn / data.count) * 100) / 100,
    }))

    // 時間枠別分析
    const timeHorizons = [
      { horizon: "1日後", field: "returnAfter1Day" },
      { horizon: "3日後", field: "returnAfter3Days" },
      { horizon: "7日後", field: "returnAfter7Days" },
      { horizon: "14日後", field: "returnAfter14Days" },
    ]

    const byTimeHorizon = timeHorizons.map(({ horizon, field }) => {
      const validOutcomes = outcomes.filter(o => (o as Record<string, unknown>)[field] !== null)
      if (validOutcomes.length === 0) {
        return { horizon, count: 0, successRate: null, avgReturn: null }
      }

      let successes = 0
      let totalReturn = 0

      for (const o of validOutcomes) {
        const ret = Number((o as Record<string, unknown>)[field])
        totalReturn += ret

        if (isSuccess(o.prediction, ret)) {
          successes++
        }
      }

      return {
        horizon,
        count: validOutcomes.length,
        successRate: Math.round((successes / validOutcomes.length) * 100),
        avgReturn: Math.round((totalReturn / validOutcomes.length) * 100) / 100,
      }
    })

    // ベンチマーク比較（期間別）
    const periods = [
      { period: "直近1週間", daysBack: 7 },
      { period: "直近2週間", daysBack: 14 },
      { period: "直近4週間", daysBack: 28 },
    ]

    const now = new Date()
    const benchmark = periods.map(({ period, daysBack }) => {
      const periodStart = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000)
      const periodOutcomes = outcomes.filter(o => {
        // このレコードのrecommendedAtは取得できないのでreturnAfter7Daysがnullでないものを使う
        return o.benchmarkReturn7Days !== null
      })

      if (periodOutcomes.length === 0) {
        return { period, aiReturn: null, benchmarkReturn: null, excess: null }
      }

      let aiTotalReturn = 0
      let benchmarkTotalReturn = 0

      for (const o of periodOutcomes) {
        aiTotalReturn += Number(o.returnAfter7Days)
        benchmarkTotalReturn += Number(o.benchmarkReturn7Days)
      }

      const aiAvg = aiTotalReturn / periodOutcomes.length
      const benchmarkAvg = benchmarkTotalReturn / periodOutcomes.length

      return {
        period,
        aiReturn: Math.round(aiAvg * 100) / 100,
        benchmarkReturn: Math.round(benchmarkAvg * 100) / 100,
        excess: Math.round((aiAvg - benchmarkAvg) * 100) / 100,
      }
    })

    return NextResponse.json({
      byConfidence,
      bySector,
      byPrediction,
      byTimeHorizon,
      benchmark,
    })
  } catch (error) {
    console.error("Error fetching recommendation outcome analysis:", error)
    return NextResponse.json(
      { error: "分析データの取得に失敗しました" },
      { status: 500 }
    )
  }
}
