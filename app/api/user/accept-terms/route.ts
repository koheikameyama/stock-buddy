import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

export async function POST() {
  try {
    const session = await auth()

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // ユーザーの同意フラグを更新
    await prisma.user.update({
      where: { email: session.user.email },
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
