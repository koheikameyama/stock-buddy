import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { calculateBuyTimingScore } from "@/lib/buy-timing-score"

/**
 * POST /api/watchlist/update-scores
 *
 * 全ユーザーのウォッチリスト銘柄の買い時スコアを更新
 * GitHub Actionsから定期実行される
 */
export async function POST() {
  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // 全ユーザーのウォッチリストを取得
    const watchlists = await prisma.watchlist.findMany({
      include: {
        stock: {
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
        },
        user: {
          include: {
            settings: true,
          },
        },
      },
    })

    let updatedCount = 0
    let skippedCount = 0

    for (const watchlist of watchlists) {
      // ユーザー設定がない場合はスキップ
      if (!watchlist.user.settings) {
        skippedCount++
        continue
      }

      const userSettings = watchlist.user.settings

      // 銘柄分析を取得（今日の分析）
      const stockAnalysis = await prisma.stockAnalysis.findUnique({
        where: {
          stockId_date: {
            stockId: watchlist.stockId,
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
        watchlist.stock,
        {
          investmentPeriod: userSettings.investmentPeriod,
          riskTolerance: userSettings.riskTolerance,
        },
        stockAnalysis || undefined
      )

      // ウォッチリストを更新
      await prisma.watchlist.update({
        where: { id: watchlist.id },
        data: {
          buyTimingScore,
          lastAnalyzedAt: new Date(),
        },
      })

      updatedCount++
    }

    return NextResponse.json({
      success: true,
      message: "買い時スコアを更新しました",
      updatedCount,
      skippedCount,
      totalCount: watchlists.length,
    })
  } catch (error) {
    console.error("Error updating buy-timing scores:", error)
    return NextResponse.json(
      { error: "買い時スコアの更新に失敗しました" },
      { status: 500 }
    )
  }
}
