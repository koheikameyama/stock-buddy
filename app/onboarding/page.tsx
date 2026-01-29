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

  // ユーザーのポートフォリオを確認
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: {
      portfolio: {
        include: {
          stocks: true,
        },
      },
    },
  })

  // ポートフォリオに銘柄が既にある場合はダッシュボードへ
  if (user?.portfolio && user.portfolio.stocks.length > 0) {
    redirect("/dashboard")
  }

  return <OnboardingClient />
}
