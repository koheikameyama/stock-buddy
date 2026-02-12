#!/usr/bin/env npx tsx
/**
 * 銘柄動向予測生成スクリプト
 *
 * ルールベース分析 + AI予測のハイブリッド方式で、
 * 各銘柄の短期・中期・長期の見通しとアドバイスを生成します。
 */

import { PrismaClient } from "@prisma/client"
import YahooFinance from "yahoo-finance2"
import OpenAI from "openai"
import { getRelatedNews, formatNewsForPrompt } from "../lib/news-fetcher"

const prisma = new PrismaClient()
const yahooFinance = new YahooFinance()
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

interface BaselineData {
  currentPrice: number
  weeklyTrend: "up" | "neutral" | "down"
  monthlyTrend: "up" | "neutral" | "down"
  quarterlyTrend: "up" | "neutral" | "down"
  volatility: number
  candlestickPattern: { description: string; signal: string; strength: number } | null
  recentPatterns: { buySignals: number; sellSignals: number } | null
}

interface PriceHistory {
  open: number
  high: number
  low: number
  close: number
  date: string
}

function calculateTrend(current: number, past: number | null): "up" | "neutral" | "down" {
  if (!past) return "neutral"

  const change = ((current - past) / past) * 100

  if (change > 2) return "up"
  if (change < -2) return "down"
  return "neutral"
}

function calculateVolatility(prices: number[]): number {
  if (prices.length < 2) return 0

  const mean = prices.reduce((a, b) => a + b, 0) / prices.length
  const squareDiffs = prices.map((p) => Math.pow(p - mean, 2))
  const variance = squareDiffs.reduce((a, b) => a + b, 0) / prices.length
  return Math.sqrt(variance)
}

function analyzeCandlestick(candle: PriceHistory): { description: string; signal: string; strength: number } {
  const openPrice = candle.open
  const high = candle.high
  const low = candle.low
  const close = candle.close

  const body = Math.abs(close - openPrice)
  const rangeVal = high - low

  if (rangeVal < 0.01) {
    return { description: "様子見", signal: "neutral", strength: 30 }
  }

  const bodyRatio = rangeVal > 0 ? body / rangeVal : 0
  const isLargeBody = bodyRatio >= 0.6
  const isSmallBody = bodyRatio <= 0.2

  const upperWick = high - Math.max(openPrice, close)
  const lowerWick = Math.min(openPrice, close) - low
  const hasLongUpper = rangeVal > 0 ? upperWick / rangeVal >= 0.3 : false
  const hasLongLower = rangeVal > 0 ? lowerWick / rangeVal >= 0.3 : false

  const isUp = close >= openPrice

  if (isUp) {
    if (isLargeBody && !hasLongUpper && !hasLongLower) {
      return { description: "強い上昇", signal: "buy", strength: 80 }
    }
    if (hasLongLower && !hasLongUpper) {
      return { description: "底打ち反発", signal: "buy", strength: 75 }
    }
    if (hasLongUpper && !hasLongLower) {
      return { description: "押し目", signal: "buy", strength: 60 }
    }
    if (isSmallBody) {
      return { description: "じわじわ上昇", signal: "buy", strength: 50 }
    }
    return { description: "上昇", signal: "buy", strength: 55 }
  } else {
    if (isLargeBody && !hasLongUpper && !hasLongLower) {
      return { description: "強い下落", signal: "sell", strength: 80 }
    }
    if (hasLongUpper && !hasLongLower) {
      return { description: "戻り売り", signal: "sell", strength: 75 }
    }
    if (hasLongLower && !hasLongUpper) {
      return { description: "高値からの下落", signal: "sell", strength: 65 }
    }
    if (isSmallBody) {
      return { description: "下落の始まり", signal: "sell", strength: 50 }
    }
    return { description: "下落", signal: "sell", strength: 55 }
  }
}

function getRecentPatternSummary(priceHistory: PriceHistory[]): { buySignals: number; sellSignals: number } {
  let buySignals = 0
  let sellSignals = 0

  for (const candle of priceHistory) {
    const p = analyzeCandlestick(candle)
    if (p.strength >= 60) {
      if (p.signal === "buy") buySignals++
      else if (p.signal === "sell") sellSignals++
    }
  }

  return { buySignals, sellSignals }
}

async function getBaselineData(tickerCode: string): Promise<BaselineData | null> {
  try {
    const code = tickerCode.endsWith(".T") ? tickerCode : `${tickerCode}.T`
    const result = await yahooFinance.chart(code, { period1: "3mo" })

    if (!result.quotes || result.quotes.length === 0) {
      return null
    }

    const priceHistory: PriceHistory[] = result.quotes
      .filter((q) => q.open && q.high && q.low && q.close)
      .map((q) => ({
        open: q.open!,
        high: q.high!,
        low: q.low!,
        close: q.close!,
        date: new Date(q.date!).toISOString().split("T")[0],
      }))
      .reverse() // 新しい順

    if (priceHistory.length === 0) {
      return null
    }

    const currentPrice = priceHistory[0].close
    const weekAgo = priceHistory.length > 5 ? priceHistory[5].close : null
    const monthAgo = priceHistory.length > 20 ? priceHistory[20].close : null
    const threeMonthsAgo = priceHistory.length > 60 ? priceHistory[60].close : null

    // トレンド計算
    const weeklyTrend = calculateTrend(currentPrice, weekAgo)
    const monthlyTrend = calculateTrend(currentPrice, monthAgo)
    const quarterlyTrend = calculateTrend(currentPrice, threeMonthsAgo)

    // ボラティリティ計算（直近30日）
    const prices = priceHistory.slice(0, 30).map((p) => p.close)
    const volatility = calculateVolatility(prices)

    // ローソク足パターン分析
    const candlestickPattern = priceHistory.length > 0 ? analyzeCandlestick(priceHistory[0]) : null
    const recentPatterns = priceHistory.length >= 5 ? getRecentPatternSummary(priceHistory.slice(0, 5)) : null

    return {
      currentPrice,
      weeklyTrend,
      monthlyTrend,
      quarterlyTrend,
      volatility,
      candlestickPattern,
      recentPatterns,
    }
  } catch (error) {
    console.log(`Error fetching baseline data for ${tickerCode}: ${error}`)
    return null
  }
}

interface PredictionResult {
  shortTerm: { trend: string; priceLow: number; priceHigh: number }
  midTerm: { trend: string; priceLow: number; priceHigh: number }
  longTerm: { trend: string; priceLow: number; priceHigh: number }
  recommendation: string
  advice: string
  confidence: number
}

async function generateAIPrediction(
  stock: { name: string; tickerCode: string; sector: string | null },
  baseline: BaselineData,
  scores: { growth: number; stability: number; dividend: number },
  relatedNews: Awaited<ReturnType<typeof getRelatedNews>>
): Promise<PredictionResult> {
  const trendLabels: Record<string, string> = { up: "上昇", neutral: "横ばい", down: "下降" }

  let newsContext = ""
  if (relatedNews.length > 0) {
    newsContext = `

【最新のニュース情報】
${formatNewsForPrompt(relatedNews)}
`
  }

  let patternContext = ""
  if (baseline.candlestickPattern) {
    patternContext = `

【ローソク足パターン分析】
- 最新パターン: ${baseline.candlestickPattern.description}
- シグナル: ${baseline.candlestickPattern.signal}
- 強さ: ${baseline.candlestickPattern.strength}%`
    if (baseline.recentPatterns) {
      patternContext += `
- 直近5日の買いシグナル: ${baseline.recentPatterns.buySignals}回
- 直近5日の売りシグナル: ${baseline.recentPatterns.sellSignals}回`
    }
  }

  const prompt = `あなたは株式投資の初心者向けアドバイザーです。
以下の銘柄について、今後の動向予測とアドバイスを生成してください。

【銘柄情報】
名称: ${stock.name}
ティッカー: ${stock.tickerCode}
セクター: ${stock.sector || "不明"}
現在価格: ${baseline.currentPrice.toFixed(2)}円

【過去のトレンド】
- 1週間: ${trendLabels[baseline.weeklyTrend]}
- 1ヶ月: ${trendLabels[baseline.monthlyTrend]}
- 3ヶ月: ${trendLabels[baseline.quarterlyTrend]}

【スコア】
- 成長性: ${scores.growth}/100
- 安定性: ${scores.stability}/100
- 配当性: ${scores.dividend}/100

【ボラティリティ（価格変動幅）】
${baseline.volatility.toFixed(2)}円
${patternContext}${newsContext}
---

以下の形式でJSON形式で回答してください：

{
  "shortTerm": {
    "trend": "up" | "neutral" | "down",
    "priceLow": 数値,
    "priceHigh": 数値
  },
  "midTerm": {
    "trend": "up" | "neutral" | "down",
    "priceLow": 数値,
    "priceHigh": 数値
  },
  "longTerm": {
    "trend": "up" | "neutral" | "down",
    "priceLow": 数値,
    "priceHigh": 数値
  },
  "recommendation": "buy" | "hold" | "sell",
  "advice": "初心者向けのアドバイス（100文字以内、優しい言葉で、ニュース情報があれば参考にする）",
  "confidence": 0.0〜1.0の信頼度
}

注意事項:
- 提供されたニュース情報を参考にしてください
- ニュースにない情報は推測や創作をしないでください
- 価格予測は現在価格とボラティリティを考慮した現実的な範囲にする
- アドバイスは具体的で分かりやすく
- 断定的な表現は避け、「〜が期待できます」「〜の可能性があります」など柔らかい表現を使う
- 投資判断は最終的にユーザー自身が行うことを前提にする`

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0.7,
  })

  const prediction = JSON.parse(response.choices[0].message.content || "{}")
  return prediction as PredictionResult
}

async function main(): Promise<void> {
  console.log("Starting stock predictions generation...")

  if (!process.env.DATABASE_URL) {
    console.error("ERROR: DATABASE_URL not set")
    process.exit(1)
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error("ERROR: OPENAI_API_KEY not set")
    process.exit(1)
  }

  try {
    // ユーザーが保有/ウォッチしている銘柄を取得
    const portfolioStockIds = await prisma.portfolioStock.findMany({
      select: { stockId: true },
    })
    const watchlistStockIds = await prisma.watchlistStock.findMany({
      select: { stockId: true },
    })

    const allStockIds = Array.from(
      new Set([...portfolioStockIds.map((p) => p.stockId), ...watchlistStockIds.map((w) => w.stockId)])
    )

    const stocks = await prisma.stock.findMany({
      where: { id: { in: allStockIds } },
      select: {
        id: true,
        tickerCode: true,
        name: true,
        sector: true,
        growthScore: true,
        stabilityScore: true,
        dividendScore: true,
      },
    })

    const total = stocks.length

    if (total === 0) {
      console.log("No stocks to analyze")
      return
    }

    console.log(`Processing ${total} stocks...`)

    // 関連ニュースを一括取得
    const tickerCodes = stocks.map((s) => s.tickerCode)
    const sectors = Array.from(new Set(stocks.map((s) => s.sector).filter((s): s is string => !!s)))

    console.log(`Fetching related news for ${tickerCodes.length} stocks...`)
    const allNews = await getRelatedNews(prisma, tickerCodes, sectors, 30, 7)
    console.log(`Found ${allNews.length} related news articles`)

    let success = 0
    let failed = 0

    for (let i = 0; i < stocks.length; i++) {
      const stock = stocks[i]

      const scores = {
        growth: stock.growthScore || 50,
        stability: stock.stabilityScore || 50,
        dividend: stock.dividendScore || 50,
      }

      try {
        console.log(`[${i + 1}/${total}] Processing ${stock.name} (${stock.tickerCode})...`)

        // この銘柄に関連するニュースをフィルタリング
        const stockNews = allNews
          .filter(
            (n) =>
              n.content.includes(stock.tickerCode) ||
              n.content.includes(stock.tickerCode.replace(".T", "")) ||
              n.sector === stock.sector
          )
          .slice(0, 5)

        console.log(`  Found ${stockNews.length} news for this stock`)

        // 1. 基礎データ計算
        const baseline = await getBaselineData(stock.tickerCode)

        if (!baseline) {
          console.log(`  No price data available, skipping...`)
          failed++
          continue
        }

        // 2. AI予測生成
        const prediction = await generateAIPrediction(stock, baseline, scores, stockNews)

        // 3. データベースに保存
        await prisma.stockAnalysis.create({
          data: {
            stockId: stock.id,
            shortTermTrend: prediction.shortTerm.trend,
            shortTermPriceLow: prediction.shortTerm.priceLow,
            shortTermPriceHigh: prediction.shortTerm.priceHigh,
            midTermTrend: prediction.midTerm.trend,
            midTermPriceLow: prediction.midTerm.priceLow,
            midTermPriceHigh: prediction.midTerm.priceHigh,
            longTermTrend: prediction.longTerm.trend,
            longTermPriceLow: prediction.longTerm.priceLow,
            longTermPriceHigh: prediction.longTerm.priceHigh,
            recommendation: prediction.recommendation,
            advice: prediction.advice,
            confidence: prediction.confidence,
            analyzedAt: new Date(),
          },
        })

        success++
        console.log(`  Saved (recommendation: ${prediction.recommendation})`)
      } catch (error) {
        console.log(`  Error: ${error}`)
        failed++
      }
    }

    console.log(`\nCompleted!`)
    console.log(`  Success: ${success}`)
    console.log(`  Failed: ${failed}`)
    console.log(`  Total: ${total}`)

    if (failed > 0 && success === 0) {
      process.exit(1)
    }
  } catch (error) {
    console.error(`Error: ${error}`)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()

export {}
