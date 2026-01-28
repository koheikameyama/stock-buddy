import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export async function POST(request: NextRequest) {
  try {
    // 認証チェック
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { budget, monthlyAmount, investmentPeriod, riskTolerance } = await request.json()

    // バリデーション
    const budgetNum = parseInt(budget)
    const monthlyNum = parseInt(monthlyAmount)

    if (isNaN(budgetNum) || budgetNum < 0) {
      return NextResponse.json(
        { error: "追加投資金額を指定してください" },
        { status: 400 }
      )
    }

    if (isNaN(monthlyNum) || monthlyNum < 0) {
      return NextResponse.json(
        { error: "月々の積立金額を指定してください" },
        { status: 400 }
      )
    }

    if (!investmentPeriod || !riskTolerance) {
      return NextResponse.json(
        { error: "投資期間とリスク許容度を指定してください" },
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

    // ユーザー設定を保存または更新
    if (user.settings) {
      await prisma.userSettings.update({
        where: { userId: user.id },
        data: {
          investmentAmount: budgetNum,
          monthlyAmount: monthlyNum,
          investmentPeriod,
          riskTolerance,
        },
      })
    } else {
      await prisma.userSettings.create({
        data: {
          userId: user.id,
          investmentAmount: budgetNum,
          monthlyAmount: monthlyNum,
          investmentPeriod,
          riskTolerance,
        },
      })
    }

    return NextResponse.json({
      success: true,
      message: "投資スタイルを保存しました",
    })
  } catch (error) {
    console.error("Error saving settings:", error)
    return NextResponse.json(
      { error: "設定の保存に失敗しました" },
      { status: 500 }
    )
  }
}
