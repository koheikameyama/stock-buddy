import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { PrismaClient } from "@prisma/client"
import ReportClient from "./ReportClient"

const prisma = new PrismaClient()

export default async function ReportsPage() {
  const session = await auth()

  if (!session?.user?.email) {
    redirect("/login")
  }

  // ユーザーのポートフォリオを取得
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: {
      portfolio: {
        include: {
          stocks: {
            include: {
              stock: true,
            },
          },
        },
      },
    },
  })

  if (!user?.portfolio) {
    redirect("/onboarding")
  }

  // 今日のレポートを取得
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const latestReport = await prisma.dailyReport.findFirst({
    where: {
      portfolioId: user.portfolio.id,
    },
    include: {
      targetStock: true,
    },
    orderBy: {
      reportDate: "desc",
    },
  })

  return (
    <ReportClient
      report={
        latestReport
          ? {
              id: latestReport.id,
              reportDate: latestReport.reportDate.toISOString(),
              action: latestReport.action,
              targetStock: latestReport.targetStock
                ? {
                    tickerCode: latestReport.targetStock.tickerCode,
                    name: latestReport.targetStock.name,
                  }
                : null,
              summary: latestReport.summary,
              reasoning: latestReport.reasoning,
              futurePlan: latestReport.futurePlan,
              keyIndicators: latestReport.keyIndicators as any,
            }
          : null
      }
      portfolioId={user.portfolio.id}
    />
  )
}
