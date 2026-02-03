import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { fetchStockPrices } from "@/lib/stock-price-fetcher"

/**
 * GET /api/stocks/prices
 *
 * ポートフォリオ銘柄の株価をリアルタイム取得
 */
export async function GET() {
  try {
    // 認証チェック
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

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

    // ティッカーコードを抽出（.T の有無は fetchStockPrices が自動で正規化）
    const tickerCodes = totalStocks.map((us) => us.stock.tickerCode)

    // 株価を取得（モジュール化）
    const prices = await fetchStockPrices(tickerCodes)

    return NextResponse.json({ prices })
  } catch (error) {
    console.error("Error fetching stock prices:", error)
    return NextResponse.json(
      { error: "株価の取得に失敗しました" },
      { status: 500 }
    )
  }
}
