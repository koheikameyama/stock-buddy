import { NextResponse } from "next/server"
import { fetchStockPrices } from "@/lib/stock-price-fetcher"

/**
 * GET /api/market/nikkei
 *
 * 日経平均株価をリアルタイム取得
 */
export async function GET() {
  try {
    const prices = await fetchStockPrices(["^N225"])

    if (prices.length === 0) {
      return NextResponse.json(
        { error: "日経平均の取得に失敗しました" },
        { status: 500 }
      )
    }

    const nikkei = prices[0]

    return NextResponse.json({
      currentPrice: nikkei.currentPrice,
      previousClose: nikkei.previousClose,
      change: nikkei.change,
      changePercent: nikkei.changePercent,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("Error fetching Nikkei 225:", error)
    return NextResponse.json(
      { error: "日経平均の取得に失敗しました" },
      { status: 500 }
    )
  }
}
