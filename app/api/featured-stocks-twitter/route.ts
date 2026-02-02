import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

/**
 * Twitter連携で発見した注目銘柄を取得
 * カテゴリ別（surge/stable/trending）に分類して返す
 */
export async function GET() {
  try {
    const session = await auth()

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // 今日の日付（00:00:00）
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Twitter連携の注目銘柄を取得
    const featuredStocks = await prisma.featuredStock.findMany({
      where: {
        date: {
          gte: today,
        },
        source: "twitter",
      },
      include: {
        stock: {
          select: {
            id: true,
            tickerCode: true,
            name: true,
            sector: true,
            currentPrice: true,
          },
        },
      },
      orderBy: {
        score: "desc",
      },
    })

    return NextResponse.json({
      success: true,
      featuredStocks,
      count: featuredStocks.length,
    })
  } catch (error) {
    console.error("Error fetching featured stocks:", error)
    return NextResponse.json(
      { error: "Failed to fetch featured stocks" },
      { status: 500 }
    )
  }
}
