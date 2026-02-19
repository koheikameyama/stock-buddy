import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { fetchStockPrices } from "@/lib/stock-price-fetcher"

/**
 * GET /api/stocks/prices
 *
 * 株価をリアルタイム取得
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

    if (tickersParam) {
      // ティッカーコードが指定されている場合
      tickerCodes = tickersParam.split(",").filter((t) => t.trim())
      if (tickerCodes.length === 0) {
        return NextResponse.json({ error: "Invalid tickers parameter" }, { status: 400 })
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
    }

    // 株価を取得（モジュール化）
    const { prices, staleTickers } = await fetchStockPrices(tickerCodes)

    return NextResponse.json({ prices, staleTickers })
  } catch (error) {
    console.error("Error fetching stock prices:", error)
    return NextResponse.json(
      { error: "株価の取得に失敗しました" },
      { status: 500 }
    )
  }
}
