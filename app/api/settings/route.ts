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

    const { investmentAmount, monthlyAmount, investmentPeriod, riskTolerance } =
      await request.json()

    // バリデーション
    const investmentAmountNum = parseInt(investmentAmount)
    const monthlyAmountNum = parseInt(monthlyAmount)

    if (isNaN(investmentAmountNum) || investmentAmountNum < 0) {
      return NextResponse.json(
        { error: "追加投資金額を正しく入力してください" },
        { status: 400 }
      )
    }

    if (isNaN(monthlyAmountNum) || monthlyAmountNum < 0) {
      return NextResponse.json(
        { error: "月々の積立金額を正しく入力してください" },
        { status: 400 }
      )
    }

    if (!investmentPeriod || !riskTolerance) {
      return NextResponse.json(
        { error: "投資期間とリスク許容度を選択してください" },
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
        investmentAmount: investmentAmountNum,
        monthlyAmount: monthlyAmountNum,
        investmentPeriod,
        riskTolerance,
      },
      update: {
        investmentAmount: investmentAmountNum,
        monthlyAmount: monthlyAmountNum,
        investmentPeriod,
        riskTolerance,
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
