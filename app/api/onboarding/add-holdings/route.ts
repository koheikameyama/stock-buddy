import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

type Holding = {
  tickerCode: string
  quantity: string
  averagePrice: string
  purchaseDate: string
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { holdings } = await request.json() as { holdings: Holding[] }

    if (!holdings || !Array.isArray(holdings) || holdings.length === 0) {
      return NextResponse.json(
        { error: "保有銘柄を指定してください" },
        { status: 400 }
      )
    }

    // ユーザーとポートフォリオを取得
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { portfolio: true },
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

    // 各保有銘柄を追加
    const results = {
      added: 0,
      errors: [] as string[],
    }

    for (const holding of holdings) {
      try {
        // 銘柄を検索
        const stock = await prisma.stock.findUnique({
          where: { tickerCode: holding.tickerCode },
        })

        if (!stock) {
          results.errors.push(`銘柄 ${holding.tickerCode} が見つかりませんでした`)
          continue
        }

        const quantity = parseInt(holding.quantity)
        const averagePrice = parseFloat(holding.averagePrice)

        if (isNaN(quantity) || isNaN(averagePrice)) {
          results.errors.push(`銘柄 ${holding.tickerCode} の数値が不正です`)
          continue
        }

        // トランザクションで処理
        await prisma.$transaction(async (tx) => {
          // 既存のポートフォリオ銘柄をチェック
          const existingStock = await tx.portfolioStock.findUnique({
            where: {
              portfolioId_stockId: {
                portfolioId: portfolio!.id,
                stockId: stock.id,
              },
            },
          })

          if (existingStock) {
            // 既に保有している場合は数量と平均価格を更新
            const totalQuantity = existingStock.quantity + quantity
            const totalCost =
              Number(existingStock.averagePrice) * existingStock.quantity +
              averagePrice * quantity
            const newAveragePrice = totalCost / totalQuantity

            await tx.portfolioStock.update({
              where: { id: existingStock.id },
              data: {
                quantity: totalQuantity,
                averagePrice: newAveragePrice,
              },
            })
          } else {
            // 新規追加
            await tx.portfolioStock.create({
              data: {
                portfolioId: portfolio!.id,
                stockId: stock.id,
                quantity,
                averagePrice,
              },
            })
          }

          // トランザクション記録を作成
          await tx.transaction.create({
            data: {
              portfolioId: portfolio!.id,
              stockId: stock.id,
              type: "buy",
              quantity,
              price: averagePrice,
              totalAmount: averagePrice * quantity,
              executedAt: holding.purchaseDate ? new Date(holding.purchaseDate) : new Date(),
              note: "オンボーディングから追加",
            },
          })
        })

        results.added++
      } catch (error) {
        console.error(`Error processing ${holding.tickerCode}:`, error)
        results.errors.push(`銘柄 ${holding.tickerCode} の追加に失敗しました`)
      }
    }

    return NextResponse.json({
      success: true,
      message: `${results.added}銘柄を追加しました`,
      results,
    })
  } catch (error) {
    console.error("Error adding holdings:", error)
    return NextResponse.json(
      { error: "保有銘柄の追加に失敗しました" },
      { status: 500 }
    )
  }
}
