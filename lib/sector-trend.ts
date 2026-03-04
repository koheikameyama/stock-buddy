/**
 * セクタートレンド取得・フォーマットユーティリティ
 */

import { prisma } from "@/lib/prisma"
import { getTodayForDB } from "@/lib/date-utils"
import { SECTOR_TREND } from "@/lib/constants"

export interface SectorTrendData {
  sector: string
  score3d: number
  score7d: number
  newsCount3d: number
  newsCount7d: number
  positive3d: number
  negative3d: number
  neutral3d: number
  positive7d: number
  negative7d: number
  neutral7d: number
  usNewsCount3d: number
  usNewsCount7d: number
  avgWeekChangeRate: number | null
  avgDailyChangeRate: number | null
  avgMaDeviationRate: number | null
  avgVolumeRatio: number | null
  avgVolatility: number | null
  stockCount: number
  compositeScore: number | null
  trendDirection: string
  avgPER: number | null
  avgPBR: number | null
  avgROE: number | null
}

/**
 * 特定セクターのトレンドを取得
 */
export async function getSectorTrend(sector: string): Promise<SectorTrendData | null> {
  const today = getTodayForDB()
  const trend = await prisma.sectorTrend.findUnique({
    where: { date_sector: { date: today, sector } },
  })
  return trend
}

/**
 * 全セクターのトレンドを取得（ダッシュボード用）
 * 最新の日付のデータを返す
 */
export async function getAllSectorTrends(): Promise<{ date: Date | null; trends: SectorTrendData[] }> {
  const latest = await prisma.sectorTrend.findFirst({
    orderBy: { date: "desc" },
    select: { date: true },
  })
  if (!latest) return { date: null, trends: [] }

  const trends = await prisma.sectorTrend.findMany({
    where: { date: latest.date },
    orderBy: { compositeScore: "desc" },
  })
  return { date: latest.date, trends }
}

/**
 * トレンド方向の矢印を取得
 */
function getTrendArrow(direction: string): string {
  if (direction === "up") return "▲"
  if (direction === "down") return "▼"
  return "▶"
}

/**
 * トレンド強度のラベルを取得
 */
function getTrendLabel(score: number | null): string {
  if (score === null) return "データ不足"
  if (score >= SECTOR_TREND.STRONG_UP_THRESHOLD) return "強い追い風"
  if (score >= SECTOR_TREND.UP_THRESHOLD) return "追い風"
  if (score <= SECTOR_TREND.STRONG_DOWN_THRESHOLD) return "強い逆風"
  if (score <= SECTOR_TREND.DOWN_THRESHOLD) return "逆風"
  return "中立"
}

/**
 * 特定セクターのトレンドをAIプロンプト用テキストに変換
 */
export function formatSectorTrendForPrompt(trend: SectorTrendData): string {
  const arrow = getTrendArrow(trend.trendDirection)
  const score = trend.compositeScore ?? trend.score3d
  const label = getTrendLabel(trend.compositeScore)
  const usNote = trend.usNewsCount3d > 0
    ? ` / 米国関連ニュース${trend.usNewsCount3d}件`
    : ""
  const priceNote = trend.avgWeekChangeRate !== null
    ? ` / セクター平均週間${trend.avgWeekChangeRate >= 0 ? "+" : ""}${trend.avgWeekChangeRate.toFixed(1)}%`
    : ""
  const volumeNote = trend.avgVolumeRatio !== null
    ? `、出来高${trend.avgVolumeRatio.toFixed(1)}倍`
    : ""

  const fundamentalParts = [
    trend.avgPER !== null ? `PER${trend.avgPER.toFixed(1)}倍` : null,
    trend.avgPBR !== null ? `PBR${trend.avgPBR.toFixed(1)}倍` : null,
    trend.avgROE !== null ? `ROE${(trend.avgROE * 100).toFixed(1)}%` : null,
  ].filter(Boolean)
  const fundamentalNote = fundamentalParts.length > 0 ? `\n  ファンダメンタル平均: ${fundamentalParts.join("、")}` : ""

  return `【${trend.sector}】${arrow} ${label}（総合スコア${score >= 0 ? "+" : ""}${score.toFixed(0)}）
  ニュース: ポジティブ${trend.positive3d}件/${trend.newsCount3d}件（スコア${trend.score3d >= 0 ? "+" : ""}${trend.score3d.toFixed(0)}）${usNote}
  株価: ${priceNote ? priceNote.replace(" / ", "") : "データなし"}${volumeNote}${fundamentalNote}`
}

/**
 * 全セクタートレンドをAIプロンプト用テキストに変換（おすすめ生成用）
 * compositeScore降順で順位付きで出力する
 */
export function formatAllSectorTrendsForPrompt(trends: SectorTrendData[]): string {
  if (trends.length === 0) return ""

  // compositeScore降順でソート済みの想定だが、念のためソート
  const sorted = [...trends].sort((a, b) =>
    (b.compositeScore ?? b.score3d) - (a.compositeScore ?? a.score3d))

  const lines = sorted.map((trend, index) =>
    `${index + 1}位: ${formatSectorTrendForPrompt(trend)}`)
  return `
## 市場セクター動向（強い順）
以下は直近のセクター別トレンド（ニュース + 株価統合）を強い順にランキングしたものです。上位セクターの銘柄を優先的に検討してください。
${lines.join("\n")}
`
}

/**
 * おすすめスコアリング用のセクター連続ボーナスを計算
 * compositeScore に比例した連続値を返す（デッドゾーンなし）
 */
export function getSectorScoreBonus(trend: SectorTrendData | null): number {
  if (!trend) return 0
  const score = trend.compositeScore ?? trend.score3d
  const clamped = Math.max(-SECTOR_TREND.SCORE_CONTINUOUS_CLAMP,
    Math.min(SECTOR_TREND.SCORE_CONTINUOUS_CLAMP, score))
  return Math.round(clamped * SECTOR_TREND.SCORE_CONTINUOUS_FACTOR * 10) / 10
}

/**
 * 全セクターの順位ボーナスを計算
 * compositeScore 降順で並べ、上位に加点・下位に減点
 */
export function computeSectorRankBonuses(
  sectorTrends: Record<string, SectorTrendData>,
): Record<string, number> {
  const entries = Object.entries(sectorTrends)
    .map(([sector, trend]) => ({
      sector,
      score: trend.compositeScore ?? trend.score3d,
    }))
    .sort((a, b) => b.score - a.score)

  const bonuses = SECTOR_TREND.RANK_BONUSES
  const result: Record<string, number> = {}

  for (let i = 0; i < entries.length; i++) {
    result[entries[i].sector] = i < bonuses.length ? bonuses[i] : 0
  }

  return result
}
