import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { portfolioStockId, purchaseDate, purchasePrice, quantity, isSimulation } =
      await request.json()

    if (!portfolioStockId || !purchaseDate || !purchasePrice || !quantity) {
      return NextResponse.json(
        { error: "必須項目が不足しています" },
        { status: 400 }
      )
    }

    // ユーザーのポートフォリオを取得
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        portfolio: {
          include: {
            stocks: {
              where: { id: portfolioStockId },
              include: {
                stock: true,
              },
            },
          },
        },
      },
    })

    if (!user?.portfolio) {
      return NextResponse.json(
        { error: "ポートフォリオが見つかりません" },
        { status: 404 }
      )
    }

    const portfolioStock = user.portfolio.stocks[0]
    if (!portfolioStock) {
      return NextResponse.json(
        { error: "銘柄が見つかりません" },
        { status: 404 }
      )
    }

    // シミュレーションの場合はシミュレーションのまま更新
    if (isSimulation) {
      await prisma.portfolioStock.update({
        where: { id: portfolioStockId },
        data: {
          averagePrice: purchasePrice,
          quantity: quantity,
        },
      })

      return NextResponse.json({
        success: true,
        message: "シミュレーション情報を更新しました",
      })
    } else {
      // 実投資の購入情報を更新する場合
      // 既存のトランザクションを更新するか、新しく作成する
      const existingTransaction = await prisma.transaction.findFirst({
        where: {
          portfolioId: user.portfolio.id,
          stockId: portfolioStock.stock.id,
          type: "buy",
        },
        orderBy: {
          executedAt: "asc",
        },
      })

      await prisma.$transaction(async (tx) => {
        // ポートフォリオ銘柄を更新
        await tx.portfolioStock.update({
          where: { id: portfolioStockId },
          data: {
            averagePrice: purchasePrice,
            quantity: quantity,
          },
        })

        if (existingTransaction) {
          // 既存のトランザクションを更新
          await tx.transaction.update({
            where: { id: existingTransaction.id },
            data: {
              quantity: quantity,
              price: purchasePrice,
              executedAt: new Date(purchaseDate),
              note: "購入情報を更新",
            },
          })
        } else {
          // トランザクションが存在しない場合は新規作成
          await tx.transaction.create({
            data: {
              portfolioId: user.portfolio!.id,
              stockId: portfolioStock.stock.id,
              type: "buy",
              quantity: quantity,
              price: purchasePrice,
              totalAmount: purchasePrice * quantity,
              executedAt: new Date(purchaseDate),
              note: "購入情報を登録",
            },
          })
        }
      })

      return NextResponse.json({
        success: true,
        message: "購入情報を更新しました",
      })
    }
  } catch (error) {
    console.error("Error updating stock:", error)
    return NextResponse.json(
      { error: "銘柄の更新に失敗しました" },
      { status: 500 }
    )
  } finally {
    await prisma.$disconnect()
  }
}
