import { Suspense } from "react"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import Header from "@/app/components/Header"
import Footer from "@/app/components/Footer"
import BottomNavigation from "@/app/components/BottomNavigation"
import RecommendationDetailClient from "./RecommendationDetailClient"
import { StockDetailSkeleton } from "@/components/skeletons"

export default async function RecommendationDetailPage({
  params,
}: {
  params: Promise<{ stockId: string }>
}) {
  const session = await auth()
  const { stockId } = await params

  if (!session?.user?.email) {
    redirect("/login")
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  })

  if (!user) {
    redirect("/login")
  }

  return (
    <>
      <Header />
      <Suspense fallback={<StockDetailSkeleton />}>
        <RecommendationDetailContent stockId={stockId} userId={user.id} />
      </Suspense>
      <Footer />
      <BottomNavigation />
    </>
  )
}

async function RecommendationDetailContent({
  stockId,
  userId,
}: {
  stockId: string
  userId: string
}) {
  // Fetch stock and its recommendation data
  const [stock, personalRec, featuredStock] = await Promise.all([
    prisma.stock.findUnique({
      where: { id: stockId },
    }),
    // Get personal recommendation for this user
    prisma.userDailyRecommendation.findFirst({
      where: { stockId, userId },
      orderBy: { date: "desc" },
    }),
    // Get featured stock (if this is from "みんなが注目")
    prisma.dailyFeaturedStock.findFirst({
      where: { stockId },
      orderBy: { date: "desc" },
    }),
  ])

  if (!stock) {
    redirect("/dashboard")
  }

  const stockData = {
    id: stock.id,
    tickerCode: stock.tickerCode,
    name: stock.name,
    sector: stock.sector,
    market: stock.market,
    currentPrice: null,
    fiftyTwoWeekHigh: stock.fiftyTwoWeekHigh ? Number(stock.fiftyTwoWeekHigh) : null,
    fiftyTwoWeekLow: stock.fiftyTwoWeekLow ? Number(stock.fiftyTwoWeekLow) : null,
    pbr: stock.pbr ? Number(stock.pbr) : null,
    per: stock.per ? Number(stock.per) : null,
    roe: stock.roe ? Number(stock.roe) : null,
    operatingCF: stock.operatingCF ? Number(stock.operatingCF) : null,
    freeCF: stock.freeCF ? Number(stock.freeCF) : null,
    isProfitable: stock.isProfitable,
    profitTrend: stock.profitTrend,
    revenueGrowth: stock.revenueGrowth ? Number(stock.revenueGrowth) : null,
    netIncomeGrowth: stock.netIncomeGrowth ? Number(stock.netIncomeGrowth) : null,
    eps: stock.eps ? Number(stock.eps) : null,
    latestRevenue: stock.latestRevenue ? Number(stock.latestRevenue) : null,
    latestNetIncome: stock.latestNetIncome ? Number(stock.latestNetIncome) : null,
  }

  // Determine which recommendation to use (personal takes priority)
  const recommendation = personalRec
    ? {
        type: "personal" as const,
        category: null,
        reason: personalRec.reason,
        date: personalRec.date.toISOString(),
      }
    : featuredStock
    ? {
        type: "featured" as const,
        category: featuredStock.category,
        reason: featuredStock.reason,
        date: featuredStock.date.toISOString(),
      }
    : null

  return <RecommendationDetailClient stock={stockData} recommendation={recommendation} />
}
