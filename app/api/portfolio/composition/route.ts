import { auth } from "@/auth"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { fetchStockPrices } from "@/lib/stock-price-fetcher"
import { calculatePortfolioFromTransactions } from "@/lib/portfolio-calculator"

// グラフ用カラーパレット
const STOCK_COLORS = [
  "#3b82f6", // blue-500
  "#10b981", // emerald-500
  "#f59e0b", // amber-500
  "#ef4444", // red-500
  "#8b5cf6", // violet-500
  "#06b6d4", // cyan-500
  "#f97316", // orange-500
  "#ec4899", // pink-500
  "#84cc16", // lime-500
  "#6366f1", // indigo-500
]

const SECTOR_COLORS: Record<string, string> = {
  "情報・通信": "#3b82f6",
  "電気機器": "#10b981",
  "サービス業": "#f59e0b",
  "機械": "#ef4444",
  "卸売業": "#8b5cf6",
  "小売業": "#06b6d4",
  "輸送用機器": "#f97316",
  "医薬品": "#ec4899",
  "化学": "#84cc16",
  "食料品": "#6366f1",
  "その他": "#94a3b8",
}

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

    // 保有中の銘柄のみフィルタ
    const holdingStocks = user.portfolioStocks.filter((ps) => ps.quantity > 0)

    if (holdingStocks.length === 0) {
      return NextResponse.json({
        byStock: [],
        bySector: [],
        totalValue: 0,
        stockCount: 0,
      })
    }

    // 現在の株価を取得（保有中の銘柄のみ）
    const tickerCodes = holdingStocks.map((ps) => ps.stock.tickerCode)
    const { prices } = await fetchStockPrices(tickerCodes)
    const priceMap = new Map(prices.map((p) => [p.tickerCode, p.currentPrice]))

    // 銘柄別構成を計算
    const stockData: {
      stockId: string
      tickerCode: string
      name: string
      sector: string
      value: number
      cost: number
    }[] = []

    let totalValue = 0

    for (const ps of holdingStocks) {
      const { quantity, averagePurchasePrice } = calculatePortfolioFromTransactions(
        ps.transactions
      )

      const currentPrice = priceMap.get(ps.stock.tickerCode)
      if (currentPrice == null) continue

      const value = currentPrice * quantity
      const cost = averagePurchasePrice.toNumber() * quantity

      stockData.push({
        stockId: ps.stockId,
        tickerCode: ps.stock.tickerCode,
        name: ps.stock.name,
        sector: ps.stock.sector || "その他",
        value,
        cost,
      })

      totalValue += value
    }

    if (totalValue === 0) {
      return NextResponse.json({
        byStock: [],
        bySector: [],
        totalValue: 0,
        stockCount: 0,
      })
    }

    // 構成比率を計算してソート
    const byStock = stockData
      .map((s, index) => ({
        ...s,
        percent: Math.round((s.value / totalValue) * 1000) / 10,
        color: STOCK_COLORS[index % STOCK_COLORS.length],
      }))
      .sort((a, b) => b.value - a.value)

    // セクター別集計
    const sectorMap = new Map<string, { value: number; stockCount: number }>()
    for (const s of stockData) {
      const existing = sectorMap.get(s.sector) || { value: 0, stockCount: 0 }
      existing.value += s.value
      existing.stockCount += 1
      sectorMap.set(s.sector, existing)
    }

    const bySector = Array.from(sectorMap.entries())
      .map(([sector, data]) => ({
        sector,
        value: Math.round(data.value),
        percent: Math.round((data.value / totalValue) * 1000) / 10,
        stockCount: data.stockCount,
        color: SECTOR_COLORS[sector] || SECTOR_COLORS["その他"],
      }))
      .sort((a, b) => b.value - a.value)

    return NextResponse.json({
      byStock,
      bySector,
      totalValue: Math.round(totalValue),
      stockCount: stockData.length,
    })
  } catch (error) {
    console.error("Error fetching portfolio composition:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
