#!/usr/bin/env npx tsx
/**
 * 購入判断分析を生成するスクリプト
 *
 * ウォッチリスト（気になる銘柄）に対して、毎日AI分析を行い購入判断を生成します。
 * - 買い時（buy）/ 様子見（hold）の2段階判断
 * - 具体的な購入提案（推奨数量、目安価格、必要金額）
 * - 平易な言葉での理由説明
 */

import { PrismaClient } from "@prisma/client"
import OpenAI from "openai"
import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import { getRelatedNews, formatNewsForPrompt } from "../lib/news-fetcher"
import { fetchHistoricalPrices } from "../../lib/stock-price-fetcher"

dayjs.extend(utc)

const prisma = new PrismaClient()
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// 時間帯コンテキスト
const TIME_CONTEXT = process.env.TIME_CONTEXT || "morning"

// 時間帯別のプロンプト設定
const TIME_CONTEXT_PROMPTS: Record<string, { intro: string; focus: string }> = {
  morning: {
    intro: "今日の取引開始前の購入判断です。",
    focus: "今日の買いタイミングとチェックポイント",
  },
  noon: {
    intro: "前場の取引を踏まえた購入判断です。",
    focus: "前場の動きを踏まえた後場の買いタイミング",
  },
  close: {
    intro: "本日の取引終了後の振り返りと明日への展望です。",
    focus: "本日の値動きを踏まえた明日以降の買い時",
  },
}

interface PriceData {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

interface CandlePattern {
  description: string
  signal: "buy" | "sell" | "neutral"
  strength: number
}

interface PatternAnalysis {
  latest: CandlePattern
  recent_buy_signals: number
  recent_sell_signals: number
}

function analyzeCandlestickPattern(candle: PriceData): CandlePattern {
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

function getPatternAnalysis(recentPrices: PriceData[]): PatternAnalysis | null {
  if (!recentPrices || recentPrices.length < 1) {
    return null
  }

  const latest = recentPrices[0]
  const pattern = analyzeCandlestickPattern(latest)

  let buySignals = 0
  let sellSignals = 0

  for (const price of recentPrices.slice(0, 5)) {
    const p = analyzeCandlestickPattern(price)
    if (p.strength >= 60) {
      if (p.signal === "buy") buySignals++
      else if (p.signal === "sell") sellSignals++
    }
  }

  return {
    latest: pattern,
    recent_buy_signals: buySignals,
    recent_sell_signals: sellSignals,
  }
}

async function getRecentPrices(tickerCode: string): Promise<PriceData[]> {
  try {
    // Stooq APIから1ヶ月分のデータを取得
    const historicalData = await fetchHistoricalPrices(tickerCode, "1m")

    if (!historicalData || historicalData.length === 0) {
      return []
    }

    const prices: PriceData[] = historicalData.map((d) => ({
      date: d.date,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
      volume: d.volume,
    }))

    // 新しい順にソート
    return prices.sort((a, b) => b.date.localeCompare(a.date))
  } catch (error) {
    console.log(`Error fetching prices for ${tickerCode}: ${error}`)
    return []
  }
}

interface RecommendationResult {
  recommendation: "buy" | "hold" | "pass"
  confidence: number
  reason: string
  recommendedQuantity: number | null
  recommendedPrice: number | null
  estimatedAmount: number | null
  caution: string
}

async function generateRecommendation(
  stock: { name: string; tickerCode: string; sector: string | null },
  prediction: { shortTerm?: string; mediumTerm?: string; longTerm?: string },
  recentPrices: PriceData[],
  relatedNews: Awaited<ReturnType<typeof getRelatedNews>>,
  patternAnalysis: PatternAnalysis | null,
  investmentStyle: string | null,
  currentPrice: number | null
): Promise<RecommendationResult | null> {
  const prompts = TIME_CONTEXT_PROMPTS[TIME_CONTEXT] || TIME_CONTEXT_PROMPTS.morning

  const styleContext = investmentStyle
    ? `

【ユーザーの投資スタイル】
${investmentStyle}
※ ユーザーの投資スタイルに合わせた購入判断をしてください。`
    : ""

  const newsContext =
    relatedNews.length > 0
      ? `

【最新のニュース情報】
${formatNewsForPrompt(relatedNews)}
`
      : ""

  const patternContext = patternAnalysis
    ? `

【ローソク足パターン分析】
- 最新パターン: ${patternAnalysis.latest.description}
- シグナル: ${patternAnalysis.latest.signal}
- 強さ: ${patternAnalysis.latest.strength}%
- 直近5日の買いシグナル: ${patternAnalysis.recent_buy_signals}回
- 直近5日の売りシグナル: ${patternAnalysis.recent_sell_signals}回
`
    : ""

  const prompt = `あなたは投資初心者向けのAIコーチです。
${prompts.intro}
以下の銘柄について、${prompts.focus}を判断してください。

【銘柄情報】
- 名前: ${stock.name}
- ティッカーコード: ${stock.tickerCode}
- セクター: ${stock.sector || "不明"}
- 現在価格: ${currentPrice || "不明"}円

【予測情報】
- 短期予測: ${prediction.shortTerm || "不明"}
- 中期予測: ${prediction.mediumTerm || "不明"}
- 長期予測: ${prediction.longTerm || "不明"}

【株価データ】
直近30日の終値: ${recentPrices.length}件のデータあり
${patternContext}${newsContext}${styleContext}
【回答形式】
以下のJSON形式で回答してください。JSON以外のテキストは含めないでください。

{
  "recommendation": "buy" | "hold" | "pass",
  "confidence": 0.0から1.0の数値（小数点2桁）,
  "reason": "初心者に分かりやすい言葉で1-2文の理由（ニュース情報があれば参考にする）",
  "recommendedQuantity": 100株単位の整数（buyの場合のみ、それ以外はnull）,
  "recommendedPrice": 目安価格の整数（buyの場合のみ、それ以外はnull）,
  "estimatedAmount": 必要金額の整数（buyの場合のみ、それ以外はnull）,
  "caution": "注意点を1-2文"
}

【制約】
- 提供されたニュース情報を参考にしてください
- ニュースにない情報は推測や創作をしないでください
- 専門用語は使わない（ROE、PER、株価収益率などは使用禁止）
- 「成長性」「安定性」「割安」のような平易な言葉を使う
- 理由と注意点は、中学生でも理解できる表現にする
- recommendationが"buy"の場合のみ、recommendedQuantity、recommendedPrice、estimatedAmountを設定
- recommendationが"hold"または"pass"の場合、これらはnullにする`

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a helpful investment coach for beginners. Always respond in JSON format.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 500,
    })

    let content = response.choices[0].message.content?.trim() || ""

    // マークダウンコードブロックを削除
    if (content.startsWith("```json")) content = content.slice(7)
    else if (content.startsWith("```")) content = content.slice(3)
    if (content.endsWith("```")) content = content.slice(0, -3)
    content = content.trim()

    const result = JSON.parse(content) as RecommendationResult

    // バリデーション
    const requiredFields = ["recommendation", "confidence", "reason", "caution"]
    for (const field of requiredFields) {
      if (!(field in result)) {
        throw new Error(`Missing required field: ${field}`)
      }
    }

    if (!["buy", "hold", "pass"].includes(result.recommendation)) {
      throw new Error(`Invalid recommendation: ${result.recommendation}`)
    }

    if (result.confidence < 0 || result.confidence > 1) {
      throw new Error(`Invalid confidence: ${result.confidence}`)
    }

    return result
  } catch (error) {
    console.log(`Error generating recommendation: ${error}`)
    return null
  }
}

function formatInvestmentStyle(
  settings: { investmentPeriod: string | null; riskTolerance: string | null } | null
): string | null {
  if (!settings) return null

  const periodLabel: Record<string, string> = {
    short: "短期（1年以内）",
    medium: "中期（1〜3年）",
    long: "長期（3年以上）",
  }

  const riskLabel: Record<string, string> = {
    low: "低い（安定重視）",
    medium: "普通（バランス）",
    high: "高い（成長重視）",
  }

  const lines: string[] = []
  if (settings.investmentPeriod && periodLabel[settings.investmentPeriod]) {
    lines.push(`- 投資期間: ${periodLabel[settings.investmentPeriod]}`)
  }
  if (settings.riskTolerance && riskLabel[settings.riskTolerance]) {
    lines.push(`- リスク許容度: ${riskLabel[settings.riskTolerance]}`)
  }

  return lines.length > 0 ? lines.join("\n") : null
}

async function main(): Promise<void> {
  console.log("=== Starting Purchase Recommendation Generation ===")
  console.log(`Time: ${new Date().toISOString()}`)
  console.log(`Time context: ${TIME_CONTEXT}`)

  if (!process.env.OPENAI_API_KEY) {
    console.error("Error: OPENAI_API_KEY environment variable not set")
    process.exit(1)
  }

  try {
    // ウォッチリスト取得
    const watchlistStocks = await prisma.watchlistStock.findMany({
      include: {
        stock: true,
      },
    })
    console.log(`Found ${watchlistStocks.length} stocks in watchlist`)

    if (watchlistStocks.length === 0) {
      console.log("No stocks in watchlist. Exiting.")
      return
    }

    // 関連ニュースを一括取得
    const tickerCodes = watchlistStocks.map((ws) => ws.stock.tickerCode)
    const sectors = Array.from(new Set(watchlistStocks.map((ws) => ws.stock.sector).filter((s): s is string => !!s)))

    console.log(`Fetching related news for ${tickerCodes.length} stocks...`)
    const allNews = await getRelatedNews(prisma, tickerCodes, sectors, 20, 7)
    console.log(`Found ${allNews.length} related news articles`)

    let successCount = 0
    let errorCount = 0

    // ユーザーの投資スタイルをキャッシュ
    const userStyles = new Map<string, string | null>()

    for (const ws of watchlistStocks) {
      const stock = ws.stock
      console.log(`\n--- Processing: ${stock.name} (${stock.tickerCode}) ---`)

      // ユーザーの投資スタイルを取得（キャッシュ）
      let investmentStyle = userStyles.get(ws.userId)
      if (investmentStyle === undefined) {
        const settings = await prisma.userSettings.findUnique({
          where: { userId: ws.userId },
          select: { investmentPeriod: true, riskTolerance: true },
        })
        investmentStyle = formatInvestmentStyle(settings)
        userStyles.set(ws.userId, investmentStyle)
      }

      // この銘柄に関連するニュースをフィルタリング
      const stockNews = allNews
        .filter(
          (n) =>
            n.content.includes(stock.tickerCode) ||
            n.content.includes(stock.tickerCode.replace(".T", "")) ||
            n.sector === stock.sector
        )
        .slice(0, 5)

      console.log(`Found ${stockNews.length} news for this stock`)

      // 予測データ取得
      const latestAnalysis = await prisma.stockAnalysis.findFirst({
        where: { stockId: stock.id },
        orderBy: { analyzedAt: "desc" },
        select: { advice: true },
      })

      const prediction = {
        shortTerm: latestAnalysis?.advice,
        mediumTerm: latestAnalysis?.advice,
        longTerm: latestAnalysis?.advice,
      }

      // 直近価格取得
      const recentPrices = await getRecentPrices(stock.tickerCode)
      const currentPrice = recentPrices.length > 0 ? recentPrices[0].close : null

      // ローソク足パターン分析
      const patternAnalysis = getPatternAnalysis(recentPrices)
      if (patternAnalysis) {
        console.log(`Pattern analysis: ${patternAnalysis.latest.description} (${patternAnalysis.latest.signal})`)
      }

      // 購入判断生成
      const recommendation = await generateRecommendation(
        stock,
        prediction,
        recentPrices,
        stockNews,
        patternAnalysis,
        investmentStyle,
        currentPrice
      )

      if (!recommendation) {
        console.log(`Failed to generate recommendation for ${stock.name}`)
        errorCount++
        continue
      }

      console.log(`Generated recommendation: ${recommendation.recommendation}`)
      console.log(`Confidence: ${recommendation.confidence}`)
      console.log(`Reason: ${recommendation.reason}`)

      // データベース保存（upsert）
      const today = dayjs.utc().startOf("day").toDate()

      await prisma.purchaseRecommendation.upsert({
        where: {
          stockId_date: {
            stockId: stock.id,
            date: today,
          },
        },
        update: {
          recommendation: recommendation.recommendation,
          confidence: recommendation.confidence,
          recommendedQuantity: recommendation.recommendedQuantity,
          recommendedPrice: recommendation.recommendedPrice,
          estimatedAmount: recommendation.estimatedAmount,
          reason: recommendation.reason,
          caution: recommendation.caution,
        },
        create: {
          stockId: stock.id,
          date: today,
          recommendation: recommendation.recommendation,
          confidence: recommendation.confidence,
          recommendedQuantity: recommendation.recommendedQuantity,
          recommendedPrice: recommendation.recommendedPrice,
          estimatedAmount: recommendation.estimatedAmount,
          reason: recommendation.reason,
          caution: recommendation.caution,
        },
      })

      console.log(`Saved recommendation for stock ${stock.id}`)
      successCount++
    }

    console.log(`\n=== Summary ===`)
    console.log(`Total stocks processed: ${watchlistStocks.length}`)
    console.log(`Success: ${successCount}`)
    console.log(`Errors: ${errorCount}`)

    if (errorCount > 0 && successCount === 0) {
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
