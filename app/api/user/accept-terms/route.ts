import { NextResponse } from "next/server"
import { getAuthUser } from "@/lib/auth-utils"
import { prisma } from "@/lib/prisma"

export async function POST() {
  const { user, error } = await getAuthUser()
  if (error) return error

  try {
    // ユーザーの同意フラグを更新
    await prisma.user.update({
      where: { id: user.id },
      data: {
        termsAccepted: true,
        termsAcceptedAt: new Date(),
        privacyPolicyAccepted: true,
        privacyPolicyAcceptedAt: new Date(),
      },
    })

    return NextResponse.json({
      success: true,
      message: "利用規約とプライバシーポリシーに同意しました",
    })
  } catch (error) {
    console.error("Error accepting terms:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
