import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

/**
 * オンボーディング提案をマイ銘柄に追加するAPI
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

    const MAX_USER_STOCKS = 5
    const results = {
      added: 0,
      updated: 0,
      errors: [] as string[],
    }

    // 現在のマイ銘柄数を取得
    const currentCount = await prisma.userStock.count({
      where: { userId: user.id },
    })

    // 各推奨銘柄をマイ銘柄に追加
    for (const rec of recommendations) {
      try {
        // 制限チェック
        if (currentCount + results.added >= MAX_USER_STOCKS) {
          results.errors.push(`最大${MAX_USER_STOCKS}銘柄まで登録できます`)
          break
        }

        // 銘柄を検索
        const stock = await prisma.stock.findUnique({
          where: { tickerCode: rec.tickerCode },
        })

        if (!stock) {
          console.warn(`Stock not found: ${rec.tickerCode}`)
          results.errors.push(`銘柄 ${rec.tickerCode} が見つかりません`)
          continue
        }

        // 既存チェック
        const existing = await prisma.userStock.findFirst({
          where: {
            userId: user.id,
            stockId: stock.id,
          },
        })

        if (existing) {
          // 既存の場合は更新
          await prisma.userStock.update({
            where: { id: existing.id },
            data: {
              note: "オンボーディングから再追加",
              updatedAt: new Date(),
            },
          })
          results.updated++
        } else {
          // 新規追加（気になる銘柄として、quantityはnull）
          await prisma.userStock.create({
            data: {
              userId: user.id,
              stockId: stock.id,
              quantity: null,
              averagePurchasePrice: null,
              note: "オンボーディングから追加",
            },
          })
          results.added++
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
    console.error("Error adding to user stocks:", error)
    return NextResponse.json(
      { error: "Failed to add to user stocks" },
      { status: 500 }
    )
  }
}
