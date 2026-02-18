# 日次おすすめ生成の共通プロンプト化 実装計画

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 日次おすすめ生成をTypeScriptに移行し、ポートフォリオ/購入判断と同じ分析データをAIに渡す

**Architecture:** Pythonスクリプトは最小限（APIを呼ぶだけ）にし、スコア計算・詳細データ取得・AI選定のロジックをTypeScript APIに集約。共通化された`lib/stock-analysis-context.ts`の関数を活用。

**Tech Stack:** Next.js API Routes, Prisma, OpenAI, yfinance (Python経由)

---

## Task 1: スコア計算ロジックの移植

**Files:**
- Create: `lib/recommendation-scoring.ts`

**Step 1: スコア計算定数を定義**

```typescript
// lib/recommendation-scoring.ts

/**
 * 日次おすすめ銘柄のスコア計算ロジック
 *
 * Pythonスクリプト (generate_personal_recommendations.py) から移植
 */

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
```

**Step 2: 銘柄スコア計算関数を実装**

```typescript
// lib/recommendation-scoring.ts (続き)

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
  risk: string | null
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
```

**Step 3: ファイルを保存してビルド確認**

Run: `npx tsc --noEmit lib/recommendation-scoring.ts`
Expected: No errors

**Step 4: コミット**

```bash
git add lib/recommendation-scoring.ts
git commit -m "feat: スコア計算ロジックをTypeScriptに移植"
```

---

## Task 2: APIエンドポイントの作成（基本構造）

**Files:**
- Create: `app/api/recommendations/generate-daily/route.ts`

**Step 1: APIエンドポイントの基本構造を作成**

```typescript
// app/api/recommendations/generate-daily/route.ts

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyCronAuth } from "@/lib/cron-auth"
import { getOpenAIClient } from "@/lib/openai"
import { getTodayForDB } from "@/lib/date-utils"
import { fetchHistoricalPrices, fetchStockPrices } from "@/lib/stock-price-fetcher"
import { getNikkei225Data } from "@/lib/market-index"
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
  userId?: string // 特定ユーザーのみ処理する場合
}

interface UserResult {
  userId: string
  success: boolean
  recommendations?: Array<{ tickerCode: string; reason: string }>
  error?: string
}

/**
 * POST /api/recommendations/generate-daily
 * 日次おすすめ銘柄を生成（全ユーザーまたは指定ユーザー）
 */
export async function POST(request: NextRequest) {
  // CRON認証
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
    // 1. ユーザー設定を取得
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

    // 2. 全銘柄を取得
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
        // 財務指標（詳細分析用）
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

    // 3. 全ユーザーの登録済み銘柄を一括取得
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

    // 4. 市場コンテキストを取得（全ユーザー共通）
    let marketData = null
    try {
      marketData = await getNikkei225Data()
    } catch (error) {
      console.error("市場データ取得失敗:", error)
    }
    const marketContext = buildMarketContext(marketData)

    // 5. 各ユーザーに対して処理
    const results: UserResult[] = []

    for (const user of users) {
      try {
        const result = await processUser(
          user,
          allStocks,
          registeredByUser.get(user.userId) || new Set(),
          session,
          marketContext
        )
        results.push(result)
      } catch (error) {
        console.error(`Error processing user ${user.userId}:`, error)
        results.push({
          userId: user.userId,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        })
      }
    }

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

// processUser関数は次のTaskで実装
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
  // 次のTaskで実装
  return {
    userId: user.userId,
    success: false,
    error: "Not implemented yet",
  }
}
```

**Step 2: ビルド確認**

Run: `npm run build`
Expected: Build succeeds (warnings are OK)

**Step 3: コミット**

```bash
git add app/api/recommendations/generate-daily/route.ts
git commit -m "feat: 日次おすすめ生成APIの基本構造を作成"
```

---

## Task 3: ユーザー処理ロジックの実装

**Files:**
- Modify: `app/api/recommendations/generate-daily/route.ts`

**Step 1: processUser関数を実装**

`processUser`関数を以下の内容に置き換え:

```typescript
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

  // 1. 型変換してスコア計算用に整形
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

  // 2. 予算フィルタ
  const filtered = filterByBudget(stocksForScoring, investmentBudget)
  console.log(`  Stocks after budget filter: ${filtered.length}/${stocksForScoring.length}`)

  if (filtered.length === 0) {
    return { userId, success: false, error: "No stocks available after budget filter" }
  }

  // 3. スコア計算
  const scored = calculateStockScores(filtered, investmentPeriod, riskTolerance)
  console.log(`  Top 3 scores: ${scored.slice(0, 3).map(s => `${s.tickerCode}:${s.score}`).join(", ")}`)

  // 4. セクター分散
  let diversified = applySectorDiversification(scored)
  console.log(`  After sector diversification: ${diversified.length} stocks`)

  // 5. 登録済み銘柄を除外（候補が5件以下にならない場合のみ）
  if (registeredStockIds.size > 0) {
    const candidates = diversified.filter(s => !registeredStockIds.has(s.id))
    if (candidates.length > 5) {
      diversified = candidates
      console.log(`  After excluding registered: ${diversified.length} stocks`)
    }
  }

  // 6. 上位15銘柄に絞り込み
  const topCandidates = diversified.slice(0, SCORING_CONFIG.MAX_CANDIDATES_FOR_AI)

  // 7. 詳細データを取得（リアルタイム株価 + テクニカル分析）
  const stockContexts = await buildStockContexts(topCandidates, allStocks)

  // 8. AIで5銘柄選定
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

  // 9. DBに保存
  const saved = await saveRecommendations(userId, recommendations, topCandidates)
  console.log(`  Saved ${saved} recommendations`)

  return {
    userId,
    success: true,
    recommendations,
  }
}
```

**Step 2: buildStockContexts関数を追加**

```typescript
interface StockContext {
  stock: ScoredStock
  currentPrice: number
  financialMetrics: string
  technicalContext: string
  candlestickContext: string
  chartPatternContext: string
  weekChangeContext: string
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

  // 財務データをマップに
  const stockDataMap = new Map(allStocksData.map(s => [s.id, s]))

  // 並列で株価データを取得
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

  // リアルタイム株価を取得
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

  // コンテキストを構築
  const contexts: StockContext[] = []

  for (const candidate of candidates) {
    const stockData = stockDataMap.get(candidate.id)
    const prices = pricesMap.get(candidate.id) || []
    const currentPrice = currentPrices.get(candidate.tickerCode) || candidate.latestPrice || 0

    // 財務指標
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

    // テクニカル分析
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
```

**Step 3: コミット**

```bash
git add app/api/recommendations/generate-daily/route.ts
git commit -m "feat: ユーザー処理ロジックと詳細データ取得を実装"
```

---

## Task 4: AI選定ロジックの実装

**Files:**
- Modify: `app/api/recommendations/generate-daily/route.ts`

**Step 1: selectWithAI関数を追加**

```typescript
async function selectWithAI(
  userId: string,
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

  // 各銘柄の詳細コンテキストを構築
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

    // バリデーション: tickerCodeとreasonがあるもののみ
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
```

**Step 2: コミット**

```bash
git add app/api/recommendations/generate-daily/route.ts
git commit -m "feat: AI選定ロジックを実装（共通プロンプト使用）"
```

---

## Task 5: DB保存ロジックの実装

**Files:**
- Modify: `app/api/recommendations/generate-daily/route.ts`

**Step 1: saveRecommendations関数を追加**

```typescript
async function saveRecommendations(
  userId: string,
  recommendations: Array<{ tickerCode: string; reason: string }>,
  candidates: ScoredStock[]
): Promise<number> {
  const today = getTodayForDB()
  const now = new Date()

  // tickerCode -> stock のマップ
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
      // upsert: 既存レコードがあれば更新、なければ挿入
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

      // RecommendationOutcome を作成
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
```

**Step 2: ビルド確認**

Run: `npm run build`
Expected: Build succeeds

**Step 3: コミット**

```bash
git add app/api/recommendations/generate-daily/route.ts
git commit -m "feat: DB保存ロジックを実装"
```

---

## Task 6: Pythonスクリプトの簡素化

**Files:**
- Modify: `scripts/github-actions/generate_personal_recommendations.py`

**Step 1: PythonスクリプトをAPI呼び出しのみに変更**

```python
#!/usr/bin/env python3
"""
ユーザーごとのAIおすすめ銘柄生成スクリプト

TypeScript API を呼び出すだけのシンプルなスクリプト。
実際のロジックは /api/recommendations/generate-daily に移行済み。
"""

import os
import sys
import requests
from datetime import datetime


def main():
    session = os.environ.get("SESSION", "evening")
    app_url = os.environ.get("APP_URL")
    cron_secret = os.environ.get("CRON_SECRET")

    if not app_url:
        print("Error: APP_URL environment variable not set")
        sys.exit(1)

    if not cron_secret:
        print("Error: CRON_SECRET environment variable not set")
        sys.exit(1)

    print("=" * 60)
    print("User Daily Recommendation Generation (Python -> TypeScript API)")
    print("=" * 60)
    print(f"Time: {datetime.now().isoformat()}")
    print(f"Session: {session}")
    print(f"API URL: {app_url}/api/recommendations/generate-daily")
    print()

    try:
        response = requests.post(
            f"{app_url}/api/recommendations/generate-daily",
            headers={
                "Authorization": f"Bearer {cron_secret}",
                "Content-Type": "application/json",
            },
            json={"session": session},
            timeout=300,  # 5分タイムアウト
        )

        if response.status_code not in [200, 201]:
            print(f"Error: API returned status {response.status_code}")
            print(f"Response: {response.text}")
            sys.exit(1)

        result = response.json()
        print(f"Success: {result.get('processed', 0)} users processed")
        print(f"Failed: {result.get('failed', 0)} users failed")

        if result.get('failed', 0) > 0 and result.get('processed', 0) == 0:
            sys.exit(1)

    except requests.exceptions.Timeout:
        print("Error: Request timed out")
        sys.exit(1)
    except requests.exceptions.RequestException as e:
        print(f"Error: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"Unexpected error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
```

**Step 2: コミット**

```bash
git add scripts/github-actions/generate_personal_recommendations.py
git commit -m "refactor: PythonスクリプトをAPI呼び出しのみに簡素化"
```

---

## Task 7: 動作確認とテスト

**Step 1: ローカルでAPIをテスト**

Run:
```bash
# 開発サーバーを起動
npm run dev

# 別ターミナルでAPIをテスト（CRON_SECRETを設定）
curl -X POST http://localhost:3000/api/recommendations/generate-daily \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"session": "evening"}'
```

Expected: JSON response with `success: true`

**Step 2: DBを確認**

```bash
npx prisma studio
```

Expected: `UserDailyRecommendation` テーブルに新しいレコードが作成されている

**Step 3: 最終コミット**

```bash
git add -A
git commit -m "feat: 日次おすすめ生成の共通プロンプト化を完了"
```

---

## Task 8: PRの作成

**Step 1: リモートにプッシュ**

```bash
git push origin claude/unified-analysis-prompt-VbRjL
```

**Step 2: PRを作成**

```bash
gh pr create --title "feat: 日次おすすめ生成の共通プロンプト化" --body "$(cat <<'EOF'
## Summary
- 日次おすすめ生成をPythonからTypeScript APIに移行
- ポートフォリオ/購入判断と同じ分析データ（財務指標、テクニカル分析）をAIに渡すように統一
- Pythonスクリプトは最小限（API呼び出しのみ）に簡素化

## Changes
- `lib/recommendation-scoring.ts` - スコア計算ロジックをTypeScriptに移植
- `app/api/recommendations/generate-daily/route.ts` - 新規APIエンドポイント
- `scripts/github-actions/generate_personal_recommendations.py` - API呼び出しのみに簡素化

## Test plan
- [ ] ローカルでAPIをテストし、正常にレスポンスが返ることを確認
- [ ] DBに`UserDailyRecommendation`レコードが作成されることを確認
- [ ] AIの出力にテクニカル分析の内容が含まれていることを確認

Fixes KOH-XXX
EOF
)"
```

---

## Summary

| Task | 内容 | 所要時間目安 |
|------|------|-------------|
| 1 | スコア計算ロジックの移植 | 15分 |
| 2 | APIエンドポイントの基本構造 | 10分 |
| 3 | ユーザー処理ロジックの実装 | 20分 |
| 4 | AI選定ロジックの実装 | 15分 |
| 5 | DB保存ロジックの実装 | 10分 |
| 6 | Pythonスクリプトの簡素化 | 5分 |
| 7 | 動作確認とテスト | 15分 |
| 8 | PRの作成 | 5分 |
