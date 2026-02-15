import { Suspense } from "react"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import Header from "@/app/components/Header"
import Footer from "@/app/components/Footer"
import BottomNavigation from "@/app/components/BottomNavigation"
import TrackedStockDetailClient from "./TrackedStockDetailClient"
import { StockDetailSkeleton } from "@/components/skeletons"

export default async function TrackedStockDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  const { id } = await params

  if (!session?.user?.email) {
    redirect("/login")
  }

  return (
    <>
      <Header />
      <Suspense fallback={<StockDetailSkeleton />}>
        <TrackedStockContent email={session.user.email} stockId={id} />
      </Suspense>
      <Footer />
      <BottomNavigation />
    </>
  )
}

async function TrackedStockContent({
  email,
  stockId,
}: {
  email: string
  stockId: string
}) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  })

  if (!user) {
    redirect("/login")
  }

  // Fetch the tracked stock
  const trackedStock = await prisma.trackedStock.findFirst({
    where: {
      id: stockId,
      userId: user.id,
    },
    include: {
      stock: true,
    },
  })

  if (!trackedStock) {
    redirect("/my-stocks")
  }

  // Transform to unified format
  const stockData = {
    id: trackedStock.id,
    stockId: trackedStock.stockId,
    stock: {
      id: trackedStock.stock.id,
      tickerCode: trackedStock.stock.tickerCode,
      name: trackedStock.stock.name,
      sector: trackedStock.stock.sector,
      market: trackedStock.stock.market,
      currentPrice: null as number | null, // Client fetches asynchronously
      fiftyTwoWeekHigh: trackedStock.stock.fiftyTwoWeekHigh
        ? Number(trackedStock.stock.fiftyTwoWeekHigh)
        : null,
      fiftyTwoWeekLow: trackedStock.stock.fiftyTwoWeekLow
        ? Number(trackedStock.stock.fiftyTwoWeekLow)
        : null,
      // Financial metrics
      pbr: trackedStock.stock.pbr ? Number(trackedStock.stock.pbr) : null,
      per: trackedStock.stock.per ? Number(trackedStock.stock.per) : null,
      roe: trackedStock.stock.roe ? Number(trackedStock.stock.roe) : null,
      operatingCF: trackedStock.stock.operatingCF
        ? Number(trackedStock.stock.operatingCF)
        : null,
      freeCF: trackedStock.stock.freeCF ? Number(trackedStock.stock.freeCF) : null,
      // Earnings data
      isProfitable: trackedStock.stock.isProfitable,
      profitTrend: trackedStock.stock.profitTrend,
      revenueGrowth: trackedStock.stock.revenueGrowth
        ? Number(trackedStock.stock.revenueGrowth)
        : null,
      netIncomeGrowth: trackedStock.stock.netIncomeGrowth
        ? Number(trackedStock.stock.netIncomeGrowth)
        : null,
      eps: trackedStock.stock.eps ? Number(trackedStock.stock.eps) : null,
      latestRevenue: trackedStock.stock.latestRevenue
        ? Number(trackedStock.stock.latestRevenue)
        : null,
      latestNetIncome: trackedStock.stock.latestNetIncome
        ? Number(trackedStock.stock.latestNetIncome)
        : null,
    },
    createdAt: trackedStock.createdAt.toISOString(),
  }

  return <TrackedStockDetailClient stock={stockData} />
}
