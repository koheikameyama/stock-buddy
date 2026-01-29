import { NextRequest, NextResponse } from "next/server"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

/**
 * Stock Search API
 *
 * Search stocks by ticker code or company name
 * GET /api/stocks/search?q=トヨタ
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const query = searchParams.get("q")

    if (!query || query.length < 1) {
      return NextResponse.json({ stocks: [] })
    }

    // Search by ticker code or company name
    const stocks = await prisma.stock.findMany({
      where: {
        OR: [
          { tickerCode: { contains: query, mode: "insensitive" } },
          { name: { contains: query, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        tickerCode: true,
        name: true,
        market: true,
        sector: true,
        prices: {
          orderBy: { date: "desc" },
          take: 1,
          select: {
            close: true,
            date: true,
          },
        },
      },
      take: 20, // Limit results
    })

    // Format response with latest price
    const formattedStocks = stocks.map((stock) => ({
      id: stock.id,
      tickerCode: stock.tickerCode,
      name: stock.name,
      market: stock.market,
      sector: stock.sector,
      latestPrice: stock.prices[0] ? Number(stock.prices[0].close) : null,
      latestPriceDate: stock.prices[0]?.date.toISOString() || null,
    }))

    return NextResponse.json({ stocks: formattedStocks })
  } catch (error) {
    console.error("Error searching stocks:", error)
    return NextResponse.json(
      { error: "Failed to search stocks" },
      { status: 500 }
    )
  } finally {
    await prisma.$disconnect()
  }
}
