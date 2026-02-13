import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { fetchStockPrices } from "@/lib/stock-price-fetcher"

interface StockEarnings {
  isProfitable: boolean | null
  profitTrend: string | null
  revenueGrowth: number | null
  netIncomeGrowth: number | null
  eps: number | null
  latestRevenue: number | null
  latestNetIncome: number | null
}

/**
 * GET /api/stocks/prices
 *
 * 株価をリアルタイム取得 + 業績データ
 * - tickersパラメータあり: 指定したティッカーコードの株価を取得
 * - tickersパラメータなし: ユーザーのマイ銘柄の株価を取得
 */
export async function GET(request: NextRequest) {
  try {
    // 認証チェック
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // クエリパラメータからティッカーコードを取得
    const tickersParam = request.nextUrl.searchParams.get("tickers")

    let tickerCodes: string[]
    const earningsMap: Map<string, StockEarnings> = new Map()

    if (tickersParam) {
      // ティッカーコードが指定されている場合
      tickerCodes = tickersParam.split(",").filter((t) => t.trim())
      if (tickerCodes.length === 0) {
        return NextResponse.json({ error: "Invalid tickers parameter" }, { status: 400 })
      }

      // DBから業績データを取得
      const stocks = await prisma.stock.findMany({
        where: {
          tickerCode: { in: tickerCodes },
        },
        select: {
          tickerCode: true,
          isProfitable: true,
          profitTrend: true,
          revenueGrowth: true,
          netIncomeGrowth: true,
          eps: true,
          latestRevenue: true,
          latestNetIncome: true,
        },
      })

      for (const stock of stocks) {
        earningsMap.set(stock.tickerCode, {
          isProfitable: stock.isProfitable,
          profitTrend: stock.profitTrend,
          revenueGrowth: stock.revenueGrowth ? Number(stock.revenueGrowth) : null,
          netIncomeGrowth: stock.netIncomeGrowth ? Number(stock.netIncomeGrowth) : null,
          eps: stock.eps ? Number(stock.eps) : null,
          latestRevenue: stock.latestRevenue ? Number(stock.latestRevenue) : null,
          latestNetIncome: stock.latestNetIncome ? Number(stock.latestNetIncome) : null,
        })
      }
    } else {
      // ユーザーのマイ銘柄を取得（ウォッチリスト + ポートフォリオ）
      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        include: {
          watchlistStocks: {
            include: {
              stock: true,
            },
          },
          portfolioStocks: {
            include: {
              stock: true,
            },
          },
        },
      })

      const totalStocks = [
        ...(user?.watchlistStocks || []),
        ...(user?.portfolioStocks || []),
      ]

      if (!user || totalStocks.length === 0) {
        return NextResponse.json({ error: "User stocks not found" }, { status: 404 })
      }

      tickerCodes = totalStocks.map((us) => us.stock.tickerCode)

      // 業績データをマップに格納
      for (const us of totalStocks) {
        const s = us.stock
        earningsMap.set(s.tickerCode, {
          isProfitable: s.isProfitable,
          profitTrend: s.profitTrend,
          revenueGrowth: s.revenueGrowth ? Number(s.revenueGrowth) : null,
          netIncomeGrowth: s.netIncomeGrowth ? Number(s.netIncomeGrowth) : null,
          eps: s.eps ? Number(s.eps) : null,
          latestRevenue: s.latestRevenue ? Number(s.latestRevenue) : null,
          latestNetIncome: s.latestNetIncome ? Number(s.latestNetIncome) : null,
        })
      }
    }

    // 株価を取得（モジュール化）
    const prices = await fetchStockPrices(tickerCodes)

    // 株価に業績データをマージ
    const pricesWithEarnings = prices.map((price) => ({
      ...price,
      earnings: earningsMap.get(price.tickerCode) || null,
    }))

    return NextResponse.json({ prices: pricesWithEarnings })
  } catch (error) {
    console.error("Error fetching stock prices:", error)
    return NextResponse.json(
      { error: "株価の取得に失敗しました" },
      { status: 500 }
    )
  }
}
