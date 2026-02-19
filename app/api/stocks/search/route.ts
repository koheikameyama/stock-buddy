import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { fetchStockPrices } from "@/lib/stock-price-fetcher"

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
    // If query is just numbers, append .T to prioritize exact ticker matches
    const isNumericQuery = /^\d+$/.test(query)
    const tickerQuery = isNumericQuery ? `${query}.T` : query

    // Convert half-width to full-width for Japanese character search
    const toFullWidth = (str: string) => {
      return str.replace(/[A-Za-z0-9]/g, (s) => {
        return String.fromCharCode(s.charCodeAt(0) + 0xFEE0)
      })
    }
    const fullWidthQuery = toFullWidth(query)

    const stocks = await prisma.stock.findMany({
      where: {
        OR: [
          { tickerCode: { startsWith: tickerQuery, mode: "insensitive" } },
          { tickerCode: { contains: query, mode: "insensitive" } },
          { name: { contains: query, mode: "insensitive" } },
          { name: { contains: fullWidthQuery, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        tickerCode: true,
        name: true,
        market: true,
        sector: true,
      },
      take: 20, // Limit results
    })

    // リアルタイム株価を取得
    const tickerCodes = stocks.map((s) => s.tickerCode)
    const { prices } = await fetchStockPrices(tickerCodes)
    const priceMap = new Map(prices.map((p) => [p.tickerCode, p.currentPrice]))

    // Format response with latest price
    const formattedStocks = stocks.map((stock) => ({
      id: stock.id,
      tickerCode: stock.tickerCode,
      name: stock.name,
      market: stock.market,
      sector: stock.sector,
      latestPrice: priceMap.get(stock.tickerCode) ?? null,
      latestPriceDate: null, // リアルタイム取得なので常に最新
    }))

    // Sort results: prioritize exact ticker matches with .T
    const sortedStocks = formattedStocks.sort((a, b) => {
      const aStartsWithQuery = a.tickerCode.toLowerCase().startsWith(tickerQuery.toLowerCase())
      const bStartsWithQuery = b.tickerCode.toLowerCase().startsWith(tickerQuery.toLowerCase())

      if (aStartsWithQuery && !bStartsWithQuery) return -1
      if (!aStartsWithQuery && bStartsWithQuery) return 1

      return 0
    })

    return NextResponse.json({ stocks: sortedStocks })
  } catch (error) {
    console.error("Error searching stocks:", error)
    return NextResponse.json(
      { error: "Failed to search stocks" },
      { status: 500 }
    )
  }
}
