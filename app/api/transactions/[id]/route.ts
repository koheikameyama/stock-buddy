import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { Decimal } from "@prisma/client/runtime/library"

interface UpdateTransactionRequest {
  quantity?: number
  price?: number
  transactionDate?: string
}

/**
 * PATCH /api/transactions/[id]
 * Transaction（購入履歴）を編集
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 })
    }

    const { id } = await params
    const body: UpdateTransactionRequest = await request.json()
    const { quantity, price, transactionDate } = body

    // Transactionを取得
    const transaction = await prisma.transaction.findUnique({
      where: { id },
      include: { portfolioStock: true },
    })

    if (!transaction) {
      return NextResponse.json(
        { error: "取引履歴が見つかりません" },
        { status: 404 }
      )
    }

    // 所有者チェック
    if (transaction.userId !== session.user.id) {
      return NextResponse.json(
        { error: "この取引履歴にアクセスする権限がありません" },
        { status: 403 }
      )
    }

    // バリデーション
    if (quantity !== undefined && quantity <= 0) {
      return NextResponse.json(
        { error: "数量は1以上である必要があります" },
        { status: 400 }
      )
    }

    if (price !== undefined && price <= 0) {
      return NextResponse.json(
        { error: "単価は0より大きい必要があります" },
        { status: 400 }
      )
    }

    // 更新データを構築
    const updateData: {
      quantity?: number
      price?: Decimal
      totalAmount?: Decimal
      transactionDate?: Date
    } = {}

    if (quantity !== undefined) {
      updateData.quantity = quantity
    }

    if (price !== undefined) {
      updateData.price = new Decimal(price)
    }

    // totalAmountを再計算
    const newQuantity = quantity ?? transaction.quantity
    const newPrice = price !== undefined ? new Decimal(price) : transaction.price
    updateData.totalAmount = newPrice.times(newQuantity)

    if (transactionDate !== undefined) {
      updateData.transactionDate = new Date(transactionDate)
    }

    // Transactionを更新
    const updatedTransaction = await prisma.transaction.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({
      id: updatedTransaction.id,
      type: updatedTransaction.type,
      quantity: updatedTransaction.quantity,
      price: updatedTransaction.price.toNumber(),
      totalAmount: updatedTransaction.totalAmount.toNumber(),
      transactionDate: updatedTransaction.transactionDate.toISOString(),
    })
  } catch (error) {
    console.error("Transaction update error:", error)
    return NextResponse.json(
      { error: "取引履歴の更新に失敗しました" },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/transactions/[id]
 * Transaction（購入履歴）を削除
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 })
    }

    const { id } = await params

    // Transactionを取得
    const transaction = await prisma.transaction.findUnique({
      where: { id },
    })

    if (!transaction) {
      return NextResponse.json(
        { error: "取引履歴が見つかりません" },
        { status: 404 }
      )
    }

    // 所有者チェック
    if (transaction.userId !== session.user.id) {
      return NextResponse.json(
        { error: "この取引履歴にアクセスする権限がありません" },
        { status: 403 }
      )
    }

    const portfolioStockId = transaction.portfolioStockId

    // Transactionを削除
    await prisma.transaction.delete({
      where: { id },
    })

    // Transactionがなくなったらポートフォリオも削除
    if (portfolioStockId) {
      const remainingTransactions = await prisma.transaction.count({
        where: { portfolioStockId },
      })

      if (remainingTransactions === 0) {
        await prisma.portfolioStock.delete({
          where: { id: portfolioStockId },
        })
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Transaction delete error:", error)
    return NextResponse.json(
      { error: "取引履歴の削除に失敗しました" },
      { status: 500 }
    )
  }
}
