import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

/**
 * POST /api/watchlist/virtual-purchase
 *
 * ウォッチリスト銘柄の仮想購入を設定
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.email) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 })
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

    const body = await req.json()
    const { watchlistId, virtualBuyPrice, virtualQuantity } = body

    if (!watchlistId) {
      return NextResponse.json(
        { error: "watchlistIdが必要です" },
        { status: 400 }
      )
    }

    // ウォッチリストアイテムの存在確認と所有者チェック
    const watchlist = await prisma.watchlist.findUnique({
      where: { id: watchlistId },
      include: {
        stock: {
          select: {
            name: true,
            tickerCode: true,
          },
        },
      },
    })

    if (!watchlist) {
      return NextResponse.json(
        { error: "ウォッチリストが見つかりません" },
        { status: 404 }
      )
    }

    if (watchlist.userId !== user.id) {
      return NextResponse.json(
        { error: "このウォッチリストにアクセスする権限がありません" },
        { status: 403 }
      )
    }

    // 仮想購入を設定
    const updated = await prisma.watchlist.update({
      where: { id: watchlistId },
      data: {
        virtualBuyPrice: virtualBuyPrice ? Number(virtualBuyPrice) : null,
        virtualBuyDate: virtualBuyPrice ? new Date() : null,
        virtualQuantity: virtualQuantity ? Number(virtualQuantity) : null,
      },
      include: {
        stock: {
          select: {
            name: true,
            tickerCode: true,
          },
        },
      },
    })

    return NextResponse.json({
      success: true,
      message: virtualBuyPrice
        ? "仮想購入を設定しました"
        : "仮想購入をキャンセルしました",
      watchlist: {
        id: updated.id,
        stockName: updated.stock.name,
        tickerCode: updated.stock.tickerCode,
        virtualBuyPrice: updated.virtualBuyPrice,
        virtualBuyDate: updated.virtualBuyDate,
        virtualQuantity: updated.virtualQuantity,
      },
    })
  } catch (error) {
    console.error("Error setting virtual purchase:", error)
    return NextResponse.json(
      { error: "仮想購入の設定に失敗しました" },
      { status: 500 }
    )
  } finally {
    await prisma.$disconnect()
  }
}

/**
 * DELETE /api/watchlist/virtual-purchase
 *
 * 仮想購入をキャンセル
 */
export async function DELETE(req: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.email) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 })
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

    const { searchParams } = new URL(req.url)
    const watchlistId = searchParams.get("watchlistId")

    if (!watchlistId) {
      return NextResponse.json(
        { error: "watchlistIdが必要です" },
        { status: 400 }
      )
    }

    // ウォッチリストアイテムの存在確認と所有者チェック
    const watchlist = await prisma.watchlist.findUnique({
      where: { id: watchlistId },
    })

    if (!watchlist) {
      return NextResponse.json(
        { error: "ウォッチリストが見つかりません" },
        { status: 404 }
      )
    }

    if (watchlist.userId !== user.id) {
      return NextResponse.json(
        { error: "このウォッチリストにアクセスする権限がありません" },
        { status: 403 }
      )
    }

    // 仮想購入をキャンセル
    await prisma.watchlist.update({
      where: { id: watchlistId },
      data: {
        virtualBuyPrice: null,
        virtualBuyDate: null,
        virtualQuantity: null,
      },
    })

    return NextResponse.json({
      success: true,
      message: "仮想購入をキャンセルしました",
    })
  } catch (error) {
    console.error("Error canceling virtual purchase:", error)
    return NextResponse.json(
      { error: "仮想購入のキャンセルに失敗しました" },
      { status: 500 }
    )
  } finally {
    await prisma.$disconnect()
  }
}
