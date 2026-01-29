import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { PrismaClient } from "@prisma/client"
import { canRequestRecommendation } from "@/lib/recommendation-limit"

const prisma = new PrismaClient()

/**
 * GET /api/onboarding/limit
 * ユーザーの月次AI提案回数制限情報を取得
 */
export async function GET() {
  try {
    const session = await auth()

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // ユーザーIDを取得
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // 月次回数制限をチェック
    const limitCheck = await canRequestRecommendation(user.id)

    return NextResponse.json({
      allowed: limitCheck.allowed,
      currentCount: limitCheck.currentCount,
      maxCount: limitCheck.maxCount,
      remainingCount: limitCheck.maxCount - limitCheck.currentCount,
      resetDate: limitCheck.resetDate.toISOString(),
    })
  } catch (error) {
    console.error("Error checking recommendation limit:", error)
    return NextResponse.json(
      { error: "Failed to check limit" },
      { status: 500 }
    )
  } finally {
    await prisma.$disconnect()
  }
}
