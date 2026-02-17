import { Suspense } from "react"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import AuthenticatedLayout from "@/app/components/AuthenticatedLayout"
import MarketMoverDetailClient from "./MarketMoverDetailClient"
import { StockDetailSkeleton } from "@/components/skeletons"

export default async function MarketMoverDetailPage({
  params,
}: {
  params: Promise<{ stockId: string }>
}) {
  const session = await auth()
  const { stockId } = await params

  if (!session?.user?.email) {
    redirect("/login")
  }

  return (
    <AuthenticatedLayout maxWidth="4xl">
      <Suspense fallback={<StockDetailSkeleton />}>
        <MarketMoverDetailContent stockId={stockId} />
      </Suspense>
    </AuthenticatedLayout>
  )
}

async function MarketMoverDetailContent({ stockId }: { stockId: string }) {
  // Fetch stock and its latest market mover analysis
  const [stock, latestMover] = await Promise.all([
    prisma.stock.findUnique({
      where: { id: stockId },
    }),
    prisma.dailyMarketMover.findFirst({
      where: { stockId },
      orderBy: { date: "desc" },
    }),
  ])

  if (!stock) {
    redirect("/market-movers")
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
    volatility: stock.volatility ? Number(stock.volatility) : null,
    weekChangeRate: stock.weekChangeRate ? Number(stock.weekChangeRate) : null,
  }

  const moverData = latestMover
    ? {
        type: latestMover.type as "gainer" | "loser",
        changeRate: Number(latestMover.changeRate),
        analysis: latestMover.analysis,
        relatedNews: latestMover.relatedNews as { title: string; url: string | null; sentiment: string | null }[] | null,
        date: latestMover.date.toISOString(),
      }
    : null

  return <MarketMoverDetailClient stock={stockData} mover={moverData} />
}
