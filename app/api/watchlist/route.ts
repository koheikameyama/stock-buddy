import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

/**
 * GET /api/watchlist
 *
 * ユーザーのウォッチリストを取得
 * 買い時スコア、仮想購入情報、現在価格を含む
 */
export async function GET() {
  try {
    const session = await auth()

    if (!session?.user?.email) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user) {
      return NextResponse.json(
        { error: "ユーザーが見つかりません" },
        { status: 404 }
      )
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // ウォッチリストを取得
    const watchlist = await prisma.watchlist.findMany({
      where: {
        userId: user.id,
      },
      include: {
        stock: {
          select: {
            id: true,
            tickerCode: true,
            name: true,
            sector: true,
            beginnerScore: true,
            growthScore: true,
            dividendScore: true,
            stabilityScore: true,
            liquidityScore: true,
          },
        },
      },
      orderBy: {
        buyTimingScore: "desc", // 買い時スコアが高い順
      },
    })

    // 各銘柄の現在価格を取得
    const watchlistWithPrices = await Promise.all(
      watchlist.map(async (item) => {
        const latestPrice = await prisma.stockPrice.findFirst({
          where: {
            stockId: item.stock.id,
          },
          orderBy: {
            date: "desc",
          },
          select: {
            date: true,
            close: true,
          },
        })

        // 仮想購入の損益計算
        let virtualGainLoss = null
        let virtualGainLossPct = null

        if (
          item.virtualBuyPrice &&
          item.virtualQuantity &&
          latestPrice
        ) {
          const currentValue =
            Number(latestPrice.close) * item.virtualQuantity
          const costValue =
            Number(item.virtualBuyPrice) * item.virtualQuantity
          virtualGainLoss = currentValue - costValue
          virtualGainLossPct = (virtualGainLoss / costValue) * 100
        }

        return {
          id: item.id,
          stock: item.stock,
          recommendedPrice: item.recommendedPrice,
          recommendedQty: item.recommendedQty,
          reason: item.reason,
          source: item.source,
          targetPrice: item.targetPrice,
          priceAlert: item.priceAlert,
          lastAlertSent: item.lastAlertSent,
          buyTimingScore: item.buyTimingScore,
          lastAnalyzedAt: item.lastAnalyzedAt,
          virtualBuyPrice: item.virtualBuyPrice,
          virtualBuyDate: item.virtualBuyDate,
          virtualQuantity: item.virtualQuantity,
          currentPrice: latestPrice?.close || null,
          priceDate: latestPrice?.date || null,
          virtualGainLoss,
          virtualGainLossPct,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        }
      })
    )

    return NextResponse.json({
      success: true,
      watchlist: watchlistWithPrices,
      count: watchlistWithPrices.length,
    })
  } catch (error) {
    console.error("Error fetching watchlist:", error)
    return NextResponse.json(
      { error: "ウォッチリストの取得に失敗しました" },
      { status: 500 }
    )
  } finally {
    await prisma.$disconnect()
  }
}
