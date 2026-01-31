import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { addStockToWatchlist } from "@/lib/watchlist"

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

    const results = {
      added: 0,
      updated: 0,
      errors: [] as string[],
    }

    // 各推奨銘柄をウォッチリストに追加
    for (const rec of recommendations) {
      try {
        // 銘柄を検索
        const stock = await prisma.stock.findUnique({
          where: { tickerCode: rec.tickerCode },
        })

        if (!stock) {
          console.warn(`Stock not found: ${rec.tickerCode}`)
          results.errors.push(`銘柄 ${rec.tickerCode} が見つかりません`)
          continue
        }

        // ウォッチリストに追加（モジュールを使用）
        const result = await addStockToWatchlist({
          userId: user.id,
          stockId: stock.id,
          recommendedPrice: rec.recommendedPrice,
          recommendedQty: rec.quantity,
          reason: rec.reason,
          source: "onboarding",
        })

        if (result.success) {
          if (result.isNew) {
            results.added++
          } else {
            results.updated++
          }
        } else {
          results.errors.push(result.error)
          // 制限エラーの場合はここで中断
          if (result.error.includes("最大")) {
            break
          }
        }
      } catch (error) {
        console.error(`Error processing ${rec.tickerCode}:`, error)
        results.errors.push(`銘柄 ${rec.tickerCode} の処理に失敗しました`)
      }
    }

    return NextResponse.json({
      success: true,
      added: results.added,
      updated: results.updated,
      errors: results.errors,
    })
  } catch (error) {
    console.error("Error adding to watchlist:", error)
    return NextResponse.json(
      { error: "Failed to add to watchlist" },
      { status: 500 }
    )
  }
}
