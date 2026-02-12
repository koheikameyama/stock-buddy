import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import Header from "@/app/components/Header"
import TrackedStockDetailClient from "./TrackedStockDetailClient"

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

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  })

  if (!user) {
    redirect("/login")
  }

  // Fetch the tracked stock
  const trackedStock = await prisma.trackedStock.findFirst({
    where: {
      id,
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
    },
    createdAt: trackedStock.createdAt.toISOString(),
  }

  return (
    <>
      <Header />
      <TrackedStockDetailClient stock={stockData} />
    </>
  )
}
