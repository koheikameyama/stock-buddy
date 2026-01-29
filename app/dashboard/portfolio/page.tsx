import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { PrismaClient } from "@prisma/client"
import PortfolioClient from "./PortfolioClient"

const prisma = new PrismaClient()

export default async function PortfolioPage() {
  const session = await auth()

  if (!session?.user?.email) {
    redirect("/login")
  }

  // ユーザーのポートフォリオ、設定、ウォッチリストを取得
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: {
      settings: true,
      portfolio: {
        include: {
          stocks: {
            include: {
              stock: true,
            },
          },
        },
      },
      watchlist: {
        include: {
          stock: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      },
    },
  })

  if (!user) {
    redirect("/login")
  }

  // ポートフォリオがない場合は作成
  let portfolio = user.portfolio
  if (!portfolio) {
    portfolio = await prisma.portfolio.create({
      data: {
        userId: user.id,
        name: "マイポートフォリオ",
      },
      include: {
        stocks: {
          include: {
            stock: true,
          },
        },
      },
    })
  }

  // 設定がない場合はオンボーディングへ
  if (!user.settings) {
    redirect("/onboarding")
  }

  const settings = user.settings
  const stocks = portfolio.stocks || []
  const watchlist = user.watchlist || []

  return (
    <PortfolioClient
      settings={settings}
      stocks={stocks.map((s) => ({
        id: s.id,
        stockId: s.stock.id,
        tickerCode: s.stock.tickerCode,
        name: s.stock.name,
        market: s.stock.market,
        sector: s.stock.sector,
        quantity: s.quantity,
        averagePrice: s.averagePrice.toString(),
        reason: s.reason,
      }))}
      watchlist={watchlist.map((w) => ({
        id: w.id,
        stockId: w.stock.id,
        tickerCode: w.stock.tickerCode,
        name: w.stock.name,
        market: w.stock.market,
        sector: w.stock.sector,
        recommendedPrice: w.recommendedPrice.toString(),
        recommendedQty: w.recommendedQty,
        reason: w.reason,
        source: w.source,
      }))}
    />
  )
}
