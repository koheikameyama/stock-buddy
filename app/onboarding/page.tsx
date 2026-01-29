import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { PrismaClient } from "@prisma/client"
import OnboardingClient from "./OnboardingClient"

const prisma = new PrismaClient()

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ isExisting?: string }>
}) {
  const session = await auth()

  if (!session?.user?.email) {
    redirect("/login")
  }

  // URLパラメータから既存投資家かどうかを判定
  const params = await searchParams
  const isExistingInvestor = params.isExisting === "true"

  return <OnboardingClient isExistingInvestor={isExistingInvestor} />
}
