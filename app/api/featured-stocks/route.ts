import { NextRequest, NextResponse } from "next/server"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

/**
 * GET /api/featured-stocks
 * 今日の注目銘柄を取得
 */
export async function GET() {
  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // 今日の注目銘柄を取得
    const featuredStocks = await prisma.dailyFeaturedStock.findMany({
      where: {
        date: today,
      },
      include: {
        stock: {
          include: {
            prices: {
              orderBy: { date: "desc" },
              take: 1,
            },
          },
        },
      },
      orderBy: {
        position: "asc",
      },
    })

    // 注目銘柄が存在しない場合は生成する
    if (featuredStocks.length === 0) {
      return NextResponse.json(
        { featuredStocks: [], needsGeneration: true },
        { status: 200 }
      )
    }

    // レスポンス整形
    const response = featuredStocks.map((fs) => ({
      id: fs.id,
      position: fs.position,
      reason: fs.reason,
      score: fs.score,
      stock: {
        id: fs.stock.id,
        tickerCode: fs.stock.tickerCode,
        name: fs.stock.name,
        sector: fs.stock.sector,
        currentPrice: fs.stock.prices[0]
          ? Number(fs.stock.prices[0].close)
          : null,
      },
    }))

    return NextResponse.json({ featuredStocks: response }, { status: 200 })
  } catch (error) {
    console.error("Error fetching featured stocks:", error)
    return NextResponse.json(
      { error: "注目銘柄の取得に失敗しました" },
      { status: 500 }
    )
  } finally {
    await prisma.$disconnect()
  }
}
