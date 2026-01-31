import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

/**
 * Portfolio Stock Analysis Generator
 *
 * Generates user-specific analysis for all portfolio holdings
 * Takes into account user's purchase price, quantity, and investment goals
 */
export async function POST() {
  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Get all users with portfolios
    const users = await prisma.user.findMany({
      include: {
        portfolio: {
          include: {
            stocks: {
              include: {
                stock: true,
              },
            },
          },
        },
        settings: true,
      },
    })

    let generatedCount = 0

    for (const user of users) {
      if (!user.portfolio || user.portfolio.stocks.length === 0) {
        continue
      }

      for (const portfolioStock of user.portfolio.stocks) {
        // Skip if analysis already exists for today
        const existingAnalysis = await prisma.portfolioStockAnalysis.findUnique({
          where: {
            portfolioStockId_date: {
              portfolioStockId: portfolioStock.id,
              date: today,
            },
          },
        })

        if (existingAnalysis) {
          continue
        }

        // Get latest price
        const latestPrice = await prisma.stockPrice.findFirst({
          where: { stockId: portfolioStock.stockId },
          orderBy: { date: 'desc' },
        })

        if (!latestPrice) {
          console.warn(`No price data for ${portfolioStock.stock.tickerCode}`)
          continue
        }

        const currentPrice = Number(latestPrice.close)
        const averagePrice = Number(portfolioStock.averagePrice)
        const quantity = portfolioStock.quantity
        const currentValue = currentPrice * quantity
        const totalCost = averagePrice * quantity
        const gainLoss = currentValue - totalCost
        const gainLossPct = (gainLoss / totalCost) * 100

        // Get previous day price for trend analysis
        const previousPrice = await prisma.stockPrice.findFirst({
          where: {
            stockId: portfolioStock.stockId,
            date: { lt: latestPrice.date },
          },
          orderBy: { date: 'desc' },
        })

        const priceChangePct = previousPrice
          ? ((currentPrice - Number(previousPrice.close)) / Number(previousPrice.close)) * 100
          : 0

        // Generate AI analysis
        const analysis = await generatePortfolioStockAnalysis({
          stock: portfolioStock.stock,
          currentPrice,
          averagePrice,
          quantity,
          gainLossPct,
          priceChangePct,
          userSettings: user.settings,
          isSimulation: portfolioStock.isSimulation,
        })

        // Create portfolio stock analysis
        await prisma.portfolioStockAnalysis.create({
          data: {
            userId: user.id,
            portfolioStockId: portfolioStock.id,
            date: today,
            currentPrice,
            currentValue,
            gainLoss,
            gainLossPct,
            action: analysis.action,
            analysis: analysis.text,
            reasoning: analysis.reasoning,
          },
        })

        generatedCount++
      }
    }

    return NextResponse.json({
      success: true,
      message: `Generated ${generatedCount} portfolio stock analyses`,
      generatedCount,
    })
  } catch (error) {
    console.error("Error generating portfolio analyses:", error)
    return NextResponse.json(
      { error: "Failed to generate portfolio analyses" },
      { status: 500 }
    )
  }
}

// Placeholder AI analysis function
async function generatePortfolioStockAnalysis(data: {
  stock: { name: string; tickerCode: string }
  currentPrice: number
  averagePrice: number
  quantity: number
  gainLossPct: number
  priceChangePct: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userSettings: any
  isSimulation: boolean
}) {
  const {
    stock,
    currentPrice,
    averagePrice,
    quantity,
    gainLossPct,
    priceChangePct,
    isSimulation,
  } = data

  // Simple rule-based analysis (will be replaced with Claude API later)
  let action: 'hold' | 'buy_more' | 'sell_partial' = 'hold'

  // Determine action based on gain/loss and price movement
  if (gainLossPct > 20) {
    action = 'sell_partial' // Take some profit
  } else if (gainLossPct < -15) {
    if (priceChangePct > 5) {
      action = 'buy_more' // Averaging down on recovery
    } else {
      action = 'hold' // Wait for recovery
    }
  } else if (gainLossPct > 0 && priceChangePct > 3) {
    action = 'hold' // Keep riding the trend
  }

  const simulationPrefix = isSimulation ? '【シミュレーション】' : ''

  const analysisText = `${simulationPrefix}${stock.name}（${stock.tickerCode}）を${quantity}株保有中です。` +
    `平均取得単価は${averagePrice.toLocaleString()}円、現在価格は${currentPrice.toLocaleString()}円です。` +
    `損益率は${gainLossPct >= 0 ? '+' : ''}${gainLossPct.toFixed(2)}%です。`

  let reasoning = ''
  switch (action) {
    case 'sell_partial':
      reasoning = `利益率が${gainLossPct.toFixed(2)}%と大きくなっています。一部利益確定を検討しても良いタイミングです。`
      break
    case 'buy_more':
      reasoning = `含み損がありますが、最近回復の兆しが見えます。長期投資であれば買い増しのチャンスかもしれません。`
      break
    default:
      reasoning = gainLossPct > 0
        ? `順調に利益が出ています。このまま保有を続けましょう。`
        : `一時的な下落ですが、長期投資なら持ち続けるのが良いでしょう。`
  }

  return {
    action,
    text: analysisText,
    reasoning,
  }
}
