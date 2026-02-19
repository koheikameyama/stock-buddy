/**
 * 日次おすすめ銘柄のスコア計算ロジック
 *
 * Pythonスクリプト (generate_personal_recommendations.py) から移植
 */

import { MA_DEVIATION } from "@/lib/constants"
import { getSectorScoreBonus, type SectorTrendData } from "@/lib/sector-trend"

// 設定
export const SCORING_CONFIG = {
  MAX_PER_SECTOR: 5,       // 各セクターからの最大銘柄数
  MAX_CANDIDATES_FOR_AI: 15, // AIに渡す最大銘柄数
  MAX_VOLATILITY: 50,      // ボラティリティ上限（%）
}

// 赤字 AND 高ボラティリティ銘柄へのスコアペナルティ（リスク許容度別）
export const RISK_PENALTY: Record<string, number> = {
  high: -10,
  medium: -20,
  low: -30,
}

// 投資スタイル別のスコア配分（period × risk）
type ScoreWeights = {
  weekChangeRate: number
  volumeRatio: number
  volatility: number
  marketCap: number
}

export const SCORE_WEIGHTS: Record<string, ScoreWeights> = {
  // 短期
  "short_high": { weekChangeRate: 40, volumeRatio: 30, volatility: 20, marketCap: 10 },
  "short_medium": { weekChangeRate: 35, volumeRatio: 25, volatility: 15, marketCap: 25 },
  "short_low": { weekChangeRate: 25, volumeRatio: 20, volatility: 15, marketCap: 40 },
  // 中期
  "medium_high": { weekChangeRate: 30, volumeRatio: 25, volatility: 20, marketCap: 25 },
  "medium_medium": { weekChangeRate: 25, volumeRatio: 25, volatility: 25, marketCap: 25 },
  "medium_low": { weekChangeRate: 15, volumeRatio: 15, volatility: 30, marketCap: 40 },
  // 長期
  "long_high": { weekChangeRate: 20, volumeRatio: 20, volatility: 25, marketCap: 35 },
  "long_medium": { weekChangeRate: 15, volumeRatio: 15, volatility: 30, marketCap: 40 },
  "long_low": { weekChangeRate: 10, volumeRatio: 10, volatility: 35, marketCap: 45 },
}

// 時間帯別のプロンプト設定
export const SESSION_PROMPTS: Record<string, { intro: string; focus: string }> = {
  morning: {
    intro: "前日の動きを踏まえた今日のおすすめです。",
    focus: "今日注目したい銘柄",
  },
  afternoon: {
    intro: "前場の動きを踏まえたおすすめです。",
    focus: "後場に注目したい銘柄",
  },
  evening: {
    intro: "本日の取引を踏まえた明日へのおすすめです。",
    focus: "明日以降に注目したい銘柄",
  },
}

export const PERIOD_LABELS: Record<string, string> = {
  short: "短期（1年以内）",
  medium: "中期（1〜3年）",
  long: "長期（3年以上）",
}

export const RISK_LABELS: Record<string, string> = {
  low: "低い（安定重視）",
  medium: "普通（バランス）",
  high: "高い（成長重視）",
}

export interface StockForScoring {
  id: string
  tickerCode: string
  name: string
  sector: string | null
  latestPrice: number | null
  weekChangeRate: number | null
  volatility: number | null
  volumeRatio: number | null
  marketCap: number | null
  isProfitable: boolean | null
  maDeviationRate: number | null
}

export interface ScoredStock extends StockForScoring {
  score: number
  scoreBreakdown: Record<string, number>
}

/**
 * 指標を0-100に正規化する
 */
function normalizeValues(
  stocks: StockForScoring[],
  key: keyof StockForScoring,
  reverse: boolean = false
): Map<string, number> {
  const values: Array<{ id: string; value: number }> = []

  for (const stock of stocks) {
    const val = stock[key]
    if (typeof val === "number" && val !== null) {
      values.push({ id: stock.id, value: val })
    }
  }

  if (values.length === 0) return new Map()

  const vals = values.map(v => v.value)
  const minVal = Math.min(...vals)
  const maxVal = Math.max(...vals)

  if (maxVal === minVal) {
    return new Map(values.map(v => [v.id, 50]))
  }

  const result = new Map<string, number>()
  for (const { id, value } of values) {
    let score = ((value - minVal) / (maxVal - minVal)) * 100
    if (reverse) score = 100 - score
    result.set(id, score)
  }

  return result
}

/**
 * 投資スタイルに基づいてスコアを計算
 */
export function calculateStockScores(
  stocks: StockForScoring[],
  period: string | null,
  risk: string | null,
  sectorTrends?: Record<string, SectorTrendData>
): ScoredStock[] {
  const key = `${period || "medium"}_${risk || "medium"}`
  const weights = SCORE_WEIGHTS[key] || SCORE_WEIGHTS["medium_medium"]

  // 低リスク志向の場合はvolatilityを反転（低い方が良い）
  const isLowRisk = risk === "low" || (risk === "medium" && period === "long")

  const normalized = {
    weekChangeRate: normalizeValues(stocks, "weekChangeRate"),
    volumeRatio: normalizeValues(stocks, "volumeRatio"),
    volatility: normalizeValues(stocks, "volatility", isLowRisk),
    marketCap: normalizeValues(stocks, "marketCap"),
  }

  const penalty = RISK_PENALTY[risk || "medium"] || -20
  const scoredStocks: ScoredStock[] = []

  for (const stock of stocks) {
    // 異常な急騰（週間+50%超）は除外
    if (stock.weekChangeRate !== null && stock.weekChangeRate > 50) {
      continue
    }

    let totalScore = 0
    const scoreBreakdown: Record<string, number> = {}

    // 各指標のスコアを計算
    for (const [weightKey, weight] of Object.entries(weights)) {
      const normalizedMap = normalized[weightKey as keyof typeof normalized]
      const val = normalizedMap.get(stock.id)
      const componentScore = (val !== undefined ? val : 50) * (weight / 100)
      totalScore += componentScore
      scoreBreakdown[weightKey] = Math.round(componentScore * 10) / 10
    }

    // 赤字 AND 高ボラティリティの場合はペナルティ
    const isHighRiskStock = (
      stock.isProfitable === false &&
      stock.volatility !== null &&
      stock.volatility > SCORING_CONFIG.MAX_VOLATILITY
    )
    if (isHighRiskStock && penalty !== 0) {
      totalScore += penalty
      scoreBreakdown["riskPenalty"] = penalty
    }

    // 急騰銘柄へのペナルティ
    if (stock.weekChangeRate !== null) {
      if (stock.weekChangeRate >= 30) {
        totalScore -= 20
        scoreBreakdown["surgePenalty"] = -20
      } else if (stock.weekChangeRate >= 20) {
        totalScore -= 10
        scoreBreakdown["surgePenalty"] = -10
      }
    }

    // 業績不明の銘柄へのペナルティ
    if (stock.isProfitable === null) {
      totalScore -= 5
      scoreBreakdown["unknownEarningsPenalty"] = -5
    }

    // 移動平均乖離率によるペナルティ/ボーナス
    if (stock.maDeviationRate !== null) {
      if (stock.maDeviationRate >= MA_DEVIATION.UPPER_THRESHOLD) {
        totalScore += MA_DEVIATION.SCORE_PENALTY
        scoreBreakdown["maDeviationPenalty"] = MA_DEVIATION.SCORE_PENALTY
      } else if (
        stock.maDeviationRate <= MA_DEVIATION.LOWER_THRESHOLD &&
        stock.isProfitable === true &&
        stock.volatility !== null &&
        stock.volatility <= MA_DEVIATION.LOW_VOLATILITY_THRESHOLD
      ) {
        totalScore += MA_DEVIATION.SCORE_BONUS
        scoreBreakdown["maDeviationBonus"] = MA_DEVIATION.SCORE_BONUS
      }
    }

    // セクタートレンドによるボーナス/ペナルティ
    if (sectorTrends && stock.sector && sectorTrends[stock.sector]) {
      const bonus = getSectorScoreBonus(sectorTrends[stock.sector])
      if (bonus !== 0) {
        totalScore += bonus
        scoreBreakdown["sectorTrendBonus"] = bonus
      }
    }

    scoredStocks.push({
      ...stock,
      score: Math.round(totalScore * 100) / 100,
      scoreBreakdown,
    })
  }

  // スコア順にソート
  scoredStocks.sort((a, b) => b.score - a.score)
  return scoredStocks
}

/**
 * セクター分散を適用（各セクターから最大N銘柄）
 */
export function applySectorDiversification(stocks: ScoredStock[]): ScoredStock[] {
  const sectorCounts: Record<string, number> = {}
  const diversified: ScoredStock[] = []

  for (const stock of stocks) {
    const sector = stock.sector || "その他"
    const count = sectorCounts[sector] || 0

    if (count < SCORING_CONFIG.MAX_PER_SECTOR) {
      diversified.push(stock)
      sectorCounts[sector] = count + 1
    }
  }

  return diversified
}

/**
 * 予算でフィルタ（100株購入を前提）
 */
export function filterByBudget(
  stocks: StockForScoring[],
  budget: number | null
): StockForScoring[] {
  if (!budget) return stocks
  return stocks.filter(s =>
    s.latestPrice !== null && s.latestPrice * 100 <= budget
  )
}
