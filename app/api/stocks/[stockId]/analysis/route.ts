import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ stockId: string }> }
) {
  try {
    // 認証チェック
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 })
    }

    const { stockId } = await params

    // 最新の分析を取得
    const analysis = await prisma.stockAnalysis.findFirst({
      where: {
        stockId: stockId,
      },
      orderBy: {
        analyzedAt: "desc",
      },
      include: {
        stock: {
          select: {
            tickerCode: true,
            name: true,
            currentPrice: true,
          },
        },
      },
    })

    if (!analysis) {
      return NextResponse.json(
        { error: "分析データが見つかりません" },
        { status: 404 }
      )
    }

    return NextResponse.json({
      stockId: analysis.stockId,
      stockName: analysis.stock.name,
      tickerCode: analysis.stock.tickerCode,
      currentPrice: analysis.stock.currentPrice,
      shortTerm: {
        trend: analysis.shortTermTrend,
        priceLow: analysis.shortTermPriceLow,
        priceHigh: analysis.shortTermPriceHigh,
      },
      midTerm: {
        trend: analysis.midTermTrend,
        priceLow: analysis.midTermPriceLow,
        priceHigh: analysis.midTermPriceHigh,
      },
      longTerm: {
        trend: analysis.longTermTrend,
        priceLow: analysis.longTermPriceLow,
        priceHigh: analysis.longTermPriceHigh,
      },
      recommendation: analysis.recommendation,
      advice: analysis.advice,
      confidence: analysis.confidence,
      analyzedAt: analysis.analyzedAt,
    })
  } catch (error) {
    console.error("Error fetching stock analysis:", error)
    return NextResponse.json(
      { error: "分析データの取得に失敗しました" },
      { status: 500 }
    )
  }
}
