import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { portfolioStockId, purchaseDate, purchasePrice, quantity, currentIsSimulation, newIsSimulation } =
      await request.json()

    if (!portfolioStockId || !purchaseDate || !purchasePrice || !quantity || currentIsSimulation === undefined || newIsSimulation === undefined) {
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

    // 状態が変わらない場合（シミュレーション→シミュレーション、実投資→実投資）
    if (currentIsSimulation === newIsSimulation) {
      if (newIsSimulation) {
        // シミュレーションのまま更新
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
        // 実投資のまま更新
        const existingTransaction = await prisma.transaction.findFirst({
          where: {
            portfolioId: user.portfolio!.id,
            stockId: portfolioStock.stock.id,
            type: "buy",
          },
          orderBy: {
            executedAt: "asc",
          },
        })

        await prisma.$transaction(async (tx) => {
          await tx.portfolioStock.update({
            where: { id: portfolioStockId },
            data: {
              averagePrice: purchasePrice,
              quantity: quantity,
            },
          })

          if (existingTransaction) {
            await tx.transaction.update({
              where: { id: existingTransaction.id },
              data: {
                quantity: quantity,
                price: purchasePrice,
                totalAmount: purchasePrice * quantity,
                executedAt: new Date(purchaseDate),
              },
            })
          } else {
            await tx.transaction.create({
              data: {
                portfolioId: user.portfolio!.id,
                stockId: portfolioStock.stock.id,
                type: "buy",
                quantity: quantity,
                price: purchasePrice,
                totalAmount: purchasePrice * quantity,
                executedAt: new Date(purchaseDate),
                note: "購入情報を更新",
              },
            })
          }
        })

        return NextResponse.json({
          success: true,
          message: "購入情報を更新しました",
        })
      }
    }

    // シミュレーション→実投資の変換
    if (currentIsSimulation && !newIsSimulation) {
      await prisma.$transaction(async (tx) => {
        await tx.portfolioStock.update({
          where: { id: portfolioStockId },
          data: {
            isSimulation: false,
            averagePrice: purchasePrice,
            quantity: quantity,
          },
        })

        await tx.transaction.create({
          data: {
            portfolioId: user.portfolio!.id,
            stockId: portfolioStock.stock.id,
            type: "buy",
            quantity: quantity,
            price: purchasePrice,
            totalAmount: purchasePrice * quantity,
            executedAt: new Date(purchaseDate),
            note: "シミュレーションから実投資に変換",
          },
        })
      })

      return NextResponse.json({
        success: true,
        message: "投資中に変更しました",
      })
    }

    // 実投資→シミュレーションの変換
    if (!currentIsSimulation && newIsSimulation) {
      await prisma.$transaction(async (tx) => {
        await tx.portfolioStock.update({
          where: { id: portfolioStockId },
          data: {
            isSimulation: true,
            averagePrice: purchasePrice,
            quantity: quantity,
          },
        })

        // 実投資のトランザクション記録を削除
        await tx.transaction.deleteMany({
          where: {
            portfolioId: user.portfolio!.id,
            stockId: portfolioStock.stock.id,
          },
        })
      })

      return NextResponse.json({
        success: true,
        message: "シミュレーションに変更しました",
      })
    }

    // ここには到達しないはず
    return NextResponse.json({
      success: false,
      message: "不明なエラーが発生しました",
    })
  } catch (error) {
    console.error("Error updating stock:", error)
    return NextResponse.json(
      { error: "更新に失敗しました" },
      { status: 500 }
    )
  }
}

