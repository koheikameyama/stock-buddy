import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

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
      addToPortfolio = false,
      isSimulation = false,
    } = body

    if (!recommendations || !Array.isArray(recommendations)) {
      return NextResponse.json(
        { error: "Invalid recommendations data" },
        { status: 400 }
      )
    }

    // 新しいフォーマット（直接値）または古いフォーマット（investmentStyle）に対応
    const finalBudget = budget || investmentStyle?.budget
    const finalMonthlyAmount = monthlyAmount ?? investmentStyle?.monthlyAmount
    const finalPeriod = investmentPeriod || investmentStyle?.investmentPeriod
    const finalRiskTolerance = riskTolerance || investmentStyle?.riskTolerance

    if (!finalPeriod || !finalRiskTolerance) {
      return NextResponse.json(
        { error: "Investment period and risk tolerance are required" },
        { status: 400 }
      )
    }

    // ユーザーを取得
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
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

    const MAX_USER_STOCKS = 5
    const results = {
      added: 0,
      errors: [] as string[],
    }

    // 現在のマイ銘柄数を取得
    const currentCount = await prisma.userStock.count({
      where: { userId: user.id },
    })

    // 各推奨銘柄を追加
    for (const rec of recommendations) {
      try {
        // 制限チェック
        if (currentCount + results.added >= MAX_USER_STOCKS) {
          results.errors.push(`最大${MAX_USER_STOCKS}銘柄まで登録できます`)
          break
        }

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

        // UserStockに追加
        await prisma.userStock.create({
          data: {
            userId: user.id,
            stockId: stock.id,
            quantity: addToPortfolio ? rec.quantity : null,
            averagePurchasePrice: addToPortfolio ? rec.recommendedPrice : null,
            note: "オンボーディングから追加",
          },
        })

        results.added++
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
