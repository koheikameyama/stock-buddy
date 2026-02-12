import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import Header from "@/app/components/Header"
import MyStockDetailClient from "./MyStockDetailClient"
import { calculatePortfolioFromTransactions } from "@/lib/portfolio-calculator"
import { fetchStockPrices } from "@/lib/stock-price-fetcher"

export default async function MyStockDetailPage({
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

  // Fetch the specific user stock (either portfolio or watchlist)
  const portfolioStock = await prisma.portfolioStock.findFirst({
    where: {
      id,
      userId: user.id,
    },
    include: {
      stock: true,
      transactions: {
        orderBy: {
          transactionDate: "desc",
        },
      },
    },
  })

  const watchlistStock = await prisma.watchlistStock.findFirst({
    where: {
      id,
      userId: user.id,
    },
    include: {
      stock: true,
    },
  })

  const userStock = portfolioStock || watchlistStock

  if (!userStock) {
    redirect("/my-stocks")
  }

  // リアルタイム株価を取得
  const prices = await fetchStockPrices([userStock.stock.tickerCode])
  const currentPrice = prices[0]?.currentPrice ?? null

  // Calculate portfolio values from transactions
  let calculatedQuantity: number | undefined
  let calculatedAveragePrice: number | undefined
  let calculatedPurchaseDate: string | undefined

  if (portfolioStock && portfolioStock.transactions.length > 0) {
    const { quantity, averagePurchasePrice } = calculatePortfolioFromTransactions(
      portfolioStock.transactions
    )
    calculatedQuantity = quantity
    calculatedAveragePrice = averagePurchasePrice.toNumber()

    // Get the first purchase date
    const firstBuyTransaction = [...portfolioStock.transactions]
      .sort((a, b) => a.transactionDate.getTime() - b.transactionDate.getTime())
      .find((t) => t.type === "buy")
    calculatedPurchaseDate = firstBuyTransaction?.transactionDate.toISOString()
  }

  // Transform to unified format
  const stockData = {
    id: userStock.id,
    stockId: userStock.stockId,
    type: portfolioStock ? ("portfolio" as const) : ("watchlist" as const),
    // Portfolio fields (calculated from transactions)
    quantity: calculatedQuantity,
    averagePurchasePrice: calculatedAveragePrice,
    purchaseDate: calculatedPurchaseDate,
    transactions: portfolioStock?.transactions.map((t) => ({
      id: t.id,
      type: t.type,
      quantity: t.quantity,
      price: Number(t.price),
      totalAmount: Number(t.totalAmount),
      transactionDate: t.transactionDate.toISOString(),
    })),
    // Stock info
    stock: {
      id: userStock.stock.id,
      tickerCode: userStock.stock.tickerCode,
      name: userStock.stock.name,
      sector: userStock.stock.sector,
      market: userStock.stock.market,
      currentPrice,
      fiftyTwoWeekHigh: userStock.stock.fiftyTwoWeekHigh
        ? Number(userStock.stock.fiftyTwoWeekHigh)
        : null,
      fiftyTwoWeekLow: userStock.stock.fiftyTwoWeekLow
        ? Number(userStock.stock.fiftyTwoWeekLow)
        : null,
      // Financial metrics
      pbr: userStock.stock.pbr ? Number(userStock.stock.pbr) : null,
      per: userStock.stock.per ? Number(userStock.stock.per) : null,
      roe: userStock.stock.roe ? Number(userStock.stock.roe) : null,
      operatingCF: userStock.stock.operatingCF
        ? Number(userStock.stock.operatingCF)
        : null,
      freeCF: userStock.stock.freeCF ? Number(userStock.stock.freeCF) : null,
    },
  }

  return (
    <>
      <Header />
      <MyStockDetailClient stock={stockData} />
    </>
  )
}
