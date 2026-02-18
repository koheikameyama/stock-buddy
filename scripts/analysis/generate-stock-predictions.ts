#!/usr/bin/env npx tsx
/**
 * 銘柄動向予測生成スクリプト
 *
 * ルールベース分析 + AI予測のハイブリッド方式で、
 * 各銘柄の短期・中期・長期の見通しとアドバイスを生成します。
 */

import { PrismaClient } from "@prisma/client"
import OpenAI from "openai"
import pLimit from "p-limit"
import { getRelatedNews, formatNewsForPrompt } from "../lib/news-fetcher"
import { fetchHistoricalPrices } from "../../lib/stock-price-fetcher"

const prisma = new PrismaClient()

// AI API同時リクエスト数の制限（OpenAIのレート制限を考慮）
const AI_CONCURRENCY_LIMIT = 5
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

interface SupportResistance {
  support1: number // 直近サポート（20日安値）
  support2: number // 長期サポート（60日安値）
  resistance1: number // 直近レジスタンス（20日高値）
  resistance2: number // 長期レジスタンス（60日高値）
  sma20: number // 20日移動平均線
  sma60: number | null // 60日移動平均線
}

interface BaselineData {
  currentPrice: number
  weeklyTrend: "up" | "neutral" | "down"
  monthlyTrend: "up" | "neutral" | "down"
  quarterlyTrend: "up" | "neutral" | "down"
  volatility: number
  candlestickPattern: { description: string; signal: string; strength: number } | null
  recentPatterns: { buySignals: number; sellSignals: number } | null
  supportResistance: SupportResistance | null
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
    // Stooq APIを使って3ヶ月分の株価データを取得
    const historicalData = await fetchHistoricalPrices(tickerCode, "3m")

    if (!historicalData || historicalData.length === 0) {
      return null
    }

    // 新しい順にソート
    const priceHistory: PriceHistory[] = [...historicalData]
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((d) => ({
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
        date: d.date,
      }))

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

    // サポート・レジスタンス計算
    let supportResistance: SupportResistance | null = null
    if (priceHistory.length >= 20) {
      const recent20 = priceHistory.slice(0, 20)
      const recent60 = priceHistory.slice(0, Math.min(60, priceHistory.length))

      // 直近20日の高値・安値
      const highs20 = recent20.map((p) => p.high)
      const lows20 = recent20.map((p) => p.low)
      const support1 = Math.min(...lows20)
      const resistance1 = Math.max(...highs20)

      // 60日（または全期間）の高値・安値
      const highs60 = recent60.map((p) => p.high)
      const lows60 = recent60.map((p) => p.low)
      const support2 = Math.min(...lows60)
      const resistance2 = Math.max(...highs60)

      // 移動平均線
      const closes20 = recent20.map((p) => p.close)
      const sma20 = closes20.reduce((a, b) => a + b, 0) / closes20.length

      let sma60: number | null = null
      if (priceHistory.length >= 60) {
        const closes60 = recent60.map((p) => p.close)
        sma60 = closes60.reduce((a, b) => a + b, 0) / closes60.length
      }

      supportResistance = {
        support1,
        support2,
        resistance1,
        resistance2,
        sma20,
        sma60,
      }
    }

    return {
      currentPrice,
      weeklyTrend,
      monthlyTrend,
      quarterlyTrend,
      volatility,
      candlestickPattern,
      recentPatterns,
      supportResistance,
    }
  } catch (error) {
    console.log(`Error fetching baseline data for ${tickerCode}: ${error}`)
    return null
  }
}

interface PredictionResult {
  shortTerm: { trend: string; priceLow: number; priceHigh: number; text: string }
  midTerm: { trend: string; priceLow: number; priceHigh: number; text: string }
  longTerm: { trend: string; priceLow: number; priceHigh: number; text: string }
  recommendation: string
  advice: string
  confidence: number
  limitPrice: number | null // 指値（理想の買値）
  stopLossPrice: number | null // 逆指値（損切りライン）
}

async function generateAIPrediction(
  stock: { name: string; tickerCode: string; sector: string | null },
  baseline: BaselineData,
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

  let supportResistanceContext = ""
  if (baseline.supportResistance) {
    const sr = baseline.supportResistance
    supportResistanceContext = `

【サポート・レジスタンス分析】
- 直近サポート（20日安値）: ${sr.support1.toFixed(2)}円
- 長期サポート（60日安値）: ${sr.support2.toFixed(2)}円
- 直近レジスタンス（20日高値）: ${sr.resistance1.toFixed(2)}円
- 長期レジスタンス（60日高値）: ${sr.resistance2.toFixed(2)}円
- 20日移動平均線: ${sr.sma20.toFixed(2)}円${sr.sma60 ? `\n- 60日移動平均線: ${sr.sma60.toFixed(2)}円` : ""}`
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

【ボラティリティ（価格変動幅）】
${baseline.volatility.toFixed(2)}円
${patternContext}${supportResistanceContext}${newsContext}
---

以下の形式でJSON形式で回答してください：

{
  "shortTerm": {
    "trend": "up" | "neutral" | "down",
    "priceLow": 数値,
    "priceHigh": 数値,
    "text": "短期予測の詳細解説（50-100文字。なぜこの予測か、注目ポイント）"
  },
  "midTerm": {
    "trend": "up" | "neutral" | "down",
    "priceLow": 数値,
    "priceHigh": 数値,
    "text": "中期予測の詳細解説（50-100文字。今後1ヶ月の見通し）"
  },
  "longTerm": {
    "trend": "up" | "neutral" | "down",
    "priceLow": 数値,
    "priceHigh": 数値,
    "text": "長期予測の詳細解説（50-100文字。3ヶ月後までの展望）"
  },
  "recommendation": "buy" | "hold" | "sell",
  "advice": "初心者向けのアドバイス（100文字以内、優しい言葉で、ニュース情報があれば参考にする）",
  "confidence": 0.0〜1.0の信頼度,
  "limitPrice": 数値またはnull（推奨に応じた指値。buy=買い指値、sell=利確目標、hold=null）,
  "stopLossPrice": 数値またはnull（損切りライン。全ての推奨で設定。サポートを下回る価格）
}

注意事項:
- 提供されたニュース情報を参考にしてください
- ニュースにない情報は推測や創作をしないでください
- 決算発表、業績予想、M&A、人事異動など、提供されていない情報を創作しないでください
- 過去の一般知識（例:「○○社は過去に○○した」）は使用しないでください
- 価格予測は現在価格とボラティリティを考慮した現実的な範囲にする
- アドバイスは具体的で分かりやすく
- 断定的な表現は避け、「〜が期待できます」「〜の可能性があります」など柔らかい表現を使う
- 投資判断は最終的にユーザー自身が行うことを前提にする

指値・逆指値の設定ガイド:
【buy推奨時】
- limitPrice（買い指値）:
  - 今すぐ買うべきタイミングなら現在価格をそのまま設定
  - 押し目を待つべきならサポートライン付近（現在価格より数%安い水準）
- stopLossPrice（逆指値）: サポートを明確に下回る水準。損切りライン

【sell推奨時】
- limitPrice（利確目標）:
  - 今すぐ売るべきタイミングなら現在価格をそのまま設定
  - まだ上値余地があるならレジスタンスライン付近（現在価格より数%高い水準）
- stopLossPrice（逆指値）: これ以上下がる前に売却する損切りライン。必ず現在価格より低く設定

【hold推奨時】
- limitPrice（利確目標）: レジスタンスライン付近。ここまで上がったら売却を検討
- stopLossPrice（逆指値）: サポートを下回る水準。損切りライン

重要: 現在価格が適切な買い時・売り時であれば、現在価格をそのまま設定してください。
サポート・レジスタンスの情報がない場合は、現在価格を基準に判断してください`

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.4,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "stock_prediction",
        strict: true,
        schema: {
          type: "object",
          properties: {
            shortTerm: {
              type: "object",
              properties: {
                trend: { type: "string", enum: ["up", "neutral", "down"] },
                priceLow: { type: "number" },
                priceHigh: { type: "number" },
                text: { type: "string" },
              },
              required: ["trend", "priceLow", "priceHigh", "text"],
              additionalProperties: false,
            },
            midTerm: {
              type: "object",
              properties: {
                trend: { type: "string", enum: ["up", "neutral", "down"] },
                priceLow: { type: "number" },
                priceHigh: { type: "number" },
                text: { type: "string" },
              },
              required: ["trend", "priceLow", "priceHigh", "text"],
              additionalProperties: false,
            },
            longTerm: {
              type: "object",
              properties: {
                trend: { type: "string", enum: ["up", "neutral", "down"] },
                priceLow: { type: "number" },
                priceHigh: { type: "number" },
                text: { type: "string" },
              },
              required: ["trend", "priceLow", "priceHigh", "text"],
              additionalProperties: false,
            },
            recommendation: { type: "string", enum: ["buy", "hold", "sell"] },
            advice: { type: "string" },
            confidence: { type: "number" },
            limitPrice: { type: ["number", "null"] },
            stopLossPrice: { type: ["number", "null"] },
          },
          required: ["shortTerm", "midTerm", "longTerm", "recommendation", "advice", "confidence", "limitPrice", "stopLossPrice"],
          additionalProperties: false,
        },
      },
    },
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

    // 並行処理用のキュー（同時実行数を制限）
    const limit = pLimit(AI_CONCURRENCY_LIMIT)
    console.log(`Using concurrent AI requests with limit: ${AI_CONCURRENCY_LIMIT}`)

    let success = 0
    let failed = 0
    let processed = 0

    // 各銘柄の処理タスクを作成
    const tasks = stocks.map((stock) =>
      limit(async () => {
        try {
          processed++
          console.log(`[${processed}/${total}] Processing ${stock.name} (${stock.tickerCode})...`)

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
            return { success: false, stock }
          }

          // 2. AI予測生成
          const prediction = await generateAIPrediction(stock, baseline, stockNews)

          // 3. データベースに保存
          await prisma.stockAnalysis.create({
            data: {
              stockId: stock.id,
              shortTermTrend: prediction.shortTerm.trend,
              shortTermPriceLow: prediction.shortTerm.priceLow,
              shortTermPriceHigh: prediction.shortTerm.priceHigh,
              shortTermText: prediction.shortTerm.text,
              midTermTrend: prediction.midTerm.trend,
              midTermPriceLow: prediction.midTerm.priceLow,
              midTermPriceHigh: prediction.midTerm.priceHigh,
              midTermText: prediction.midTerm.text,
              longTermTrend: prediction.longTerm.trend,
              longTermPriceLow: prediction.longTerm.priceLow,
              longTermPriceHigh: prediction.longTerm.priceHigh,
              longTermText: prediction.longTerm.text,
              recommendation: prediction.recommendation,
              advice: prediction.advice,
              confidence: prediction.confidence,
              limitPrice: prediction.limitPrice,
              stopLossPrice: prediction.stopLossPrice,
              analyzedAt: new Date(),
            },
          })

          success++
          const limitInfo = prediction.limitPrice ? `, 指値: ¥${prediction.limitPrice}` : ""
          const stopLossInfo = prediction.stopLossPrice ? `, 逆指値: ¥${prediction.stopLossPrice}` : ""
          console.log(`  Saved (recommendation: ${prediction.recommendation}${limitInfo}${stopLossInfo})`)
          return { success: true, stock }
        } catch (error) {
          console.log(`  Error: ${error}`)
          failed++
          return { success: false, stock, error }
        }
      })
    )

    // 全タスクを並行実行
    await Promise.all(tasks)

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
