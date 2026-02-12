import { auth } from "@/auth"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { fetchStockPrices } from "@/lib/stock-price-fetcher"
import { calculatePortfolioFromTransactions } from "@/lib/portfolio-calculator"

export async function GET() {
  try {
    const session = await auth()

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        portfolioStocks: {
          include: {
            stock: true,
            transactions: {
              orderBy: { transactionDate: "asc" },
            },
          },
        },
      },
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    if (user.portfolioStocks.length === 0) {
      return NextResponse.json({ summary: null })
    }

    // 現在の株価を取得
    const tickerCodes = user.portfolioStocks.map((ps) => ps.stock.tickerCode)
    const prices = await fetchStockPrices(tickerCodes)
    const priceMap = new Map(prices.map((p) => [p.tickerCode, p.currentPrice]))

    let totalValue = 0
    let totalCost = 0

    for (const ps of user.portfolioStocks) {
      const { quantity, averagePurchasePrice } = calculatePortfolioFromTransactions(
        ps.transactions
      )

      // 保有数が0なら（売却済み）スキップ
      if (quantity <= 0) continue

      const currentPrice = priceMap.get(ps.stock.tickerCode)
      if (currentPrice == null) continue

      totalValue += currentPrice * quantity
      totalCost += averagePurchasePrice.toNumber() * quantity
    }

    if (totalCost <= 0) {
      return NextResponse.json({ summary: null })
    }

    const unrealizedGain = totalValue - totalCost
    const unrealizedGainPercent = (unrealizedGain / totalCost) * 100

    return NextResponse.json({
      summary: {
        totalValue,
        totalCost,
        unrealizedGain,
        unrealizedGainPercent,
      },
    })
  } catch (error) {
    console.error("Error fetching portfolio summary:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
