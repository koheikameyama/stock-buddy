import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { PrismaClient } from "@prisma/client"
import { calculateBuyTimingScore } from "@/lib/buy-timing-score"

const prisma = new PrismaClient()

/**
 * GET /api/portfolio/buy-timing-score?stockId=xxx
 *
 * ポートフォリオ銘柄の買い時スコアを計算
 */
export async function GET(request: Request) {
  try {
    // 認証チェック
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // URLパラメータから stockId を取得
    const { searchParams } = new URL(request.url)
    const stockId = searchParams.get("stockId")

    if (!stockId) {
      return NextResponse.json(
        { error: "stockId is required" },
        { status: 400 }
      )
    }

    // ユーザー設定を取得
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        settings: true,
      },
    })

    if (!user?.settings) {
      return NextResponse.json(
        { error: "User settings not found" },
        { status: 404 }
      )
    }

    // 銘柄情報を取得
    const stock = await prisma.stock.findUnique({
      where: { id: stockId },
      select: {
        id: true,
        tickerCode: true,
        name: true,
        beginnerScore: true,
        growthScore: true,
        dividendScore: true,
        stabilityScore: true,
        liquidityScore: true,
      },
    })

    if (!stock) {
      return NextResponse.json({ error: "Stock not found" }, { status: 404 })
    }

    // 今日の日付
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // 銘柄分析を取得（今日の分析）
    const stockAnalysis = await prisma.stockAnalysis.findUnique({
      where: {
        stockId_date: {
          stockId: stock.id,
          date: today,
        },
      },
      select: {
        trend: true,
        buyTiming: true,
      },
    })

    // 買い時スコアを計算
    const buyTimingScore = calculateBuyTimingScore(
      stock,
      {
        investmentPeriod: user.settings.investmentPeriod,
        riskTolerance: user.settings.riskTolerance,
      },
      stockAnalysis || undefined
    )

    return NextResponse.json({
      stockId: stock.id,
      buyTimingScore,
    })
  } catch (error) {
    console.error("Error calculating buy-timing score:", error)
    return NextResponse.json(
      { error: "買い時スコアの計算に失敗しました" },
      { status: 500 }
    )
  } finally {
    await prisma.$disconnect()
  }
}
