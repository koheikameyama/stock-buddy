import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

/**
 * オンボーディング提案をウォッチリストに追加するAPI
 * 既存ユーザーが「もう一度提案を受ける」を使った場合に呼ばれる
 */
export async function POST(request: Request) {
  try {
    const session = await auth()

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { recommendations } = body

    if (!recommendations || !Array.isArray(recommendations)) {
      return NextResponse.json(
        { error: "recommendations is required" },
        { status: 400 }
      )
    }

    // ユーザーを取得
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // ウォッチリスト数制限をチェック（最大5銘柄）
    const watchlistCount = await prisma.watchlist.count({
      where: { userId: user.id },
    })

    // 新規追加される銘柄数をカウント
    let newEntriesCount = 0
    for (const rec of recommendations) {
      const stock = await prisma.stock.findUnique({
        where: { tickerCode: rec.tickerCode },
      })
      if (!stock) continue

      const existingEntry = await prisma.watchlist.findUnique({
        where: {
          userId_stockId: {
            userId: user.id,
            stockId: stock.id,
          },
        },
      })

      if (!existingEntry) {
        newEntriesCount++
      }
    }

    if (watchlistCount + newEntriesCount > 5) {
      return NextResponse.json(
        { error: `ウォッチリストには最大5銘柄まで登録できます（現在${watchlistCount}銘柄）` },
        { status: 400 }
      )
    }

    // ウォッチリストに追加
    for (const rec of recommendations) {
      // 銘柄を検索
      const stock = await prisma.stock.findUnique({
        where: { tickerCode: rec.tickerCode },
      })

      if (!stock) {
        console.warn(`Stock not found: ${rec.tickerCode}`)
        continue
      }

      // 既存のウォッチリストエントリを確認
      const existingEntry = await prisma.watchlist.findUnique({
        where: {
          userId_stockId: {
            userId: user.id,
            stockId: stock.id,
          },
        },
      })

      if (existingEntry) {
        // 既に存在する場合は更新
        await prisma.watchlist.update({
          where: { id: existingEntry.id },
          data: {
            recommendedPrice: rec.recommendedPrice,
            recommendedQty: rec.quantity,
            reason: rec.reason,
            source: "onboarding",
          },
        })
      } else {
        // 新規追加
        await prisma.watchlist.create({
          data: {
            userId: user.id,
            stockId: stock.id,
            recommendedPrice: rec.recommendedPrice,
            recommendedQty: rec.quantity,
            reason: rec.reason,
            source: "onboarding",
          },
        })
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error adding to watchlist:", error)
    return NextResponse.json(
      { error: "Failed to add to watchlist" },
      { status: 500 }
    )
  } finally {
    await prisma.$disconnect()
  }
}
