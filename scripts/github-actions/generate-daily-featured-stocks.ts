#!/usr/bin/env npx tsx
/**
 * DailyFeaturedStock自動生成スクリプト
 *
 * 株価変動率、取引高、初心者スコアから機械的に銘柄を3カテゴリに分類：
 * - surge（短期急騰）: 7日間上昇率+5%以上
 * - stable（中長期安定）: 初心者スコア70点以上 & ボラティリティ15%以下
 * - trending（話題）: 取引高が過去30日平均の1.5倍以上
 *
 * 毎日朝7時（JST）に実行され、各カテゴリTop 3を選出（合計9銘柄）
 */

import { PrismaClient } from "@prisma/client"
import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import { fetchHistoricalPrices } from "../../lib/stock-price-fetcher"

dayjs.extend(utc)

const prisma = new PrismaClient()

interface PriceData {
  date: string
  close: number
  volume: number
}

interface StockWithPrices {
  id: string
  tickerCode: string
  name: string
  beginnerScore: number
  prices: PriceData[]
}

interface FeaturedStock {
  stockId: string
  category: "surge" | "stable" | "trending"
  categoryPosition: number
  reason: string
  score: number
}

async function getStocksWithPrices(): Promise<StockWithPrices[]> {
  // 銘柄マスタを取得
  const stocks = await prisma.stock.findMany({
    where: { beginnerScore: { not: null } },
    orderBy: { beginnerScore: "desc" },
    select: {
      id: true,
      tickerCode: true,
      name: true,
      beginnerScore: true,
    },
  })
  console.log(`Found ${stocks.length} stocks in master`)

  if (stocks.length === 0) return []

  // Stooq APIで株価を取得
  console.log(`Fetching prices for ${stocks.length} stocks from Stooq API...`)

  const stocksWithPrices: StockWithPrices[] = []

  // バッチ処理
  const batchSize = 50
  for (let i = 0; i < stocks.length; i += batchSize) {
    const batchStocks = stocks.slice(i, i + batchSize)

    const results = await Promise.allSettled(
      batchStocks.map(async (stock) => {
        try {
          // 1ヶ月分のデータを取得
          const historicalData = await fetchHistoricalPrices(stock.tickerCode, "1m")

          if (!historicalData || historicalData.length < 7) return null

          // 新しい順にソート
          const prices: PriceData[] = historicalData
            .filter((d) => d.close && d.volume)
            .map((d) => ({
              date: d.date,
              close: d.close,
              volume: d.volume,
            }))
            .sort((a, b) => b.date.localeCompare(a.date))

          if (prices.length < 7) return null

          return {
            id: stock.id,
            tickerCode: stock.tickerCode,
            name: stock.name,
            beginnerScore: stock.beginnerScore!,
            prices,
          }
        } catch {
          return null
        }
      })
    )

    for (const result of results) {
      if (result.status === "fulfilled" && result.value) {
        stocksWithPrices.push(result.value)
      }
    }
  }

  console.log(`Found ${stocksWithPrices.length} stocks with sufficient price data`)
  return stocksWithPrices
}

function calculateSurgeStocks(stocks: StockWithPrices[]): FeaturedStock[] {
  /**
   * surge（短期急騰）銘柄を抽出
   *
   * 条件:
   * - 7日間の株価上昇率: +5%以上
   * - 初心者スコア: 50点以上
   */
  const surgeCandidates: { stock: StockWithPrices; changeRate: number; latestPrice: number }[] = []

  for (const stock of stocks) {
    if (stock.beginnerScore < 50) continue

    const prices = stock.prices
    if (prices.length < 7) continue

    // 7日間の上昇率を計算
    const latestPrice = prices[0].close
    const weekAgoPrice = prices[6].close

    if (weekAgoPrice === 0) continue

    const changeRate = ((latestPrice - weekAgoPrice) / weekAgoPrice) * 100

    if (changeRate >= 5.0) {
      surgeCandidates.push({
        stock,
        changeRate,
        latestPrice,
      })
    }
  }

  // 上昇率が高い順にソート
  surgeCandidates.sort((a, b) => b.changeRate - a.changeRate)

  // Top 3を選出
  const topSurge = surgeCandidates.slice(0, 3)

  const results: FeaturedStock[] = topSurge.map((candidate, idx) => {
    const score = candidate.stock.beginnerScore
    const reason = `この1週間で株価が${candidate.changeRate.toFixed(1)}%上昇しています。初心者でも安心して投資できる銘柄です（スコア${score}点）`

    return {
      stockId: candidate.stock.id,
      category: "surge",
      categoryPosition: idx + 1,
      reason,
      score,
    }
  })

  console.log(`Surge: ${results.length} stocks selected`)
  return results
}

function calculateStableStocks(stocks: StockWithPrices[]): FeaturedStock[] {
  /**
   * stable（中長期安定）銘柄を抽出
   *
   * 条件:
   * - 初心者スコア: 70点以上
   * - 30日間のボラティリティ: 15%以下
   */
  const stableCandidates: { stock: StockWithPrices; volatility: number }[] = []

  for (const stock of stocks) {
    if (stock.beginnerScore < 70) continue

    const prices = stock.prices
    if (prices.length < 30) continue

    // ボラティリティを計算（標準偏差 / 平均）
    const closePrices = prices.map((p) => p.close)
    const avgPrice = closePrices.reduce((a, b) => a + b, 0) / closePrices.length
    const squareDiffs = closePrices.map((p) => Math.pow(p - avgPrice, 2))
    const stdDev = Math.sqrt(squareDiffs.reduce((a, b) => a + b, 0) / closePrices.length)

    if (avgPrice === 0) continue

    const volatility = (stdDev / avgPrice) * 100

    if (volatility <= 15.0) {
      stableCandidates.push({
        stock,
        volatility,
      })
    }
  }

  // 初心者スコアが高い順にソート
  stableCandidates.sort((a, b) => b.stock.beginnerScore - a.stock.beginnerScore)

  // Top 3を選出
  const topStable = stableCandidates.slice(0, 3)

  const results: FeaturedStock[] = topStable.map((candidate, idx) => {
    const score = candidate.stock.beginnerScore
    const reason = `安定した値動きで、初心者に最適な銘柄です（スコア${score}点、変動率${candidate.volatility.toFixed(1)}%）`

    return {
      stockId: candidate.stock.id,
      category: "stable",
      categoryPosition: idx + 1,
      reason,
      score,
    }
  })

  console.log(`Stable: ${results.length} stocks selected`)
  return results
}

function calculateTrendingStocks(stocks: StockWithPrices[]): FeaturedStock[] {
  /**
   * trending（話題）銘柄を抽出
   *
   * 条件:
   * - 7日間の平均取引高 > 過去30日間の平均取引高 × 1.5倍
   * - 初心者スコア: 40点以上
   */
  const trendingCandidates: { stock: StockWithPrices; volumeRatio: number }[] = []

  for (const stock of stocks) {
    if (stock.beginnerScore < 40) continue

    const prices = stock.prices
    if (prices.length < 30) continue

    // 直近7日の平均取引高
    const recentVolumes = prices.slice(0, 7).map((p) => p.volume).filter((v) => v > 0)
    if (recentVolumes.length === 0) continue
    const recentAvgVolume = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length

    // 過去30日の平均取引高
    const allVolumes = prices.map((p) => p.volume).filter((v) => v > 0)
    if (allVolumes.length === 0) continue
    const totalAvgVolume = allVolumes.reduce((a, b) => a + b, 0) / allVolumes.length

    if (totalAvgVolume === 0) continue

    // 取引高増加率
    const volumeRatio = recentAvgVolume / totalAvgVolume

    if (volumeRatio >= 1.5) {
      trendingCandidates.push({
        stock,
        volumeRatio,
      })
    }
  }

  // 取引高増加率が高い順にソート
  trendingCandidates.sort((a, b) => b.volumeRatio - a.volumeRatio)

  // Top 3を選出
  const topTrending = trendingCandidates.slice(0, 3)

  const results: FeaturedStock[] = topTrending.map((candidate, idx) => {
    const score = candidate.stock.beginnerScore
    const reason = `最近取引が活発になっている注目銘柄です（取引高${candidate.volumeRatio.toFixed(1)}倍、スコア${score}点）`

    return {
      stockId: candidate.stock.id,
      category: "trending",
      categoryPosition: idx + 1,
      reason,
      score,
    }
  })

  console.log(`Trending: ${results.length} stocks selected`)
  return results
}

async function saveDailyFeaturedStocks(featuredStocks: FeaturedStock[]): Promise<void> {
  if (featuredStocks.length === 0) {
    console.log("No stocks to save")
    return
  }

  const today = dayjs.utc().startOf("day").toDate()

  // 既存データを削除（今日の日付）
  const deleted = await prisma.dailyFeaturedStock.deleteMany({
    where: { date: today },
  })
  console.log(`Deleted ${deleted.count} existing records for ${today.toISOString().split("T")[0]}`)

  // 新しいデータを挿入（positionは全体通し番号1-9）
  for (let idx = 0; idx < featuredStocks.length; idx++) {
    const fs = featuredStocks[idx]
    await prisma.dailyFeaturedStock.create({
      data: {
        date: today,
        stockId: fs.stockId,
        category: fs.category,
        position: idx + 1, // 全体通し番号
        reason: fs.reason,
        score: fs.score,
      },
    })
  }

  console.log(`Saved ${featuredStocks.length} featured stocks for ${today.toISOString().split("T")[0]}`)
}

async function main(): Promise<void> {
  console.log("=".repeat(60))
  console.log("DailyFeaturedStock Generation")
  console.log("=".repeat(60))
  console.log(`Time: ${new Date().toISOString()}`)

  try {
    // 銘柄と株価データを取得
    console.log("\nFetching stocks and price data...")
    const stocks = await getStocksWithPrices()

    if (stocks.length === 0) {
      console.log("No stocks with sufficient price data. Exiting.")
      return
    }

    // 各カテゴリの銘柄を抽出
    console.log("\nCalculating featured stocks...")

    const surgeStocks = calculateSurgeStocks(stocks)
    const stableStocks = calculateStableStocks(stocks)
    const trendingStocks = calculateTrendingStocks(stocks)

    // 結果を結合
    const allFeatured = [...surgeStocks, ...stableStocks, ...trendingStocks]

    if (allFeatured.length === 0) {
      console.log("No stocks matched criteria today")
      return
    }

    // データベースに保存
    console.log("\nSaving to database...")
    await saveDailyFeaturedStocks(allFeatured)

    // サマリー表示
    console.log("\n" + "=".repeat(60))
    console.log("DailyFeaturedStock generation completed")
    console.log("=".repeat(60))
    console.log(`Total featured stocks: ${allFeatured.length}`)
    console.log(`  - Surge: ${surgeStocks.length}`)
    console.log(`  - Stable: ${stableStocks.length}`)
    console.log(`  - Trending: ${trendingStocks.length}`)
    console.log("=".repeat(60))
  } catch (error) {
    console.error(`Error: ${error}`)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()

export {}
