import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

// GET: ユーザー設定を取得
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        settings: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    return NextResponse.json({ settings: user.settings })
  } catch (error) {
    console.error("Error fetching settings:", error)
    return NextResponse.json(
      { error: "設定の取得に失敗しました" },
      { status: 500 }
    )
  }
}

// PUT: ユーザー設定を更新
export async function PUT(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const {
      investmentPeriod,
      riskTolerance,
      investmentBudget,
      targetReturnRate,
      stopLossRate,
    } = await request.json()

    // バリデーション
    if (!investmentPeriod || !riskTolerance) {
      return NextResponse.json(
        { error: "投資期間とリスク許容度を選択してください" },
        { status: 400 }
      )
    }

    // 目標利益率のバリデーション（設定されている場合のみ）
    const validReturnRates = [5, 10, 15, 20, 30]
    if (targetReturnRate !== undefined && targetReturnRate !== null && !validReturnRates.includes(targetReturnRate)) {
      return NextResponse.json(
        { error: "無効な目標利益率です" },
        { status: 400 }
      )
    }

    // 損切りラインのバリデーション（設定されている場合のみ）
    const validStopLossRates = [-5, -10, -15, -20]
    if (stopLossRate !== undefined && stopLossRate !== null && !validStopLossRates.includes(stopLossRate)) {
      return NextResponse.json(
        { error: "無効な損切りラインです" },
        { status: 400 }
      )
    }

    // ユーザー情報を取得
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        settings: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // ユーザー設定を更新
    const updatedSettings = await prisma.userSettings.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        investmentPeriod,
        riskTolerance,
        investmentBudget: investmentBudget ?? null,
        targetReturnRate: targetReturnRate ?? null,
        stopLossRate: stopLossRate ?? null,
      },
      update: {
        investmentPeriod,
        riskTolerance,
        investmentBudget: investmentBudget ?? null,
        targetReturnRate: targetReturnRate ?? null,
        stopLossRate: stopLossRate ?? null,
      },
    })

    return NextResponse.json({
      success: true,
      message: "投資スタイルを更新しました",
      settings: updatedSettings,
    })
  } catch (error) {
    console.error("Error updating settings:", error)
    return NextResponse.json(
      { error: "設定の更新に失敗しました" },
      { status: 500 }
    )
  }
}
