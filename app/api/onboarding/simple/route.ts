import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

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

    // 予算内に収まるように銘柄を選択
    const selectedStocks = selectStocksWithinBudget(candidateStocks, budget)

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
    .slice(0, 20) // Top 20 candidates (予算内に収まる銘柄を選ぶため多めに取得)

  return scoredStocks
}

function selectStocksWithinBudget(
  stocks: Array<{ currentPrice: number; [key: string]: any }>,
  budget: number
): Array<{ currentPrice: number; quantity: number; [key: string]: any }> {
  const result = []
  let remainingBudget = budget

  for (const stock of stocks) {
    const price = stock.currentPrice

    // 100株単位で購入可能な最大株数
    const maxQuantity = Math.floor(remainingBudget / price / 100) * 100

    if (maxQuantity >= 100) {
      // 最低100株購入可能
      result.push({
        ...stock,
        quantity: maxQuantity,
      })
      remainingBudget -= maxQuantity * price

      // 予算の10%以下になったら終了
      if (remainingBudget < budget * 0.1) {
        break
      }
    }

    // 最大5銘柄まで
    if (result.length >= 5) {
      break
    }
  }

  return result
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
