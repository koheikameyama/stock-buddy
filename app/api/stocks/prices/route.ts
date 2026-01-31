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

    // ユーザーのポートフォリオを取得
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        portfolio: {
          include: {
            stocks: {
              include: {
                stock: true,
              },
            },
          },
        },
      },
    })

    if (!user?.portfolio) {
      return NextResponse.json({ error: "Portfolio not found" }, { status: 404 })
    }

    // ティッカーコードを抽出（.T の有無は fetchStockPrices が自動で正規化）
    const tickerCodes = user.portfolio.stocks.map((ps) => ps.stock.tickerCode)

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
