import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { fetchStockPrices } from "@/lib/stock-price-fetcher"
import { calculatePortfolioFromTransactions } from "@/lib/portfolio-calculator"
import { OpenAI } from "openai"
import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"

dayjs.extend(utc)
dayjs.extend(timezone)

// 型定義
export interface MetricAnalysis {
  value: string
  explanation: string
  evaluation: string
  evaluationType: "good" | "neutral" | "warning"
  action: string
}

export interface MetricsAnalysis {
  sectorDiversification: MetricAnalysis
  profitLoss: MetricAnalysis
  volatility: MetricAnalysis
}

export interface ActionSuggestion {
  priority: number
  title: string
  description: string
  type: "diversify" | "rebalance" | "hold" | "take_profit" | "cut_loss"
}

export interface WatchlistStockSimulation {
  stockId: string
  stockName: string
  tickerCode: string
  sector: string | null
  predictedImpact: {
    sectorConcentrationChange: number
    diversificationScore: "改善" | "悪化" | "変化なし"
    recommendation: string
  }
}

export interface WatchlistSimulation {
  stocks: WatchlistStockSimulation[]
}

export interface OverallAnalysisResult {
  hasAnalysis: boolean
  reason?: "not_enough_stocks"
  analyzedAt?: string
  isToday?: boolean
  portfolioCount?: number
  watchlistCount?: number

  // 数値指標
  metrics?: {
    sectorConcentration: number | null
    sectorCount: number | null
    totalValue: number
    totalCost: number
    unrealizedGain: number
    unrealizedGainPercent: number
    portfolioVolatility: number | null
  }

  // AI生成
  overallSummary?: string
  overallStatus?: string
  overallStatusType?: string
  metricsAnalysis?: MetricsAnalysis
  actionSuggestions?: ActionSuggestion[]
  watchlistSimulation?: WatchlistSimulation | null
}

interface SectorBreakdown {
  sector: string
  count: number
  value: number
  percentage: number
}

interface PortfolioStockData {
  stockId: string
  tickerCode: string
  name: string
  sector: string | null
  quantity: number
  averagePrice: number
  currentPrice: number
  value: number
  volatility: number | null
  // 業績データ
  isProfitable: boolean | null
  profitTrend: string | null
  revenueGrowth: number | null
  netIncomeGrowth: number | null
  eps: number | null
}

interface WatchlistStockData {
  stockId: string
  tickerCode: string
  name: string
  sector: string | null
  // 業績データ
  isProfitable: boolean | null
  profitTrend: string | null
  revenueGrowth: number | null
  netIncomeGrowth: number | null
  eps: number | null
}

function getOpenAIClient() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })
}

/**
 * セクター構成を計算
 */
function calculateSectorBreakdown(stocks: PortfolioStockData[]): SectorBreakdown[] {
  const sectorMap = new Map<string, { count: number; value: number }>()
  const totalValue = stocks.reduce((sum, s) => sum + s.value, 0)

  for (const stock of stocks) {
    const sector = stock.sector || "その他"
    const current = sectorMap.get(sector) || { count: 0, value: 0 }
    sectorMap.set(sector, {
      count: current.count + 1,
      value: current.value + stock.value,
    })
  }

  return Array.from(sectorMap.entries())
    .map(([sector, data]) => ({
      sector,
      count: data.count,
      value: data.value,
      percentage: totalValue > 0 ? (data.value / totalValue) * 100 : 0,
    }))
    .sort((a, b) => b.percentage - a.percentage)
}

/**
 * ポートフォリオ全体のボラティリティを計算（加重平均）
 */
function calculatePortfolioVolatility(stocks: PortfolioStockData[]): number | null {
  const totalValue = stocks.reduce((sum, s) => sum + s.value, 0)
  if (totalValue <= 0) return null

  let weightedVolatility = 0
  let hasVolatility = false

  for (const stock of stocks) {
    if (stock.volatility != null) {
      const weight = stock.value / totalValue
      weightedVolatility += stock.volatility * weight
      hasVolatility = true
    }
  }

  return hasVolatility ? weightedVolatility : null
}

/**
 * ウォッチリスト銘柄追加時のセクター集中度変化をシミュレート
 */
function simulateWatchlistImpact(
  currentStocks: PortfolioStockData[],
  watchlistStock: WatchlistStockData,
  currentMaxConcentration: number
): WatchlistStockSimulation["predictedImpact"] {
  // 仮にウォッチリスト銘柄を追加した場合の影響を計算
  // 簡易計算: 銘柄数が増えると集中度は下がる傾向
  const currentSectors = new Set(currentStocks.map(s => s.sector || "その他"))
  const watchlistSector = watchlistStock.sector || "その他"
  const isNewSector = !currentSectors.has(watchlistSector)

  // 新しいセクターなら分散効果あり
  const estimatedChange = isNewSector
    ? -currentMaxConcentration * 0.15 // 15%程度改善
    : -currentMaxConcentration * 0.05 // 5%程度改善

  const diversificationScore = estimatedChange < -5
    ? "改善"
    : estimatedChange > 5
      ? "悪化"
      : "変化なし"

  const recommendation = isNewSector
    ? `${watchlistSector}セクターを追加することで分散効果が期待できます`
    : `同じセクターですが、銘柄分散の効果はあります`

  return {
    sectorConcentrationChange: Math.round(estimatedChange * 10) / 10,
    diversificationScore,
    recommendation,
  }
}

/**
 * OpenAI APIで総評分析を生成
 */
async function generateAnalysisWithAI(
  portfolioStocks: PortfolioStockData[],
  watchlistStocks: WatchlistStockData[],
  sectorBreakdown: SectorBreakdown[],
  totalValue: number,
  totalCost: number,
  unrealizedGain: number,
  unrealizedGainPercent: number,
  portfolioVolatility: number | null
): Promise<{
  overallSummary: string
  overallStatus: string
  overallStatusType: string
  metricsAnalysis: MetricsAnalysis
  actionSuggestions: ActionSuggestion[]
  watchlistSimulation: WatchlistSimulation | null
}> {
  const openai = getOpenAIClient()

  const sectorBreakdownText = sectorBreakdown
    .map(s => `${s.sector}: ${s.percentage.toFixed(1)}%（${s.count}銘柄）`)
    .join("\n")

  const formatEarningsInfo = (s: { isProfitable: boolean | null; profitTrend: string | null; netIncomeGrowth: number | null; eps: number | null }) => {
    if (s.isProfitable === null) return ""
    const status = s.isProfitable ? "黒字" : "⚠️赤字"
    const trend = s.profitTrend === "increasing" ? "増益" : s.profitTrend === "decreasing" ? "減益" : "横ばい"
    const growth = s.netIncomeGrowth !== null ? `${s.netIncomeGrowth >= 0 ? "+" : ""}${s.netIncomeGrowth.toFixed(1)}%` : ""
    const epsInfo = s.eps !== null ? `EPS: ¥${s.eps.toFixed(2)}` : ""
    return `【業績: ${status}・${trend}${growth ? `（前年比${growth}）` : ""}${epsInfo ? ` / ${epsInfo}` : ""}】`
  }

  // リスクフィルタリング: 赤字銘柄を特定
  const unprofitablePortfolioStocks = portfolioStocks.filter(s => s.isProfitable === false)
  const unprofitableWatchlistStocks = watchlistStocks.filter(s => s.isProfitable === false)

  const portfolioStocksText = portfolioStocks
    .map(s => `- ${s.name}（${s.tickerCode}）: ${s.sector || "その他"}、評価額 ¥${Math.round(s.value).toLocaleString()} ${formatEarningsInfo(s)}`)
    .join("\n")

  const watchlistStocksText = watchlistStocks.length > 0
    ? watchlistStocks.map(s => `- ${s.name}（${s.tickerCode}）: ${s.sector || "その他"} ${formatEarningsInfo(s)}`).join("\n")
    : "なし"

  // 業績サマリー
  const profitableCount = portfolioStocks.filter(s => s.isProfitable === true).length
  const increasingCount = portfolioStocks.filter(s => s.profitTrend === "increasing").length
  const decreasingCount = portfolioStocks.filter(s => s.profitTrend === "decreasing").length
  const hasEarningsData = portfolioStocks.some(s => s.isProfitable !== null)

  const maxSectorConcentration = sectorBreakdown.length > 0 ? sectorBreakdown[0].percentage : 0

  const prompt = `あなたは投資初心者向けのAIコーチです。
以下のポートフォリオ情報を分析し、総評と指標別の解説を提供してください。

【ポートフォリオ情報】
- 保有銘柄数: ${portfolioStocks.length}銘柄
- ウォッチリスト銘柄数: ${watchlistStocks.length}銘柄
- 総資産額: ¥${Math.round(totalValue).toLocaleString()}
- 総投資額: ¥${Math.round(totalCost).toLocaleString()}
- 含み損益: ¥${Math.round(unrealizedGain).toLocaleString()}（${unrealizedGainPercent >= 0 ? "+" : ""}${unrealizedGainPercent.toFixed(1)}%）

【保有銘柄】
${portfolioStocksText}

【セクター構成】
${sectorBreakdownText}

【ボラティリティ】
- ポートフォリオ全体: ${portfolioVolatility != null ? portfolioVolatility.toFixed(1) + "%" : "データなし"}

【業績状況】
${hasEarningsData ? `- 黒字銘柄: ${profitableCount}/${portfolioStocks.length}銘柄
- 増益傾向: ${increasingCount}銘柄
- 減益傾向: ${decreasingCount}銘柄` : "業績データなし"}

【⚠️ リスク警告: 赤字銘柄】
${unprofitablePortfolioStocks.length > 0
  ? `ポートフォリオ: ${unprofitablePortfolioStocks.map(s => s.name).join("、")}（${unprofitablePortfolioStocks.length}銘柄が赤字）`
  : "ポートフォリオ: 赤字銘柄なし"}
${unprofitableWatchlistStocks.length > 0
  ? `ウォッチリスト: ${unprofitableWatchlistStocks.map(s => s.name).join("、")}（${unprofitableWatchlistStocks.length}銘柄が赤字）`
  : "ウォッチリスト: 赤字銘柄なし"}

【ウォッチリスト銘柄】
${watchlistStocksText}

【回答形式】
以下のJSON形式で回答してください。

{
  "overallSummary": "全体の総評を初心者向けに2-3文で。専門用語を使う場合は括弧で解説を添える",
  "overallStatus": "好調/順調/様子見/注意/要確認のいずれか",
  "overallStatusType": "excellent/good/neutral/caution/warningのいずれか",
  "metricsAnalysis": {
    "sectorDiversification": {
      "value": "最も比率の高いセクターと比率（例: 67%（テクノロジー））",
      "explanation": "セクター分散の意味と重要性を中学生でも分かる言葉で1-2文",
      "evaluation": "評価（優秀/適正/注意など）",
      "evaluationType": "good/neutral/warning",
      "action": "具体的な改善アクション（なければ「現状維持で問題ありません」）"
    },
    "profitLoss": {
      "value": "含み損益額と率（例: +12,500円（+8.5%））",
      "explanation": "損益状況の解説を1-2文",
      "evaluation": "評価（好調/順調/様子見/注意など）",
      "evaluationType": "good/neutral/warning",
      "action": "アドバイス"
    },
    "volatility": {
      "value": "ボラティリティ値（例: 18.5%）",
      "explanation": "ボラティリティの意味と現在の評価を1-2文",
      "evaluation": "評価（安定/普通/やや高め/高めなど）",
      "evaluationType": "good/neutral/warning",
      "action": "アドバイス"
    }
  },
  "actionSuggestions": [
    {
      "priority": 1,
      "title": "最も重要なアクションのタイトル",
      "description": "具体的な説明",
      "type": "diversify/rebalance/hold/take_profit/cut_loss"
    }
  ],
  "watchlistSimulation": ${watchlistStocks.length > 0 ? `{
    "stocks": [
      ${watchlistStocks.map(ws => `{
        "stockId": "${ws.stockId}",
        "stockName": "${ws.name}",
        "tickerCode": "${ws.tickerCode}",
        "sector": "${ws.sector || "その他"}",
        "predictedImpact": {
          "sectorConcentrationChange": -5.0,
          "diversificationScore": "改善/悪化/変化なし",
          "recommendation": "この銘柄を追加した場合の具体的なアドバイス"
        }
      }`).join(",")}
    ]
  }` : "null"}
}

【表現の指針】
- 専門用語には必ず解説を添える（例：「ボラティリティ（値動きの激しさ）」）
- 数値の基準を具体的に説明する（例：「20%以下は比較的安定」）
- 行動につながる具体的なアドバイスを含める
- ネガティブな内容も前向きな表現で伝える`

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "あなたは投資初心者向けのAIコーチです。専門用語を使う場合は必ず括弧内に解説を添えてください。JSONのみで回答してください。",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: 0.7,
    response_format: { type: "json_object" },
  })

  const content = response.choices[0]?.message?.content
  if (!content) {
    throw new Error("OpenAI response is empty")
  }

  const result = JSON.parse(content)

  return {
    overallSummary: result.overallSummary,
    overallStatus: result.overallStatus,
    overallStatusType: result.overallStatusType,
    metricsAnalysis: result.metricsAnalysis,
    actionSuggestions: result.actionSuggestions || [],
    watchlistSimulation: result.watchlistSimulation,
  }
}

/**
 * ユーザーのポートフォリオ総評分析を取得
 */
export async function getPortfolioOverallAnalysis(userId: string): Promise<OverallAnalysisResult> {
  // ポートフォリオとウォッチリストを取得
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      portfolioStocks: {
        include: {
          stock: true,
          transactions: {
            orderBy: { transactionDate: "asc" },
          },
        },
      },
      watchlistStocks: {
        include: {
          stock: true,
        },
      },
      portfolioOverallAnalysis: true,
    },
  })

  if (!user) {
    return { hasAnalysis: false, reason: "not_enough_stocks" }
  }

  const portfolioCount = user.portfolioStocks.length
  const watchlistCount = user.watchlistStocks.length
  const totalCount = portfolioCount + watchlistCount

  // 3銘柄未満の場合
  if (totalCount < 3) {
    return {
      hasAnalysis: false,
      reason: "not_enough_stocks",
      portfolioCount,
      watchlistCount,
    }
  }

  // 既存の分析があるか確認
  if (user.portfolioOverallAnalysis) {
    const analysis = user.portfolioOverallAnalysis
    const todayJST = dayjs().tz("Asia/Tokyo").startOf("day")
    const analysisJST = dayjs(analysis.analyzedAt).tz("Asia/Tokyo").startOf("day")
    const isToday = analysisJST.isSame(todayJST, "day")

    return {
      hasAnalysis: true,
      analyzedAt: analysis.analyzedAt.toISOString(),
      isToday,
      portfolioCount,
      watchlistCount,
      metrics: {
        sectorConcentration: analysis.sectorConcentration ? Number(analysis.sectorConcentration) : null,
        sectorCount: analysis.sectorCount,
        totalValue: analysis.totalValue ? Number(analysis.totalValue) : 0,
        totalCost: analysis.totalCost ? Number(analysis.totalCost) : 0,
        unrealizedGain: analysis.unrealizedGain ? Number(analysis.unrealizedGain) : 0,
        unrealizedGainPercent: analysis.unrealizedGainPercent ? Number(analysis.unrealizedGainPercent) : 0,
        portfolioVolatility: analysis.portfolioVolatility ? Number(analysis.portfolioVolatility) : null,
      },
      overallSummary: analysis.overallSummary,
      overallStatus: analysis.overallStatus,
      overallStatusType: analysis.overallStatusType,
      metricsAnalysis: analysis.metricsAnalysis as unknown as MetricsAnalysis,
      actionSuggestions: analysis.actionSuggestions as unknown as ActionSuggestion[],
      watchlistSimulation: analysis.watchlistSimulation as unknown as WatchlistSimulation | null,
    }
  }

  // 分析がない場合
  return {
    hasAnalysis: false,
    portfolioCount,
    watchlistCount,
  }
}

/**
 * ポートフォリオ総評分析を生成
 */
export async function generatePortfolioOverallAnalysis(userId: string): Promise<OverallAnalysisResult> {
  // ポートフォリオとウォッチリストを取得
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      portfolioStocks: {
        include: {
          stock: true,
          transactions: {
            orderBy: { transactionDate: "asc" },
          },
        },
      },
      watchlistStocks: {
        include: {
          stock: true,
        },
      },
    },
  })

  if (!user) {
    return { hasAnalysis: false, reason: "not_enough_stocks" }
  }

  const portfolioCount = user.portfolioStocks.length
  const watchlistCount = user.watchlistStocks.length
  const totalCount = portfolioCount + watchlistCount

  // 3銘柄未満の場合
  if (totalCount < 3) {
    return {
      hasAnalysis: false,
      reason: "not_enough_stocks",
      portfolioCount,
      watchlistCount,
    }
  }

  // 株価を取得（業績データはDBのStockモデルから取得済み）
  const allTickerCodes = [
    ...user.portfolioStocks.map(ps => ps.stock.tickerCode),
    ...user.watchlistStocks.map(ws => ws.stock.tickerCode),
  ]
  const prices = await fetchStockPrices(allTickerCodes)
  const priceMap = new Map(prices.map(p => [p.tickerCode, p.currentPrice]))

  // ポートフォリオデータを構築
  const portfolioStocksData: PortfolioStockData[] = []
  let totalValue = 0
  let totalCost = 0

  for (const ps of user.portfolioStocks) {
    const { quantity, averagePurchasePrice } = calculatePortfolioFromTransactions(ps.transactions)
    if (quantity <= 0) continue

    const currentPrice = priceMap.get(ps.stock.tickerCode) ?? 0
    const value = currentPrice * quantity
    const cost = averagePurchasePrice.toNumber() * quantity

    // 業績データはDBのStockモデルから取得
    portfolioStocksData.push({
      stockId: ps.stockId,
      tickerCode: ps.stock.tickerCode,
      name: ps.stock.name,
      sector: ps.stock.sector,
      quantity,
      averagePrice: averagePurchasePrice.toNumber(),
      currentPrice,
      value,
      volatility: ps.stock.volatility ? Number(ps.stock.volatility) : null,
      isProfitable: ps.stock.isProfitable ?? null,
      profitTrend: ps.stock.profitTrend ?? null,
      revenueGrowth: ps.stock.revenueGrowth ? Number(ps.stock.revenueGrowth) : null,
      netIncomeGrowth: ps.stock.netIncomeGrowth ? Number(ps.stock.netIncomeGrowth) : null,
      eps: ps.stock.eps ? Number(ps.stock.eps) : null,
    })

    totalValue += value
    totalCost += cost
  }

  // ウォッチリストデータを構築（業績データはDBのStockモデルから取得）
  const watchlistStocksData: WatchlistStockData[] = user.watchlistStocks.map(ws => ({
    stockId: ws.stockId,
    tickerCode: ws.stock.tickerCode,
    name: ws.stock.name,
    sector: ws.stock.sector,
    isProfitable: ws.stock.isProfitable ?? null,
    profitTrend: ws.stock.profitTrend ?? null,
    revenueGrowth: ws.stock.revenueGrowth ? Number(ws.stock.revenueGrowth) : null,
    netIncomeGrowth: ws.stock.netIncomeGrowth ? Number(ws.stock.netIncomeGrowth) : null,
    eps: ws.stock.eps ? Number(ws.stock.eps) : null,
  }))

  // 指標を計算
  const sectorBreakdown = calculateSectorBreakdown(portfolioStocksData)
  const portfolioVolatility = calculatePortfolioVolatility(portfolioStocksData)
  const unrealizedGain = totalValue - totalCost
  const unrealizedGainPercent = totalCost > 0 ? (unrealizedGain / totalCost) * 100 : 0
  const maxSectorConcentration = sectorBreakdown.length > 0 ? sectorBreakdown[0].percentage : 0

  // AI分析を生成
  const aiResult = await generateAnalysisWithAI(
    portfolioStocksData,
    watchlistStocksData,
    sectorBreakdown,
    totalValue,
    totalCost,
    unrealizedGain,
    unrealizedGainPercent,
    portfolioVolatility
  )

  // DBに保存
  const now = dayjs().toDate()
  await prisma.portfolioOverallAnalysis.upsert({
    where: { userId },
    create: {
      userId,
      analyzedAt: now,
      sectorConcentration: maxSectorConcentration,
      sectorCount: sectorBreakdown.length,
      totalValue,
      totalCost,
      unrealizedGain,
      unrealizedGainPercent,
      portfolioVolatility,
      overallSummary: aiResult.overallSummary,
      overallStatus: aiResult.overallStatus,
      overallStatusType: aiResult.overallStatusType,
      metricsAnalysis: aiResult.metricsAnalysis as unknown as Prisma.InputJsonValue,
      actionSuggestions: aiResult.actionSuggestions as unknown as Prisma.InputJsonValue,
      watchlistSimulation: aiResult.watchlistSimulation
        ? (aiResult.watchlistSimulation as unknown as Prisma.InputJsonValue)
        : Prisma.DbNull,
    },
    update: {
      analyzedAt: now,
      sectorConcentration: maxSectorConcentration,
      sectorCount: sectorBreakdown.length,
      totalValue,
      totalCost,
      unrealizedGain,
      unrealizedGainPercent,
      portfolioVolatility,
      overallSummary: aiResult.overallSummary,
      overallStatus: aiResult.overallStatus,
      overallStatusType: aiResult.overallStatusType,
      metricsAnalysis: aiResult.metricsAnalysis as unknown as Prisma.InputJsonValue,
      actionSuggestions: aiResult.actionSuggestions as unknown as Prisma.InputJsonValue,
      watchlistSimulation: aiResult.watchlistSimulation
        ? (aiResult.watchlistSimulation as unknown as Prisma.InputJsonValue)
        : Prisma.DbNull,
    },
  })

  return {
    hasAnalysis: true,
    analyzedAt: now.toISOString(),
    isToday: true,
    portfolioCount,
    watchlistCount,
    metrics: {
      sectorConcentration: maxSectorConcentration,
      sectorCount: sectorBreakdown.length,
      totalValue,
      totalCost,
      unrealizedGain,
      unrealizedGainPercent,
      portfolioVolatility,
    },
    overallSummary: aiResult.overallSummary,
    overallStatus: aiResult.overallStatus,
    overallStatusType: aiResult.overallStatusType,
    metricsAnalysis: aiResult.metricsAnalysis,
    actionSuggestions: aiResult.actionSuggestions,
    watchlistSimulation: aiResult.watchlistSimulation,
  }
}
