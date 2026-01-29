import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

type Recommendation = {
  tickerCode: string
  name: string
  recommendedPrice: number
  quantity: number
  reason: string
}

export async function POST(request: NextRequest) {
  try {
    // 認証チェック
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const {
      recommendations,
      investmentStyle,
      budget,
      monthlyAmount,
      investmentPeriod,
      riskTolerance,
    } = body

    if (!recommendations || !Array.isArray(recommendations)) {
      return NextResponse.json(
        { error: "Invalid recommendations data" },
        { status: 400 }
      )
    }

    // 新しいフォーマット（直接値）または古いフォーマット（investmentStyle）に対応
    const finalBudget = budget || investmentStyle?.budget
    const finalMonthlyAmount = monthlyAmount ?? investmentStyle?.monthlyAmount ?? 0
    const finalPeriod = investmentPeriod || investmentStyle?.investmentPeriod
    const finalRiskTolerance = riskTolerance || investmentStyle?.riskTolerance

    if (!finalBudget || !finalPeriod || !finalRiskTolerance) {
      return NextResponse.json(
        { error: "Investment details are required" },
        { status: 400 }
      )
    }

    // ユーザーとポートフォリオを取得
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        portfolio: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // ポートフォリオが存在しない場合は作成
    let portfolio = user.portfolio
    if (!portfolio) {
      portfolio = await prisma.portfolio.create({
        data: {
          userId: user.id,
          name: "マイポートフォリオ",
        },
      })
    }

    // 投資スタイルを保存
    await prisma.userSettings.upsert({
      where: { userId: user.id },
      update: {
        investmentAmount: parseInt(String(finalBudget)),
        monthlyAmount: parseInt(String(finalMonthlyAmount)),
        investmentPeriod: finalPeriod,
        riskTolerance: finalRiskTolerance,
      },
      create: {
        userId: user.id,
        investmentAmount: parseInt(String(finalBudget)),
        monthlyAmount: parseInt(String(finalMonthlyAmount)),
        investmentPeriod: finalPeriod,
        riskTolerance: finalRiskTolerance,
      },
    })

    // ウォッチリストの現在の銘柄数をチェック
    const currentWatchlistCount = await prisma.watchlist.count({
      where: { userId: user.id },
    })

    // 追加可能な銘柄数を計算（最大5銘柄）
    const maxStocks = 5
    const availableSlots = maxStocks - currentWatchlistCount

    if (availableSlots <= 0) {
      return NextResponse.json(
        { error: "ウォッチリストには最大5銘柄まで登録できます" },
        { status: 400 }
      )
    }

    // 追加する銘柄数を制限
    const stocksToAdd = recommendations.slice(0, availableSlots)

    const results = {
      watchlistAdded: 0,
      errors: [] as string[],
    }

    // 各推奨銘柄をウォッチリストに追加
    for (const rec of stocksToAdd) {
      try {
        // 銘柄コードで株式を検索（.Tあり/なし両方対応）
        const tickerCodeWithT = rec.tickerCode.includes(".T")
          ? rec.tickerCode
          : `${rec.tickerCode}.T`

        let stock = await prisma.stock.findFirst({
          where: {
            OR: [{ tickerCode: rec.tickerCode }, { tickerCode: tickerCodeWithT }],
          },
        })

        // 銘柄が存在しない場合は作成
        if (!stock) {
          stock = await prisma.stock.create({
            data: {
              tickerCode: rec.tickerCode,
              name: rec.name,
              market: "TSE",
            },
          })
        }

        // ウォッチリストに追加（既存の場合は更新）
        const existingWatchlistItem = await prisma.watchlist.findUnique({
          where: {
            userId_stockId: {
              userId: user.id,
              stockId: stock.id,
            },
          },
        })

        if (existingWatchlistItem) {
          // 既存の場合は更新
          await prisma.watchlist.update({
            where: { id: existingWatchlistItem.id },
            data: {
              recommendedPrice: rec.recommendedPrice,
              recommendedQty: rec.quantity,
              reason: rec.reason,
              source: "onboarding",
            },
          })
        } else {
          // 新規追加
          await prisma.watchlist.create({
            data: {
              userId: user.id,
              stockId: stock.id,
              recommendedPrice: rec.recommendedPrice,
              recommendedQty: rec.quantity,
              reason: rec.reason,
              source: "onboarding",
            },
          })
        }

        results.watchlistAdded++
      } catch (error) {
        console.error(`Error processing ${rec.tickerCode}:`, error)
        results.errors.push(`銘柄 ${rec.tickerCode} の処理に失敗しました`)
      }
    }

    return NextResponse.json({
      success: true,
      message: "オンボーディングが完了しました",
      results,
    })
  } catch (error) {
    console.error("Error completing onboarding:", error)
    return NextResponse.json(
      { error: "オンボーディングの完了に失敗しました" },
      { status: 500 }
    )
  }
}
