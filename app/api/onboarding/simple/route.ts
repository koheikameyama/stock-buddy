import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function saveRecommendationLog(params: {
  userId: string | null | undefined
  budget: number
  period: string
  riskTolerance: string
  targetStockCount: number
  candidateStocks: number
  affordableStocks: number
  selectedStocks: number
  totalAmount: number
  budgetUsageRate: number
  stocks: Array<{
    name: string
    ticker: string
    price: number
    quantity: number
    total: number
    score: number
  }>
  prompt?: string
}) {
  // ユーザーIDを取得（メールアドレスから）
  let userId: string | null = null
  if (params.userId) {
    const user = await prisma.user.findUnique({
      where: { email: params.userId },
      select: { id: true },
    })
    userId = user?.id || null
  }

  await prisma.recommendationLog.create({
    data: {
      userId,
      budget: params.budget,
      period: params.period,
      riskTolerance: params.riskTolerance,
      targetStockCount: params.targetStockCount,
      candidateStocks: params.candidateStocks,
      affordableStocks: params.affordableStocks,
      selectedStocks: params.selectedStocks,
      totalAmount: params.totalAmount,
      budgetUsageRate: params.budgetUsageRate,
      stocks: params.stocks,
      prompt: params.prompt,
    },
  })
}

/**
 * Simplified Onboarding API
 *
 * Returns a single best-fit investment plan based on:
 * - Budget
 * - Investment period
 * - Risk tolerance (auto-determined from period)
 */
export async function POST(request: Request) {
  try {
    const session = await auth()

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { budget, investmentPeriod, riskTolerance } = body

    if (!budget || !investmentPeriod || !riskTolerance) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      )
    }

    // Fetch top stocks based on user preferences
    const candidateStocks = await getRecommendedStocks(budget, investmentPeriod, riskTolerance)

    // 予算内に収まるように銘柄を選択（期間も考慮）
    const selectionResult = selectStocksWithinBudget(candidateStocks, budget, investmentPeriod)
    const selectedStocks = selectionResult.stocks

    // Generate a single best plan
    const plan = {
      name: getPlanName(riskTolerance, investmentPeriod),
      description: getPlanDescription(riskTolerance, investmentPeriod),
      expectedReturn: getExpectedReturn(riskTolerance),
      riskLevel: getRiskLevelText(riskTolerance),
      strategy: getStrategy(riskTolerance, investmentPeriod),
      stocks: selectedStocks.map((stock) => ({
        tickerCode: stock.tickerCode,
        name: stock.name,
        recommendedPrice: stock.currentPrice,
        quantity: stock.quantity,
        reason: generateReason(stock, riskTolerance),
      })),
    }

    // ログを保存（非同期、エラーでも処理は継続）
    saveRecommendationLog({
      userId: session.user.email,
      budget,
      period: investmentPeriod,
      riskTolerance,
      targetStockCount: selectionResult.targetStockCount,
      candidateStocks: candidateStocks.length,
      affordableStocks: selectionResult.affordableStocks,
      selectedStocks: selectedStocks.length,
      totalAmount: selectionResult.totalAmount,
      budgetUsageRate: selectionResult.budgetUsageRate,
      stocks: selectedStocks.map(stock => ({
        name: stock.name,
        ticker: stock.tickerCode,
        price: stock.currentPrice,
        quantity: stock.quantity,
        total: stock.currentPrice * stock.quantity,
        score: stock.score,
      })),
    }).catch(err => console.error('Failed to save recommendation log:', err))

    return NextResponse.json({ plan })
  } catch (error) {
    console.error("Error in simple onboarding:", error)
    return NextResponse.json(
      { error: "Failed to generate recommendation" },
      { status: 500 }
    )
  } finally {
    await prisma.$disconnect()
  }
}

async function getRecommendedStocks(
  budget: number,
  period: string,
  riskTolerance: string
) {
  // Base query for suitable stocks
  const stocks = await prisma.stock.findMany({
    include: {
      prices: {
        orderBy: { date: "desc" },
        take: 1,
      },
    },
  })

  // Filter and score stocks based on user preferences
  const scoredStocks = stocks
    .filter((stock) => {
      // Must have recent price data
      if (!stock.prices || stock.prices.length === 0) return false

      const currentPrice = Number(stock.prices[0].close)

      // Must be affordable (at least 100 shares - 単元株)
      if (currentPrice * 100 > budget) return false

      return true
    })
    .map((stock) => {
      let score = 0
      const currentPrice = Number(stock.prices[0].close)

      // Score based on risk tolerance
      if (riskTolerance === "low" && stock.stabilityScore) {
        score += stock.stabilityScore * 1.5
      }
      if (riskTolerance === "medium") {
        score += (stock.growthScore || 0) + (stock.stabilityScore || 0)
      }
      if (riskTolerance === "high" && stock.growthScore) {
        score += stock.growthScore * 1.5
      }

      // Score based on period
      if (period === "long" && stock.stabilityScore) {
        score += stock.stabilityScore * 0.5
      }
      if (period === "short" && stock.liquidityScore) {
        score += stock.liquidityScore * 0.5
      }

      // Boost beginner-friendly stocks
      if (stock.beginnerScore) {
        score += stock.beginnerScore * 0.3
      }

      return {
        ...stock,
        currentPrice,
        score,
      }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 50) // Top 50 candidates (様々な株価帯から選べるように多めに取得)

  return scoredStocks
}

function selectStocksWithinBudget(
  stocks: Array<{ currentPrice: number; [key: string]: any }>,
  budget: number,
  period: string
): {
  stocks: Array<{ currentPrice: number; quantity: number; [key: string]: any }>;
  targetStockCount: number;
  affordableStocks: number;
  totalAmount: number;
  budgetUsageRate: number;
} {
  // 投資期間と予算に応じて目標銘柄数を決定
  let targetStockCount: number

  if (period === "long") {
    // 長期: リスク分散を重視
    targetStockCount = budget >= 500000 ? 5 : budget >= 300000 ? 4 : 3
  } else if (period === "medium") {
    // 中期: バランス重視
    targetStockCount = budget >= 500000 ? 4 : budget >= 300000 ? 3 : 2
  } else {
    // 短期: 機動性重視で少数精鋭
    targetStockCount = budget >= 500000 ? 3 : 2
  }

  console.log('=== selectStocksWithinBudget ===')
  console.log('Budget:', budget)
  console.log('Period:', period)
  console.log('Target stock count:', targetStockCount)

  // 目標銘柄数分の予算配分を計算
  // 均等配分を基本とし、購入可能な銘柄を選択
  const budgetPerStock = budget / targetStockCount
  console.log('Budget per stock:', budgetPerStock)

  // 購入可能な銘柄を選択（100株以上買える銘柄のみ）
  const affordableStocks = stocks.filter(stock => {
    const quantity = Math.floor(budgetPerStock / stock.currentPrice / 100) * 100
    return quantity >= 100
  })

  console.log('Total candidate stocks:', stocks.length)
  console.log('Affordable stocks:', affordableStocks.length)

  const result = []
  let remainingBudget = budget

  // 購入可能な銘柄から、スコアの高い順に目標銘柄数まで選択
  const stocksToSelect = Math.min(affordableStocks.length, targetStockCount)
  console.log('Stocks to select:', stocksToSelect)

  for (let i = 0; i < stocksToSelect; i++) {
    const stock = affordableStocks[i]
    const price = stock.currentPrice

    // 均等配分で購入
    let quantity = Math.floor(budgetPerStock / price / 100) * 100
    const totalCost = quantity * price

    console.log(`  ${i+1}. ${stock.name}: ${quantity}株 × ¥${price} = ¥${totalCost.toLocaleString()}`)

    result.push({
      ...stock,
      quantity,
    })
    remainingBudget -= totalCost
  }

  console.log('Result stocks:', result.length)
  console.log('================================')

  // 残った予算を既存の銘柄に追加配分（100株単位、スコアの高い順）
  if (remainingBudget > budget * 0.05 && result.length > 0) {
    for (const selectedStock of result) {
      const additionalQuantity = Math.floor(remainingBudget / selectedStock.currentPrice / 100) * 100

      if (additionalQuantity >= 100) {
        selectedStock.quantity += additionalQuantity
        remainingBudget -= additionalQuantity * selectedStock.currentPrice

        // 予算の5%未満になったら終了
        if (remainingBudget < budget * 0.05) {
          break
        }
      }
    }
  }

  // 最低でも2銘柄は確保したい
  if (result.length < 2 && stocks.length >= 2) {
    // 予算を2銘柄に分散してリトライ（60:40配分）
    const retryResult = []
    const budgets = [budget * 0.6, budget * 0.4]
    let retryRemaining = budget

    for (let i = 0; i < Math.min(2, stocks.length); i++) {
      const stock = stocks[i]
      const price = stock.currentPrice
      const quantity = Math.floor(budgets[i] / price / 100) * 100

      if (quantity >= 100) {
        retryResult.push({
          ...stock,
          quantity,
        })
        retryRemaining -= quantity * price
      }
    }

    if (retryResult.length >= 2) {
      const totalAmount = budget - retryRemaining
      return {
        stocks: retryResult,
        targetStockCount,
        affordableStocks: affordableStocks.length,
        totalAmount,
        budgetUsageRate: (totalAmount / budget) * 100,
      }
    }
  }

  const totalAmount = budget - remainingBudget
  return {
    stocks: result,
    targetStockCount,
    affordableStocks: affordableStocks.length,
    totalAmount,
    budgetUsageRate: (totalAmount / budget) * 100,
  }
}

function getPlanName(risk: string, period: string): string {
  if (risk === "low") return "安定重視プラン"
  if (risk === "high" && period === "long") return "成長重視プラン"
  if (period === "short") return "バランスプラン"
  return "長期成長プラン"
}

function getPlanDescription(risk: string, period: string): string {
  if (risk === "low") {
    return "初心者におすすめ。安定した大企業を中心に、リスクを抑えた投資を始めましょう。"
  }
  if (risk === "high" && period === "long") {
    return "長期で大きく育てたい方向け。成長性の高い銘柄で、将来の大きなリターンを目指しましょう。"
  }
  if (period === "short") {
    return "短期でも安心。流動性が高く、いつでも売買しやすい銘柄を選びました。"
  }
  return "長期でじっくり育てるプラン。分散投資で安定した成長を目指します。"
}

function getExpectedReturn(risk: string): string {
  if (risk === "low") return "年3-5%"
  if (risk === "high") return "年8-15%"
  return "年5-8%"
}

function getRiskLevelText(risk: string): string {
  if (risk === "low") return "低"
  if (risk === "high") return "高"
  return "中"
}

function getStrategy(risk: string, period: string): string {
  if (risk === "low") {
    return "安定した配当を出す大企業を中心に、リスクを最小限に抑えます。"
  }
  if (risk === "high" && period === "long") {
    return "成長性の高い企業に投資し、長期保有で大きなリターンを狙います。"
  }
  if (period === "short") {
    return "流動性の高い銘柄で、短期でも売買しやすいポートフォリオを構築します。"
  }
  return "バランスの取れた分散投資で、安定した成長を目指します。"
}

function generateReason(stock: any, riskTolerance: string): string {
  const reasons = []

  if (riskTolerance === "low" && stock.stabilityScore && stock.stabilityScore > 70) {
    reasons.push("安定性が高く、初心者にもおすすめです")
  }

  if (riskTolerance === "high" && stock.growthScore && stock.growthScore > 70) {
    reasons.push("成長性が高く、将来の値上がりが期待できます")
  }

  if (stock.dividendScore && stock.dividendScore > 60) {
    reasons.push("配当利回りが良く、定期的な収入が見込めます")
  }

  if (stock.beginnerScore && stock.beginnerScore > 70) {
    reasons.push("初心者におすすめの優良銘柄です")
  }

  if (stock.sector) {
    reasons.push(`${stock.sector}セクターの代表的な企業です`)
  }

  if (reasons.length === 0) {
    return "バランスの取れた優良銘柄です"
  }

  return reasons.join("。") + "。"
}
