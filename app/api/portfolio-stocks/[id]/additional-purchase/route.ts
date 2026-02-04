import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { Decimal } from "@prisma/client/runtime/library"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 認証チェック
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "認証が必要です" },
        { status: 401 }
      )
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user) {
      return NextResponse.json(
        { error: "ユーザーが見つかりません" },
        { status: 404 }
      )
    }

    // paramsをawait
    const { id } = await params

    // リクエストボディを取得
    const body = await request.json()
    const { quantity, price, purchaseDate, note } = body

    // バリデーション
    if (!quantity || quantity <= 0) {
      return NextResponse.json(
        { error: "購入株数を入力してください" },
        { status: 400 }
      )
    }

    if (!price || price <= 0) {
      return NextResponse.json(
        { error: "購入単価を入力してください" },
        { status: 400 }
      )
    }

    if (!purchaseDate) {
      return NextResponse.json(
        { error: "購入日を入力してください" },
        { status: 400 }
      )
    }

    // ポートフォリオストックを取得
    const portfolioStock = await prisma.portfolioStock.findUnique({
      where: { id },
      include: { stock: true },
    })

    if (!portfolioStock) {
      return NextResponse.json(
        { error: "保有銘柄が見つかりません" },
        { status: 404 }
      )
    }

    // 所有者チェック
    if (portfolioStock.userId !== user.id) {
      return NextResponse.json(
        { error: "この銘柄にアクセスする権限がありません" },
        { status: 403 }
      )
    }

    // 新しい平均取得単価を計算
    const currentQuantity = portfolioStock.quantity
    const currentAvgPrice = portfolioStock.averagePurchasePrice
    const newTotalQuantity = currentQuantity + quantity
    const newAvgPrice = new Decimal(currentQuantity)
      .times(currentAvgPrice)
      .plus(new Decimal(quantity).times(price))
      .div(newTotalQuantity)

    // トランザクション内で更新
    const result = await prisma.$transaction(async (tx) => {
      // ポートフォリオストックを更新
      const updatedPortfolioStock = await tx.portfolioStock.update({
        where: { id },
        data: {
          quantity: newTotalQuantity,
          averagePurchasePrice: newAvgPrice,
          note: note ? note : portfolioStock.note, // 新しいメモがあれば更新、なければ既存を保持
        },
        include: {
          stock: true,
        },
      })

      // トランザクション記録を作成
      await tx.transaction.create({
        data: {
          userId: user.id,
          stockId: portfolioStock.stockId,
          portfolioStockId: portfolioStock.id,
          type: "buy",
          quantity,
          price: new Decimal(price),
          totalAmount: new Decimal(quantity).times(price),
          transactionDate: new Date(purchaseDate),
          note,
        },
      })

      return updatedPortfolioStock
    })

    // レスポンス用のデータ整形
    const response = {
      id: result.id,
      userId: result.userId,
      stockId: result.stockId,
      type: "portfolio" as const,
      quantity: result.quantity,
      averagePurchasePrice: result.averagePurchasePrice.toNumber(),
      purchaseDate: result.purchaseDate.toISOString(),
      note: result.note,
      lastAnalysis: result.lastAnalysis?.toISOString() || null,
      shortTerm: result.shortTerm,
      mediumTerm: result.mediumTerm,
      longTerm: result.longTerm,
      stock: {
        id: result.stock.id,
        tickerCode: result.stock.tickerCode,
        name: result.stock.name,
        sector: result.stock.sector,
        market: result.stock.market,
        currentPrice: result.stock.currentPrice?.toNumber() || null,
      },
      createdAt: result.createdAt.toISOString(),
      updatedAt: result.updatedAt.toISOString(),
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error("Additional purchase error:", error)
    return NextResponse.json(
      { error: "追加購入の登録に失敗しました" },
      { status: 500 }
    )
  }
}
