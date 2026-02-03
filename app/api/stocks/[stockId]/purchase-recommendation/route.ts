import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"

dayjs.extend(utc)

/**
 * GET /api/stocks/[stockId]/purchase-recommendation
 * 指定された銘柄の最新の購入判断を取得
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ stockId: string }> }
) {
  const { stockId } = await params

  try {
    // 銘柄情報を取得
    const stock = await prisma.stock.findUnique({
      where: { id: stockId },
      select: {
        id: true,
        tickerCode: true,
        name: true,
        currentPrice: true,
      },
    })

    if (!stock) {
      return NextResponse.json(
        { error: "銘柄が見つかりません" },
        { status: 404 }
      )
    }

    // 最新の購入判断を取得（過去7日以内）
    const sevenDaysAgo = dayjs.utc().subtract(7, "day").startOf("day").toDate()

    const recommendation = await prisma.purchaseRecommendation.findFirst({
      where: {
        stockId,
        date: {
          gte: sevenDaysAgo,
        },
      },
      orderBy: {
        date: "desc",
      },
    })

    if (!recommendation) {
      return NextResponse.json(
        { error: "購入判断データがまだ生成されていません" },
        { status: 404 }
      )
    }

    // レスポンス整形
    const response = {
      stockId: stock.id,
      stockName: stock.name,
      tickerCode: stock.tickerCode,
      currentPrice: stock.currentPrice ? Number(stock.currentPrice) : null,
      recommendation: recommendation.recommendation,
      confidence: recommendation.confidence,
      reason: recommendation.reason,
      recommendedQuantity: recommendation.recommendedQuantity,
      recommendedPrice: recommendation.recommendedPrice
        ? Number(recommendation.recommendedPrice)
        : null,
      estimatedAmount: recommendation.estimatedAmount
        ? Number(recommendation.estimatedAmount)
        : null,
      caution: recommendation.caution,
      analyzedAt: recommendation.date.toISOString(),
    }

    return NextResponse.json(response, { status: 200 })
  } catch (error) {
    console.error("Error fetching purchase recommendation:", error)
    return NextResponse.json(
      { error: "購入判断の取得に失敗しました" },
      { status: 500 }
    )
  }
}
