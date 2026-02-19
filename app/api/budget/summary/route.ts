import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { calculatePortfolioFromTransactions } from "@/lib/portfolio-calculator"

/**
 * GET /api/budget/summary
 * 投資予算の概要を返す（総予算・投資済み・残り予算）
 *
 * 投資済み = 現在保有中の株の取得コスト合計（保有コスト方式）
 * 売却済みの株は含まない。売れば予算に戻ってくる。
 */
export async function GET() {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  })

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  const [userSettings, portfolioStocks] = await Promise.all([
    prisma.userSettings.findUnique({
      where: { userId: user.id },
      select: { investmentBudget: true },
    }),
    prisma.portfolioStock.findMany({
      where: { userId: user.id },
      select: {
        transactions: {
          select: { type: true, quantity: true, price: true, transactionDate: true },
          orderBy: { transactionDate: "asc" },
        },
      },
    }),
  ])

  // 現在保有中の株の取得コスト合計を計算
  let holdingsCost = 0
  for (const ps of portfolioStocks) {
    const { quantity, averagePurchasePrice } = calculatePortfolioFromTransactions(ps.transactions)
    if (quantity > 0) {
      holdingsCost += quantity * averagePurchasePrice.toNumber()
    }
  }

  const totalBudget = userSettings?.investmentBudget ?? null
  const remainingBudget = totalBudget !== null ? Math.max(0, totalBudget - holdingsCost) : null

  return NextResponse.json({
    totalBudget,
    netInvested: holdingsCost,
    remainingBudget,
  })
}
