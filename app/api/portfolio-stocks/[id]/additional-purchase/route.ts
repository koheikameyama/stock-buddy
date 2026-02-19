import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { Decimal } from "@prisma/client/runtime/library"
import { calculatePortfolioFromTransactions } from "@/lib/portfolio-calculator"
import { fetchStockPrices } from "@/lib/stock-price-fetcher"

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
    const { type = "buy", quantity, price, purchaseDate } = body

    // typeのバリデーション
    if (type !== "buy" && type !== "sell") {
      return NextResponse.json(
        { error: "取引種別が不正です" },
        { status: 400 }
      )
    }

    const isBuy = type === "buy"

    // バリデーション
    if (!quantity || quantity <= 0) {
      return NextResponse.json(
        { error: isBuy ? "購入株数を入力してください" : "売却株数を入力してください" },
        { status: 400 }
      )
    }

    if (!price || price <= 0) {
      return NextResponse.json(
        { error: isBuy ? "購入単価を入力してください" : "売却単価を入力してください" },
        { status: 400 }
      )
    }

    if (!purchaseDate) {
      return NextResponse.json(
        { error: isBuy ? "購入日を入力してください" : "売却日を入力してください" },
        { status: 400 }
      )
    }

    // ポートフォリオストックを取得（売却時は現在の保有数も確認）
    const portfolioStock = await prisma.portfolioStock.findUnique({
      where: { id },
      include: {
        stock: true,
        transactions: { orderBy: { transactionDate: "asc" } },
      },
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

    // 売却の場合、現在の保有数を超えていないかチェック
    if (!isBuy) {
      const { quantity: currentQuantity } = calculatePortfolioFromTransactions(
        portfolioStock.transactions
      )
      if (quantity > currentQuantity) {
        return NextResponse.json(
          { error: `売却可能な株数は${currentQuantity}株までです` },
          { status: 400 }
        )
      }
    }

    // Transactionを作成
    await prisma.transaction.create({
      data: {
        userId: user.id,
        stockId: portfolioStock.stockId,
        portfolioStockId: portfolioStock.id,
        type,
        quantity,
        price: new Decimal(price),
        totalAmount: new Decimal(quantity).times(price),
        transactionDate: new Date(purchaseDate),
      },
    })

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

    // リアルタイム株価を取得
    const { prices } = await fetchStockPrices([result.stock.tickerCode])
    const currentPrice = prices[0]?.currentPrice ?? null

    // レスポンス用のデータ整形
    const response = {
      id: result.id,
      userId: result.userId,
      stockId: result.stockId,
      type: "portfolio" as const,
      quantity: totalQuantity,
      averagePurchasePrice: averagePurchasePrice.toNumber(),
      purchaseDate: firstPurchaseDate.toISOString(),
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
      })),
      stock: {
        id: result.stock.id,
        tickerCode: result.stock.tickerCode,
        name: result.stock.name,
        sector: result.stock.sector,
        market: result.stock.market,
        currentPrice,
      },
      createdAt: result.createdAt.toISOString(),
      updatedAt: result.updatedAt.toISOString(),
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error("Transaction error:", error)
    return NextResponse.json(
      { error: "取引の登録に失敗しました" },
      { status: 500 }
    )
  }
}
