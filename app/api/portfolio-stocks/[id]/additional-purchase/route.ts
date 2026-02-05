import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { Decimal } from "@prisma/client/runtime/library"
import { calculatePortfolioFromTransactions } from "@/lib/portfolio-calculator"

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

    // Transactionを作成
    await prisma.transaction.create({
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

    // メモがあれば更新
    if (note) {
      await prisma.portfolioStock.update({
        where: { id },
        data: { note },
      })
    }

    // 更新後のデータを取得（Transactionを含む）
    const result = await prisma.portfolioStock.findUnique({
      where: { id },
      include: {
        stock: true,
        transactions: {
          orderBy: { transactionDate: "asc" },
        },
      },
    })

    if (!result) {
      return NextResponse.json(
        { error: "更新後のデータ取得に失敗しました" },
        { status: 500 }
      )
    }

    // Transactionから計算
    const { quantity: totalQuantity, averagePurchasePrice } =
      calculatePortfolioFromTransactions(result.transactions)
    const firstBuyTransaction = result.transactions.find((t) => t.type === "buy")
    const firstPurchaseDate = firstBuyTransaction?.transactionDate || result.createdAt

    // レスポンス用のデータ整形
    const response = {
      id: result.id,
      userId: result.userId,
      stockId: result.stockId,
      type: "portfolio" as const,
      quantity: totalQuantity,
      averagePurchasePrice: averagePurchasePrice.toNumber(),
      purchaseDate: firstPurchaseDate.toISOString(),
      note: result.note,
      lastAnalysis: result.lastAnalysis?.toISOString() || null,
      shortTerm: result.shortTerm,
      mediumTerm: result.mediumTerm,
      longTerm: result.longTerm,
      transactions: result.transactions.map((t) => ({
        id: t.id,
        type: t.type,
        quantity: t.quantity,
        price: t.price.toNumber(),
        totalAmount: t.totalAmount.toNumber(),
        transactionDate: t.transactionDate.toISOString(),
        note: t.note,
      })),
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
