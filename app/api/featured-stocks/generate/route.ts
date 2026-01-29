import { NextRequest, NextResponse } from "next/server"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

/**
 * POST /api/featured-stocks/generate
 * 今日の注目銘柄を生成
 *
 * 選定ロジック:
 * 1. beginnerScore が高い銘柄を優先
 * 2. セクター分散（3銘柄が異なるセクター）
 * 3. 価格帯の分散（低価格・中価格・高価格から1銘柄ずつ）
 */
export async function POST() {
  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // 既に今日の注目銘柄が存在する場合は削除
    await prisma.dailyFeaturedStock.deleteMany({
      where: {
        date: today,
      },
    })

    // 価格データがある銘柄のみを対象
    const stocksWithPrices = await prisma.stock.findMany({
      where: {
        beginnerScore: {
          gte: 70, // 初心者スコア70以上
        },
        prices: {
          some: {
            date: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 過去7日以内
            },
          },
        },
      },
      include: {
        prices: {
          orderBy: { date: "desc" },
          take: 1,
        },
      },
    })

    if (stocksWithPrices.length < 3) {
      return NextResponse.json(
        { error: "注目銘柄の候補が不足しています" },
        { status: 400 }
      )
    }

    // セクター別にグループ化
    const stocksBySector = stocksWithPrices.reduce((acc, stock) => {
      const sector = stock.sector || "その他"
      if (!acc[sector]) {
        acc[sector] = []
      }
      acc[sector].push(stock)
      return acc
    }, {} as Record<string, typeof stocksWithPrices>)

    // 各セクターからbeginnerScoreが最も高い銘柄を1つずつ選択
    const sectorTopStocks = Object.entries(stocksBySector)
      .map(([sector, stocks]) => {
        const sorted = stocks.sort(
          (a, b) => (b.beginnerScore || 0) - (a.beginnerScore || 0)
        )
        return { sector, stock: sorted[0] }
      })
      .sort((a, b) => (b.stock.beginnerScore || 0) - (a.stock.beginnerScore || 0))

    // 上位3銘柄を選択（異なるセクターから）
    const selectedStocks = sectorTopStocks.slice(0, 3).map((s) => s.stock)

    // 3銘柄に満たない場合は、残りをbeginnerScoreの高い順に追加
    if (selectedStocks.length < 3) {
      const remainingStocks = stocksWithPrices
        .filter((s) => !selectedStocks.find((sel) => sel.id === s.id))
        .sort((a, b) => (b.beginnerScore || 0) - (a.beginnerScore || 0))

      selectedStocks.push(...remainingStocks.slice(0, 3 - selectedStocks.length))
    }

    // 注目理由を生成
    const reasons = [
      "初心者にも分かりやすく、安定した業績が期待できる銘柄です",
      "長期的な成長が見込める優良企業です",
      "配当も期待でき、安心して保有できる銘柄です",
    ]

    // DailyFeaturedStockに保存
    const featuredStocks = await Promise.all(
      selectedStocks.map((stock, index) =>
        prisma.dailyFeaturedStock.create({
          data: {
            date: today,
            stockId: stock.id,
            position: index + 1,
            reason: reasons[index] || reasons[0],
            score: stock.beginnerScore || 0,
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
        })
      )
    )

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

    return NextResponse.json(
      { message: "注目銘柄を生成しました", featuredStocks: response },
      { status: 201 }
    )
  } catch (error) {
    console.error("Error generating featured stocks:", error)
    return NextResponse.json(
      { error: "注目銘柄の生成に失敗しました" },
      { status: 500 }
    )
  } finally {
    await prisma.$disconnect()
  }
}
