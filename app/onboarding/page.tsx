import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { PrismaClient } from "@prisma/client"
import OnboardingClient from "./OnboardingClient"

const prisma = new PrismaClient()

export default async function OnboardingPage() {
  const session = await auth()

  if (!session?.user?.email) {
    redirect("/login")
  }

  // ユーザーのポートフォリオと設定を確認
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: {
      settings: true,
      portfolio: {
        include: {
          stocks: true,
        },
      },
    },
  })

  // 既存ユーザーかどうかを判定
  const isExistingUser = !!user?.settings

  return <OnboardingClient isExistingUser={isExistingUser} />
}
