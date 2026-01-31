import { NextResponse, NextRequest } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

/**
 * シミュレーション/実投資を切り替えるAPI
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { portfolioStockId } = await request.json()

    if (!portfolioStockId) {
      return NextResponse.json(
        { error: "portfolioStockId is required" },
        { status: 400 }
      )
    }

    // ユーザーのポートフォリオを確認
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { portfolio: true },
    })

    if (!user?.portfolio) {
      return NextResponse.json(
        { error: "Portfolio not found" },
        { status: 404 }
      )
    }

    // 該当の保有銘柄を取得
    const portfolioStock = await prisma.portfolioStock.findUnique({
      where: { id: portfolioStockId },
    })

    if (!portfolioStock) {
      return NextResponse.json(
        { error: "Stock not found in portfolio" },
        { status: 404 }
      )
    }

    // ポートフォリオの所有者確認
    if (portfolioStock.portfolioId !== user.portfolio.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // isSimulationをトグル
    const updated = await prisma.portfolioStock.update({
      where: { id: portfolioStockId },
      data: {
        isSimulation: !portfolioStock.isSimulation,
      },
    })

    return NextResponse.json({
      success: true,
      isSimulation: updated.isSimulation,
    })
  } catch (error) {
    console.error("Error toggling simulation:", error)
    return NextResponse.json(
      { error: "Failed to toggle simulation status" },
      { status: 500 }
    )
  }
}
