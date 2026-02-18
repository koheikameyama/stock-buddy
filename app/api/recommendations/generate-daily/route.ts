import { NextRequest, NextResponse } from "next/server"
import pLimit from "p-limit"
import { prisma } from "@/lib/prisma"
import { verifyCronAuth } from "@/lib/cron-auth"
import { getOpenAIClient } from "@/lib/openai"
import { getTodayForDB } from "@/lib/date-utils"
import { fetchHistoricalPrices, fetchStockPrices } from "@/lib/stock-price-fetcher"
import { getNikkei225Data } from "@/lib/market-index"

// AI API同時リクエスト数の制限（ユーザー単位での並列処理）
const USER_CONCURRENCY_LIMIT = 3
import {
  buildFinancialMetrics,
  buildTechnicalContext,
  buildCandlestickContext,
  buildChartPatternContext,
  buildWeekChangeContext,
  buildMarketContext,
  PROMPT_NEWS_CONSTRAINTS,
  PROMPT_MARKET_SIGNAL_DEFINITION,
} from "@/lib/stock-analysis-context"
import {
  calculateStockScores,
  applySectorDiversification,
  filterByBudget,
  SCORING_CONFIG,
  SESSION_PROMPTS,
  PERIOD_LABELS,
  RISK_LABELS,
  StockForScoring,
  ScoredStock,
} from "@/lib/recommendation-scoring"
import { insertRecommendationOutcome } from "@/lib/outcome-utils"

interface GenerateRequest {
  session?: "morning" | "afternoon" | "evening"
  userId?: string
}

interface UserResult {
  userId: string
  success: boolean
  recommendations?: Array<{ tickerCode: string; reason: string }>
  error?: string
}

interface StockContext {
  stock: ScoredStock
  currentPrice: number
  financialMetrics: string
  technicalContext: string
  candlestickContext: string
  chartPatternContext: string
  weekChangeContext: string
}

/**
 * POST /api/recommendations/generate-daily
 * 日次おすすめ銘柄を生成（全ユーザーまたは指定ユーザー）
 */
export async function POST(request: NextRequest) {
  const authError = verifyCronAuth(request)
  if (authError) return authError

  let body: GenerateRequest = {}
  try {
    body = await request.json()
  } catch {
    // bodyがない場合はデフォルト値を使用
  }

  const session = body.session || "evening"
  const targetUserId = body.userId

  console.log("=".repeat(60))
  console.log("Daily Recommendation Generation (TypeScript)")
  console.log("=".repeat(60))
  console.log(`Time: ${new Date().toISOString()}`)
  console.log(`Session: ${session}`)
  console.log(`Target User: ${targetUserId || "all"}`)

  try {
    const users = await prisma.userSettings.findMany({
      where: targetUserId ? { userId: targetUserId } : undefined,
      select: {
        userId: true,
        investmentPeriod: true,
        riskTolerance: true,
        investmentBudget: true,
      },
    })

    if (users.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No users with settings",
        processed: 0
      })
    }

    console.log(`Found ${users.length} users with settings`)

    const allStocks = await prisma.stock.findMany({
      where: {
        priceUpdatedAt: { not: null },
        latestPrice: { not: null },
      },
      select: {
        id: true,
        tickerCode: true,
        name: true,
        sector: true,
        latestPrice: true,
        weekChangeRate: true,
        volatility: true,
        volumeRatio: true,
        marketCap: true,
        isProfitable: true,
        dividendYield: true,
        pbr: true,
        per: true,
        roe: true,
        profitTrend: true,
        revenueGrowth: true,
        eps: true,
        fiftyTwoWeekHigh: true,
        fiftyTwoWeekLow: true,
      },
    })

    console.log(`Found ${allStocks.length} stocks with price data`)

    const [portfolioStocks, watchlistStocks] = await Promise.all([
      prisma.portfolioStock.findMany({
        select: { userId: true, stockId: true },
      }),
      prisma.watchlistStock.findMany({
        select: { userId: true, stockId: true },
      }),
    ])

    const registeredByUser = new Map<string, Set<string>>()
    for (const ps of portfolioStocks) {
      if (!registeredByUser.has(ps.userId)) {
        registeredByUser.set(ps.userId, new Set())
      }
      registeredByUser.get(ps.userId)!.add(ps.stockId)
    }
    for (const ws of watchlistStocks) {
      if (!registeredByUser.has(ws.userId)) {
        registeredByUser.set(ws.userId, new Set())
      }
      registeredByUser.get(ws.userId)!.add(ws.stockId)
    }

    let marketData = null
    try {
      marketData = await getNikkei225Data()
    } catch (error) {
      console.error("市場データ取得失敗:", error)
    }
    const marketContext = buildMarketContext(marketData)

    // ユーザー処理を並列実行（同時実行数を制限）
    const limit = pLimit(USER_CONCURRENCY_LIMIT)
    console.log(`Processing ${users.length} users with concurrency limit: ${USER_CONCURRENCY_LIMIT}`)

    const tasks = users.map((user) =>
      limit(async (): Promise<UserResult> => {
        try {
          const result = await processUser(
            user,
            allStocks,
            registeredByUser.get(user.userId) || new Set(),
            session,
            marketContext
          )
          return result
        } catch (error) {
          console.error(`Error processing user ${user.userId}:`, error)
          return {
            userId: user.userId,
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          }
        }
      })
    )

    const results = await Promise.all(tasks)

    const successCount = results.filter(r => r.success).length
    const failCount = results.filter(r => !r.success).length

    console.log("=".repeat(60))
    console.log(`Completed: ${successCount} users OK, ${failCount} users failed`)
    console.log("=".repeat(60))

    return NextResponse.json({
      success: true,
      processed: successCount,
      failed: failCount,
      results,
    })
  } catch (error) {
    console.error("Error in generate-daily:", error)
    return NextResponse.json(
      { error: "Failed to generate recommendations" },
      { status: 500 }
    )
  }
}

async function processUser(
  user: {
    userId: string
    investmentPeriod: string | null
    riskTolerance: string | null
    investmentBudget: number | null
  },
  allStocks: Array<{
    id: string
    tickerCode: string
    name: string
    sector: string | null
    latestPrice: unknown
    weekChangeRate: unknown
    volatility: unknown
    volumeRatio: unknown
    marketCap: unknown
    isProfitable: boolean | null
    dividendYield: unknown
    pbr: unknown
    per: unknown
    roe: unknown
    profitTrend: string | null
    revenueGrowth: unknown
    eps: unknown
    fiftyTwoWeekHigh: unknown
    fiftyTwoWeekLow: unknown
  }>,
  registeredStockIds: Set<string>,
  session: string,
  marketContext: string
): Promise<UserResult> {
  const { userId, investmentPeriod, riskTolerance, investmentBudget } = user

  console.log(`\n--- User: ${userId} (budget: ${investmentBudget}, period: ${investmentPeriod}, risk: ${riskTolerance}) ---`)

  const stocksForScoring: StockForScoring[] = allStocks.map(s => ({
    id: s.id,
    tickerCode: s.tickerCode,
    name: s.name,
    sector: s.sector,
    latestPrice: s.latestPrice ? Number(s.latestPrice) : null,
    weekChangeRate: s.weekChangeRate ? Number(s.weekChangeRate) : null,
    volatility: s.volatility ? Number(s.volatility) : null,
    volumeRatio: s.volumeRatio ? Number(s.volumeRatio) : null,
    marketCap: s.marketCap ? Number(s.marketCap) : null,
    isProfitable: s.isProfitable,
  }))

  const filtered = filterByBudget(stocksForScoring, investmentBudget)
  console.log(`  Stocks after budget filter: ${filtered.length}/${stocksForScoring.length}`)

  if (filtered.length === 0) {
    return { userId, success: false, error: "No stocks available after budget filter" }
  }

  const scored = calculateStockScores(filtered, investmentPeriod, riskTolerance)
  console.log(`  Top 3 scores: ${scored.slice(0, 3).map(s => `${s.tickerCode}:${s.score}`).join(", ")}`)

  let diversified = applySectorDiversification(scored)
  console.log(`  After sector diversification: ${diversified.length} stocks`)

  if (registeredStockIds.size > 0) {
    const candidates = diversified.filter(s => !registeredStockIds.has(s.id))
    if (candidates.length > 5) {
      diversified = candidates
      console.log(`  After excluding registered: ${diversified.length} stocks`)
    }
  }

  const topCandidates = diversified.slice(0, SCORING_CONFIG.MAX_CANDIDATES_FOR_AI)

  const stockContexts = await buildStockContexts(topCandidates, allStocks)

  const recommendations = await selectWithAI(
    userId,
    investmentPeriod,
    riskTolerance,
    investmentBudget,
    session,
    stockContexts,
    marketContext
  )

  if (!recommendations || recommendations.length === 0) {
    return { userId, success: false, error: "AI selection failed" }
  }

  const saved = await saveRecommendations(userId, recommendations, topCandidates)
  console.log(`  Saved ${saved} recommendations`)

  return {
    userId,
    success: true,
    recommendations,
  }
}

async function buildStockContexts(
  candidates: ScoredStock[],
  allStocksData: Array<{
    id: string
    tickerCode: string
    dividendYield: unknown
    pbr: unknown
    per: unknown
    roe: unknown
    isProfitable: boolean | null
    profitTrend: string | null
    revenueGrowth: unknown
    eps: unknown
    fiftyTwoWeekHigh: unknown
    fiftyTwoWeekLow: unknown
    marketCap: unknown
  }>
): Promise<StockContext[]> {
  console.log(`  Fetching detailed data for ${candidates.length} candidates...`)

  const stockDataMap = new Map(allStocksData.map(s => [s.id, s]))

  const pricesPromises = candidates.map(async (candidate) => {
    try {
      const prices = await fetchHistoricalPrices(candidate.tickerCode, "1m")
      return { stockId: candidate.id, prices }
    } catch (error) {
      console.error(`  Failed to fetch prices for ${candidate.tickerCode}:`, error)
      return { stockId: candidate.id, prices: [] }
    }
  })

  const pricesResults = await Promise.all(pricesPromises)
  const pricesMap = new Map(pricesResults.map(r => [r.stockId, r.prices]))

  const tickerCodes = candidates.map(c => c.tickerCode)
  let currentPrices: Map<string, number> = new Map()
  try {
    const realtimePrices = await fetchStockPrices(tickerCodes)
    currentPrices = new Map(
      realtimePrices.map(p => [p.tickerCode, p.currentPrice])
    )
  } catch (error) {
    console.error("  Failed to fetch realtime prices:", error)
  }

  const contexts: StockContext[] = []

  for (const candidate of candidates) {
    const stockData = stockDataMap.get(candidate.id)
    const prices = pricesMap.get(candidate.id) || []
    const currentPrice = currentPrices.get(candidate.tickerCode) || candidate.latestPrice || 0

    const financialMetrics = stockData ? buildFinancialMetrics({
      marketCap: stockData.marketCap ? Number(stockData.marketCap) : undefined,
      dividendYield: stockData.dividendYield ? Number(stockData.dividendYield) : undefined,
      pbr: stockData.pbr ? Number(stockData.pbr) : undefined,
      per: stockData.per ? Number(stockData.per) : undefined,
      roe: stockData.roe ? Number(stockData.roe) : undefined,
      isProfitable: stockData.isProfitable,
      profitTrend: stockData.profitTrend,
      revenueGrowth: stockData.revenueGrowth ? Number(stockData.revenueGrowth) : undefined,
      eps: stockData.eps ? Number(stockData.eps) : undefined,
      fiftyTwoWeekHigh: stockData.fiftyTwoWeekHigh ? Number(stockData.fiftyTwoWeekHigh) : undefined,
      fiftyTwoWeekLow: stockData.fiftyTwoWeekLow ? Number(stockData.fiftyTwoWeekLow) : undefined,
    }, currentPrice) : "財務データなし"

    const ohlcvPrices = prices.map(p => ({
      date: p.date,
      open: p.open,
      high: p.high,
      low: p.low,
      close: p.close,
    }))

    const technicalContext = buildTechnicalContext(ohlcvPrices)
    const candlestickContext = buildCandlestickContext(ohlcvPrices)
    const chartPatternContext = buildChartPatternContext(ohlcvPrices)
    const { text: weekChangeContext } = buildWeekChangeContext(ohlcvPrices, "watchlist")

    contexts.push({
      stock: candidate,
      currentPrice,
      financialMetrics,
      technicalContext,
      candlestickContext,
      chartPatternContext,
      weekChangeContext,
    })
  }

  console.log(`  Built contexts for ${contexts.length} stocks`)
  return contexts
}

async function selectWithAI(
  _userId: string,
  investmentPeriod: string | null,
  riskTolerance: string | null,
  investmentBudget: number | null,
  session: string,
  stockContexts: StockContext[],
  marketContext: string
): Promise<Array<{ tickerCode: string; reason: string }> | null> {
  const prompts = SESSION_PROMPTS[session] || SESSION_PROMPTS.evening
  const periodLabel = PERIOD_LABELS[investmentPeriod || ""] || "不明"
  const riskLabel = RISK_LABELS[riskTolerance || ""] || "不明"
  const budgetLabel = investmentBudget ? `${investmentBudget.toLocaleString()}円` : "未設定"

  const stockSummaries = stockContexts.map((ctx, idx) => {
    const s = ctx.stock
    return `
【候補${idx + 1}: ${s.name}（${s.tickerCode}）】
- セクター: ${s.sector || "不明"}
- 現在価格: ${ctx.currentPrice.toLocaleString()}円
- スコア: ${s.score}点

${ctx.financialMetrics}
${ctx.technicalContext}${ctx.candlestickContext}${ctx.chartPatternContext}${ctx.weekChangeContext}`
  }).join("\n\n")

  const prompt = `あなたは投資初心者を優しくサポートするAIコーチです。
${prompts.intro}
以下のユーザーの投資スタイルに合った${prompts.focus}を5つ選んでください。

【ユーザーの投資スタイル】
- 投資期間: ${periodLabel}
- リスク許容度: ${riskLabel}
- 投資資金: ${budgetLabel}
${marketContext}
【選べる銘柄一覧（詳細分析付き）】
${stockSummaries}

${PROMPT_MARKET_SIGNAL_DEFINITION}

【回答ルール】
- 必ず5銘柄を選んでください（候補が5未満なら全て選ぶ）
- セクターが偏らないようにしてください
- テクニカル指標（RSI、MACDなど）を活用して判断してください
- 財務指標も考慮してください
- 理由は専門用語を使いつつ、解説を添えてください
  例: 「RSI（売られすぎ・買われすぎの指標）が30を下回り、反発が期待できます」
- marketSignal は候補全体を見て市場の雰囲気を判断してください

【制約】
${PROMPT_NEWS_CONSTRAINTS}
- 急騰銘柄（週間+20%以上）は「上がりきった可能性」を考慮してください
- 赤字企業は「業績リスク」を理由で必ず言及してください

【回答形式】
以下のJSON形式で回答してください。JSON以外のテキストは含めないでください。

{
  "marketSignal": "bullish" | "neutral" | "bearish",
  "selections": [
    {
      "tickerCode": "銘柄コード",
      "reason": "おすすめ理由（テクニカル・ファンダメンタルの根拠を含む、2-3文）"
    }
  ]
}`

  try {
    const openai = getOpenAIClient()
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a helpful investment coach for beginners. Always respond in valid JSON format only.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.5,
      max_tokens: 1000,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "daily_recommendation",
          strict: true,
          schema: {
            type: "object",
            properties: {
              marketSignal: { type: "string", enum: ["bullish", "neutral", "bearish"] },
              selections: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    tickerCode: { type: "string" },
                    reason: { type: "string" },
                  },
                  required: ["tickerCode", "reason"],
                  additionalProperties: false,
                },
              },
            },
            required: ["marketSignal", "selections"],
            additionalProperties: false,
          },
        },
      },
    })

    const content = response.choices[0].message.content?.trim() || "{}"
    const result = JSON.parse(content)

    if (!result.selections || !Array.isArray(result.selections)) {
      console.error("  Invalid AI response format")
      return null
    }

    const validSelections = result.selections
      .filter((s: { tickerCode?: string; reason?: string }) => s.tickerCode && s.reason)
      .slice(0, 5)

    console.log(`  AI selected ${validSelections.length} stocks (marketSignal: ${result.marketSignal})`)
    return validSelections
  } catch (error) {
    console.error("  AI selection error:", error)
    return null
  }
}

async function saveRecommendations(
  userId: string,
  recommendations: Array<{ tickerCode: string; reason: string }>,
  candidates: ScoredStock[]
): Promise<number> {
  const today = getTodayForDB()
  const now = new Date()

  const stockMap = new Map(candidates.map(s => [s.tickerCode, s]))

  let saved = 0

  for (let idx = 0; idx < recommendations.length; idx++) {
    const rec = recommendations[idx]
    const stock = stockMap.get(rec.tickerCode)

    if (!stock) {
      console.log(`  Warning: Stock not found for ticker ${rec.tickerCode}`)
      continue
    }

    try {
      const savedRec = await prisma.userDailyRecommendation.upsert({
        where: {
          userId_date_position: {
            userId,
            date: today,
            position: idx + 1,
          },
        },
        update: {
          stockId: stock.id,
          reason: rec.reason,
        },
        create: {
          userId,
          date: today,
          stockId: stock.id,
          position: idx + 1,
          reason: rec.reason,
        },
      })

      saved++

      await insertRecommendationOutcome({
        type: "daily",
        recommendationId: savedRec.id,
        stockId: stock.id,
        tickerCode: stock.tickerCode,
        sector: stock.sector,
        recommendedAt: now,
        priceAtRec: stock.latestPrice || 0,
        prediction: "buy",
        confidence: null,
        volatility: stock.volatility,
        marketCap: stock.marketCap ? BigInt(Math.round(stock.marketCap * 100_000_000)) : null,
      })
    } catch (error) {
      console.error(`  Error saving recommendation for ${rec.tickerCode}:`, error)
    }
  }

  return saved
}
