import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

/**
 * Stock Analysis Generator (for Watchlist)
 *
 * Generates analysis for all stocks that are in any user's watchlist
 * Analysis is stock-specific (not user-specific) so can be cached
 */
export async function POST() {
  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Get all unique stocks that are in watchlists
    const watchlistStocks = await prisma.watchlist.findMany({
      select: {
        stockId: true,
        stock: {
          select: {
            id: true,
            tickerCode: true,
            name: true,
            sector: true,
          },
        },
      },
      distinct: ['stockId'],
    })

    let generatedCount = 0

    for (const item of watchlistStocks) {
      const { stock } = item

      // Skip if analysis already exists for today
      const existingAnalysis = await prisma.stockAnalysis.findUnique({
        where: {
          stockId_date: {
            stockId: stock.id,
            date: today,
          },
        },
      })

      if (existingAnalysis) {
        continue
      }

      // Get latest price data
      const latestPrice = await prisma.stockPrice.findFirst({
        where: { stockId: stock.id },
        orderBy: { date: 'desc' },
      })

      if (!latestPrice) {
        console.warn(`No price data for ${stock.tickerCode}`)
        continue
      }

      // Get previous day price for comparison
      const previousPrice = await prisma.stockPrice.findFirst({
        where: {
          stockId: stock.id,
          date: { lt: latestPrice.date },
        },
        orderBy: { date: 'desc' },
      })

      const priceChange = previousPrice
        ? Number(latestPrice.close) - Number(previousPrice.close)
        : 0
      const priceChangePct = previousPrice
        ? (priceChange / Number(previousPrice.close)) * 100
        : 0

      // Get technical indicators
      const indicator = await prisma.stockIndicator.findFirst({
        where: { stockId: stock.id },
        orderBy: { date: 'desc' },
      })

      // Generate AI analysis (placeholder for now)
      const analysis = await generateStockAnalysis({
        stock,
        currentPrice: Number(latestPrice.close),
        priceChange,
        priceChangePct,
        indicator,
      })

      // Create stock analysis
      await prisma.stockAnalysis.create({
        data: {
          stockId: stock.id,
          date: today,
          currentPrice: latestPrice.close,
          priceChange,
          priceChangePct,
          trend: analysis.trend,
          buyTiming: analysis.buyTiming,
          analysis: analysis.text,
          keyPoints: analysis.keyPoints,
        },
      })

      generatedCount++
    }

    return NextResponse.json({
      success: true,
      message: `Generated ${generatedCount} stock analyses`,
      generatedCount,
    })
  } catch (error) {
    console.error("Error generating stock analyses:", error)
    return NextResponse.json(
      { error: "Failed to generate stock analyses" },
      { status: 500 }
    )
  }
}

// Placeholder AI analysis function
async function generateStockAnalysis(data: {
  stock: { name: string; tickerCode: string; sector: string | null }
  currentPrice: number
  priceChange: number
  priceChangePct: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  indicator: any
}) {
  const { stock, currentPrice, priceChange, priceChangePct, indicator } = data

  // Simple rule-based analysis (will be replaced with Claude API later)
  let trend: 'bullish' | 'bearish' | 'neutral' = 'neutral'
  let buyTiming: 'good' | 'wait' | 'avoid' = 'wait'

  // Determine trend based on price movement and RSI
  if (priceChangePct > 2) {
    trend = 'bullish'
  } else if (priceChangePct < -2) {
    trend = 'bearish'
  }

  // Determine buy timing
  if (indicator?.rsi14) {
    const rsi = Number(indicator.rsi14)
    if (rsi < 30) {
      buyTiming = 'good' // Oversold
    } else if (rsi > 70) {
      buyTiming = 'avoid' // Overbought
    }
  }

  const analysisText = `${stock.name}（${stock.tickerCode}）は現在${currentPrice.toLocaleString()}円で取引されています。` +
    `前日比${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)}円（${priceChangePct >= 0 ? '+' : ''}${priceChangePct.toFixed(2)}%）です。` +
    (indicator?.rsi14 ? `RSI（14日）は${Number(indicator.rsi14).toFixed(2)}で、` : '') +
    (buyTiming === 'good' ? '買い時のサインが出ています。' :
     buyTiming === 'avoid' ? '買いを控えた方が良い水準です。' :
     '様子見の状況です。')

  const keyPoints = [
    `現在価格: ${currentPrice.toLocaleString()}円`,
    `前日比: ${priceChangePct >= 0 ? '+' : ''}${priceChangePct.toFixed(2)}%`,
    indicator?.rsi14 ? `RSI: ${Number(indicator.rsi14).toFixed(2)}` : null,
  ].filter(Boolean)

  return {
    trend,
    buyTiming,
    text: analysisText,
    keyPoints,
  }
}
