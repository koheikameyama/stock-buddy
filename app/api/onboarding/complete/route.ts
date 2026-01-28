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

    const { recommendations, purchasedIndices, investmentStyle } = await request.json()

    if (!recommendations || !Array.isArray(recommendations)) {
      return NextResponse.json(
        { error: "Invalid recommendations data" },
        { status: 400 }
      )
    }

    if (!investmentStyle) {
      return NextResponse.json(
        { error: "Investment style is required" },
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
        investmentAmount: parseInt(investmentStyle.budget),
        monthlyAmount: parseInt(investmentStyle.monthlyAmount || "0"),
        investmentPeriod: investmentStyle.investmentPeriod,
        riskTolerance: investmentStyle.riskTolerance,
      },
      create: {
        userId: user.id,
        investmentAmount: parseInt(investmentStyle.budget),
        monthlyAmount: parseInt(investmentStyle.monthlyAmount || "0"),
        investmentPeriod: investmentStyle.investmentPeriod,
        riskTolerance: investmentStyle.riskTolerance,
      },
    })

    const purchasedSet = new Set(purchasedIndices || [])
    const results = {
      watchlistAdded: 0,
      portfolioAdded: 0,
      errors: [] as string[],
    }

    // 各推奨銘柄を処理
    for (let i = 0; i < recommendations.length; i++) {
      const rec: Recommendation = recommendations[i]
      const isPurchased = purchasedSet.has(i)

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

        // まずウォッチリストに追加（全ての提案を保存）
        await prisma.watchlist.upsert({
          where: {
            userId_stockId: {
              userId: user.id,
              stockId: stock.id,
            },
          },
          update: {
            recommendedPrice: rec.recommendedPrice,
            recommendedQty: rec.quantity,
            reason: rec.reason,
            source: "onboarding",
          },
          create: {
            userId: user.id,
            stockId: stock.id,
            recommendedPrice: rec.recommendedPrice,
            recommendedQty: rec.quantity,
            reason: rec.reason,
            source: "onboarding",
          },
        })
        results.watchlistAdded++

        if (isPurchased) {
          // 購入済み: ポートフォリオに追加（購入詳細は後で入力）
          const existingPortfolioStock = await prisma.portfolioStock.findUnique({
            where: {
              portfolioId_stockId: {
                portfolioId: portfolio.id,
                stockId: stock.id,
              },
            },
          })

          if (!existingPortfolioStock) {
            await prisma.portfolioStock.create({
              data: {
                portfolioId: portfolio.id,
                stockId: stock.id,
                quantity: rec.quantity,
                averagePrice: rec.recommendedPrice,
              },
            })

            // トランザクション記録も作成
            await prisma.transaction.create({
              data: {
                portfolioId: portfolio.id,
                stockId: stock.id,
                type: "buy",
                quantity: rec.quantity,
                price: rec.recommendedPrice,
                totalAmount: rec.recommendedPrice * rec.quantity,
                executedAt: new Date(),
                note: `オンボーディング推奨銘柄: ${rec.reason}`,
              },
            })

            results.portfolioAdded++
          }
        }
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
