import { NextRequest, NextResponse } from "next/server"
import { fetchHistoricalPrices } from "@/lib/stock-price-fetcher"

/**
 * GET /api/market/nikkei/historical
 *
 * 日経平均のヒストリカルデータを取得
 * @param period - 期間（1m, 3m, 1y）
 */
export async function GET(request: NextRequest) {
  try {
    const periodParam = request.nextUrl.searchParams.get("period") || "1m"
    const period = ["1m", "3m", "1y"].includes(periodParam)
      ? (periodParam as "1m" | "3m" | "1y")
      : "1m"

    const prices = await fetchHistoricalPrices("^N225", period)

    if (prices.length === 0) {
      return NextResponse.json(
        { error: "日経平均のヒストリカルデータの取得に失敗しました" },
        { status: 500 }
      )
    }

    return NextResponse.json({ prices })
  } catch (error) {
    console.error("Error fetching Nikkei 225 historical:", error)
    return NextResponse.json(
      { error: "日経平均のヒストリカルデータの取得に失敗しました" },
      { status: 500 }
    )
  }
}
