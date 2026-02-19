import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

/**
 * GET /api/budget/summary
 * 投資予算の概要を返す（総予算・投資済み・残り予算）
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

  const [userSettings, buyAgg, sellAgg] = await Promise.all([
    prisma.userSettings.findUnique({
      where: { userId: user.id },
      select: { investmentBudget: true },
    }),
    prisma.transaction.aggregate({
      where: { userId: user.id, type: "buy" },
      _sum: { totalAmount: true },
    }),
    prisma.transaction.aggregate({
      where: { userId: user.id, type: "sell" },
      _sum: { totalAmount: true },
    }),
  ])

  const buyTotal = Number(buyAgg._sum.totalAmount ?? 0)
  const sellTotal = Number(sellAgg._sum.totalAmount ?? 0)
  const netInvested = Math.max(0, buyTotal - sellTotal)

  const totalBudget = userSettings?.investmentBudget ?? null
  const remainingBudget = totalBudget !== null ? Math.max(0, totalBudget - netInvested) : null

  return NextResponse.json({
    totalBudget,
    netInvested,
    remainingBudget,
  })
}
