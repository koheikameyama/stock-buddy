import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

/**
 * 銘柄リクエストを作成する
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "認証が必要です" },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { tickerCode, name, market, reason } = body

    // バリデーション
    if (!tickerCode || tickerCode.trim() === "") {
      return NextResponse.json(
        { error: "ティッカーコードを入力してください" },
        { status: 400 }
      )
    }

    // 既に同じティッカーコードの銘柄が存在するかチェック
    const existingStock = await prisma.stock.findUnique({
      where: { tickerCode: tickerCode.trim() },
      select: { id: true, name: true },
    })

    if (existingStock) {
      return NextResponse.json(
        {
          error: "この銘柄は既に登録されています",
          stock: existingStock
        },
        { status: 409 }
      )
    }

    // 同じユーザーが同じティッカーコードで既にリクエストしているかチェック
    const existingRequest = await prisma.stockRequest.findFirst({
      where: {
        userId: session.user.id,
        tickerCode: tickerCode.trim(),
        status: {
          in: ["pending", "approved"]
        }
      },
    })

    if (existingRequest) {
      return NextResponse.json(
        {
          error: "この銘柄は既にリクエスト済みです",
          request: existingRequest
        },
        { status: 409 }
      )
    }

    // リクエストを作成
    const stockRequest = await prisma.stockRequest.create({
      data: {
        userId: session.user.id,
        tickerCode: tickerCode.trim(),
        name: name?.trim() || null,
        market: market?.trim() || null,
        reason: reason?.trim() || null,
        status: "pending",
      },
    })

    return NextResponse.json(
      {
        success: true,
        message: "銘柄追加のリクエストを送信しました",
        request: stockRequest,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error("Stock request creation error:", error)
    return NextResponse.json(
      { error: "リクエストの作成に失敗しました" },
      { status: 500 }
    )
  }
}

/**
 * ユーザーの銘柄リクエスト一覧を取得する
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "認証が必要です" },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status")
    const limit = parseInt(searchParams.get("limit") || "20")

    const where: { userId: string; status?: string } = {
      userId: session.user.id,
    }

    if (status) {
      where.status = status
    }

    const requests = await prisma.stockRequest.findMany({
      where,
      orderBy: {
        createdAt: "desc",
      },
      take: limit,
    })

    return NextResponse.json({
      requests,
      count: requests.length,
    })
  } catch (error) {
    console.error("Stock requests fetch error:", error)
    return NextResponse.json(
      { error: "リクエストの取得に失敗しました" },
      { status: 500 }
    )
  }
}
