import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { fetchStockPrices } from "@/lib/stock-price-fetcher"

/**
 * GET /api/passed-stocks/[id]
 * 見送り銘柄の詳細を取得
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const userId = session.user.id

  try {
    const passedStock = await prisma.passedStockTracking.findFirst({
      where: {
        id,
        userId, // ユーザーの所有確認
      },
      include: {
        stock: {
          select: {
            id: true,
            tickerCode: true,
            name: true,
            sector: true,
          },
        },
      },
    })

    if (!passedStock) {
      return NextResponse.json(
        { error: "見送り銘柄が見つかりません" },
        { status: 404 }
      )
    }

    // リアルタイム株価を取得
    const prices = await fetchStockPrices([passedStock.stock.tickerCode])
    const currentPrice = prices[0]?.currentPrice ?? null
    const passedPrice = Number(passedStock.passedPrice)

    // 現在の価格変動を計算
    let priceChangePercent = null
    let whatIfProfit = null

    if (currentPrice && passedPrice) {
      priceChangePercent = ((currentPrice - passedPrice) / passedPrice) * 100
      const whatIfQuantity = passedStock.whatIfQuantity || 100
      whatIfProfit = (currentPrice - passedPrice) * whatIfQuantity
    }

    return NextResponse.json({
      id: passedStock.id,
      stockId: passedStock.stockId,
      stock: {
        id: passedStock.stock.id,
        tickerCode: passedStock.stock.tickerCode,
        name: passedStock.stock.name,
        sector: passedStock.stock.sector,
        currentPrice,
      },
      passedAt: passedStock.passedAt.toISOString(),
      passedPrice,
      passedReason: passedStock.passedReason,
      source: passedStock.source,
      currentPrice,
      priceChangePercent,
      whatIfProfit,
      whatIfQuantity: passedStock.whatIfQuantity,
      wasGoodDecision: passedStock.wasGoodDecision,
      feedbackNote: passedStock.feedbackNote,
      lastTrackedAt: passedStock.lastTrackedAt?.toISOString() || null,
      createdAt: passedStock.createdAt.toISOString(),
    })
  } catch (error) {
    console.error("Error fetching passed stock:", error)
    return NextResponse.json(
      { error: "見送り銘柄の取得に失敗しました" },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/passed-stocks/[id]
 * 見送り銘柄の追跡を解除
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const userId = session.user.id

  try {
    // ユーザーの所有確認
    const passedStock = await prisma.passedStockTracking.findFirst({
      where: {
        id,
        userId,
      },
    })

    if (!passedStock) {
      return NextResponse.json(
        { error: "見送り銘柄が見つかりません" },
        { status: 404 }
      )
    }

    await prisma.passedStockTracking.delete({
      where: { id },
    })

    return NextResponse.json({
      message: "追跡を解除しました",
    })
  } catch (error) {
    console.error("Error deleting passed stock:", error)
    return NextResponse.json(
      { error: "追跡の解除に失敗しました" },
      { status: 500 }
    )
  }
}
