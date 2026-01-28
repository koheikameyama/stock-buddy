#!/usr/bin/env tsx
/**
 * 銘柄スコア計算スクリプト
 *
 * 客観的指標に基づいて各銘柄の各種スコア（0-100）を計算:
 * - beginnerScore: 初心者おすすめ度（安定性・知名度・分かりやすさ）
 * - growthScore: 成長性スコア（値上がり期待）
 * - dividendScore: 高配当スコア（インカムゲイン重視）
 * - stabilityScore: 安定性スコア（低リスク・低変動）
 * - liquidityScore: 流動性スコア（売買のしやすさ）
 *
 * 使い方:
 * npm run calculate-scores
 */

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

// 初心者に分かりやすいセクター
const EASY_TO_UNDERSTAND_SECTORS = [
  "小売業",
  "食料品",
  "情報・通信業",
  "陸運業",
  "電気・ガス業",
  "銀行業",
  "輸送用機器",
]

// 株価データの統計情報
interface PriceStats {
  volatility: number // 変動率（%）
  avgVolume: number // 平均出来高
  priceChange90d: number // 過去90日の価格変化率（%）
  priceChange365d: number // 過去1年の価格変化率（%）
}

/**
 * 株価データから統計情報を計算
 */
async function calculatePriceStats(stockId: string): Promise<PriceStats> {
  const prices = await prisma.stockPrice.findMany({
    where: { stockId },
    orderBy: { date: "desc" },
    take: 365,
  })

  if (prices.length < 30) {
    return { volatility: 0, avgVolume: 0, priceChange90d: 0, priceChange365d: 0 }
  }

  const closes = prices.map((p) => Number(p.close))
  const volumes = prices.map((p) => Number(p.volume))

  // 変動率（標準偏差）
  const avg = closes.reduce((a, b) => a + b, 0) / closes.length
  const variance =
    closes.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / closes.length
  const stdDev = Math.sqrt(variance)
  const volatility = (stdDev / avg) * 100

  // 平均出来高
  const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length

  // 価格変化率
  const priceChange90d =
    prices.length >= 90 ? ((closes[0] - closes[89]) / closes[89]) * 100 : 0
  const priceChange365d =
    prices.length >= 365 ? ((closes[0] - closes[364]) / closes[364]) * 100 : 0

  return { volatility, avgVolume, priceChange90d, priceChange365d }
}

/**
 * 1. 初心者おすすめスコア（0-100）
 * 重視: 時価総額（大）、低変動率、分かりやすい業種、適度な流動性
 */
function calculateBeginnerScore(
  sector: string | null,
  marketCap: number | null,
  stats: PriceStats
): number {
  let score = 0

  // 時価総額（0-40点）
  if (marketCap) {
    if (marketCap >= 100000) score += 40 // 10兆円以上
    else if (marketCap >= 50000) score += 35 // 5兆円以上
    else if (marketCap >= 10000) score += 30 // 1兆円以上
    else if (marketCap >= 5000) score += 20 // 5000億円以上
    else if (marketCap >= 1000) score += 10 // 1000億円以上
  }

  // 低変動率（0-30点）
  if (stats.volatility < 10) score += 30
  else if (stats.volatility < 15) score += 25
  else if (stats.volatility < 20) score += 20
  else if (stats.volatility < 30) score += 10

  // 業種の分かりやすさ（0-20点）
  if (sector && EASY_TO_UNDERSTAND_SECTORS.includes(sector)) score += 20

  // 流動性（0-10点）
  if (stats.avgVolume >= 1000000) score += 10
  else if (stats.avgVolume >= 100000) score += 7

  return Math.min(score, 100)
}

/**
 * 2. 成長性スコア（0-100）
 * 重視: 価格上昇率（高）、業種、やや高い変動率（成長余地）
 */
function calculateGrowthScore(
  sector: string | null,
  stats: PriceStats
): number {
  let score = 0

  // 過去1年の価格上昇率（0-50点）
  if (stats.priceChange365d >= 50) score += 50
  else if (stats.priceChange365d >= 30) score += 40
  else if (stats.priceChange365d >= 20) score += 30
  else if (stats.priceChange365d >= 10) score += 20
  else if (stats.priceChange365d >= 0) score += 10

  // 過去90日の価格上昇率（0-30点）
  if (stats.priceChange90d >= 20) score += 30
  else if (stats.priceChange90d >= 10) score += 20
  else if (stats.priceChange90d >= 5) score += 10

  // 成長セクター（0-20点）
  const growthSectors = ["情報・通信業", "電気機器", "医薬品", "サービス業"]
  if (sector && growthSectors.includes(sector)) score += 20

  return Math.min(score, 100)
}

/**
 * 3. 高配当スコア（0-100）
 * 重視: 配当利回り（高）、安定性
 */
function calculateDividendScore(
  dividendYield: number | null,
  stats: PriceStats
): number {
  let score = 0

  // 配当利回り（0-70点）
  if (dividendYield) {
    if (dividendYield >= 5) score += 70
    else if (dividendYield >= 4) score += 60
    else if (dividendYield >= 3) score += 50
    else if (dividendYield >= 2) score += 30
    else if (dividendYield >= 1) score += 15
  }

  // 安定性（配当を継続できる）（0-30点）
  if (stats.volatility < 15) score += 30
  else if (stats.volatility < 25) score += 20
  else if (stats.volatility < 35) score += 10

  return Math.min(score, 100)
}

/**
 * 4. 安定性スコア（0-100）
 * 重視: 低変動率、時価総額（大）、ネガティブな価格変動がない
 */
function calculateStabilityScore(
  marketCap: number | null,
  stats: PriceStats
): number {
  let score = 0

  // 低変動率（0-50点）
  if (stats.volatility < 10) score += 50
  else if (stats.volatility < 15) score += 40
  else if (stats.volatility < 20) score += 30
  else if (stats.volatility < 30) score += 15

  // 時価総額（0-30点）
  if (marketCap) {
    if (marketCap >= 50000) score += 30
    else if (marketCap >= 10000) score += 25
    else if (marketCap >= 5000) score += 15
  }

  // 価格下落が少ない（0-20点）
  if (stats.priceChange90d >= -5) score += 20
  else if (stats.priceChange90d >= -10) score += 10

  return Math.min(score, 100)
}

/**
 * 5. 流動性スコア（0-100）
 * 重視: 出来高（大）、変動率（適度）
 */
function calculateLiquidityScore(stats: PriceStats): number {
  let score = 0

  // 平均出来高（0-80点）
  if (stats.avgVolume >= 10000000) score += 80 // 1000万株以上
  else if (stats.avgVolume >= 5000000) score += 70 // 500万株以上
  else if (stats.avgVolume >= 1000000) score += 60 // 100万株以上
  else if (stats.avgVolume >= 500000) score += 40 // 50万株以上
  else if (stats.avgVolume >= 100000) score += 20 // 10万株以上

  // 適度な変動率（スプレッドが大きすぎない）（0-20点）
  if (stats.volatility < 40) score += 20
  else if (stats.volatility < 60) score += 10

  return Math.min(score, 100)
}

/**
 * メイン処理
 *
 * 時価総額と配当利回りはinit_data.pyで既にDBに保存済み。
 * このスクリプトは株価データから統計情報を計算し、各種スコアを算出する。
 */
async function main() {
  console.log("🚀 銘柄スコア計算を開始します\n")

  const stocks = await prisma.stock.findMany({
    select: {
      id: true,
      tickerCode: true,
      name: true,
      sector: true,
      marketCap: true,
      dividendYield: true,
    },
  })

  console.log(`📊 対象銘柄: ${stocks.length}件\n`)

  let updatedCount = 0
  let errorCount = 0

  for (const stock of stocks) {
    try {
      console.log(`処理中: ${stock.tickerCode} - ${stock.name}`)

      // 株価統計情報を計算
      const stats = await calculatePriceStats(stock.id)

      // 時価総額と配当利回りをDBから取得
      const marketCap = stock.marketCap ? Number(stock.marketCap) : null
      const dividendYield = stock.dividendYield ? Number(stock.dividendYield) : null

      // 各スコアを計算
      const beginnerScore = calculateBeginnerScore(stock.sector, marketCap, stats)
      const growthScore = calculateGrowthScore(stock.sector, stats)
      const dividendScore = calculateDividendScore(dividendYield, stats)
      const stabilityScore = calculateStabilityScore(marketCap, stats)
      const liquidityScore = calculateLiquidityScore(stats)

      // データベース更新（スコアのみ）
      await prisma.stock.update({
        where: { id: stock.id },
        data: {
          beginnerScore,
          growthScore,
          dividendScore,
          stabilityScore,
          liquidityScore,
        },
      })

      console.log(`  ✓ スコア: 初心者${beginnerScore} 成長${growthScore} 配当${dividendScore} 安定${stabilityScore} 流動${liquidityScore}\n`)
      updatedCount++

      // API Rate Limit対策: 少し待機
      await new Promise((resolve) => setTimeout(resolve, 50))
    } catch (error) {
      console.error(`  ✗ エラー: ${stock.tickerCode}`, error)
      errorCount++
    }
  }

  console.log(`\n✅ 処理完了`)
  console.log(`  成功: ${updatedCount}件`)
  console.log(`  失敗: ${errorCount}件`)
}

// 実行
main()
  .catch((error) => {
    console.error("❌ エラーが発生しました:", error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
