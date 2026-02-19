/**
 * 推薦結果追跡（RecommendationOutcome）ユーティリティ
 *
 * 推薦1件ごとに、推薦時点の状態と時間経過後のリターンを記録する。
 * 精度検証用のデータ基盤。
 */

import { prisma } from "@/lib/prisma"
import { getSectorTrend } from "@/lib/sector-trend"

export type OutcomeType = "daily" | "purchase" | "analysis"
export type Prediction = "buy" | "stay" | "remove" | "up" | "down" | "neutral"

export interface OutcomeData {
  type: OutcomeType
  recommendationId: string
  stockId: string
  tickerCode: string
  sector?: string | null
  recommendedAt: Date
  priceAtRec: number
  prediction: Prediction
  confidence?: number | null
  volatility?: number | null
  marketCap?: bigint | null
  sectorTrendScore?: number | null
  sectorTrendDirection?: string | null
}

/**
 * RecommendationOutcome レコードを作成する。
 * 失敗しても推薦自体の保存には影響させない（エラーはログに出力）。
 */
export async function insertRecommendationOutcome(
  data: OutcomeData
): Promise<string | null> {
  try {
    // セクタートレンドの自動取得（呼び出し元が未指定の場合）
    let trendScore = data.sectorTrendScore ?? null
    let trendDirection = data.sectorTrendDirection ?? null
    if (trendScore === null && data.sector) {
      try {
        const trend = await getSectorTrend(data.sector)
        if (trend) {
          trendScore = trend.compositeScore
          trendDirection = trend.trendDirection
        }
      } catch {
        // トレンド取得失敗はoutcome作成をブロックしない
      }
    }

    const outcome = await prisma.recommendationOutcome.upsert({
      where: {
        type_recommendationId: {
          type: data.type,
          recommendationId: data.recommendationId,
        },
      },
      create: {
        type: data.type,
        recommendationId: data.recommendationId,
        stockId: data.stockId,
        tickerCode: data.tickerCode,
        sector: data.sector,
        recommendedAt: data.recommendedAt,
        priceAtRec: data.priceAtRec,
        prediction: data.prediction,
        confidence: data.confidence,
        volatility: data.volatility,
        marketCap: data.marketCap,
        sectorTrendScore: trendScore,
        sectorTrendDirection: trendDirection,
      },
      update: {
        stockId: data.stockId,
        tickerCode: data.tickerCode,
        sector: data.sector,
        recommendedAt: data.recommendedAt,
        priceAtRec: data.priceAtRec,
        prediction: data.prediction,
        confidence: data.confidence,
        volatility: data.volatility,
        marketCap: data.marketCap,
        sectorTrendScore: trendScore,
        sectorTrendDirection: trendDirection,
      },
    })

    return outcome.id
  } catch (error) {
    console.error("Failed to insert RecommendationOutcome:", error)
    return null
  }
}
