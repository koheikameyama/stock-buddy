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

  // ユーザーのポートフォリオと設定を取得
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
    },
  })

  if (!user || !user.portfolio || !user.settings) {
    // ポートフォリオまたは設定がない場合はオンボーディングにリダイレクト
    redirect("/onboarding")
  }

  const portfolio = user.portfolio
  const settings = user.settings
  const stocks = portfolio.stocks

  if (stocks.length === 0) {
    redirect("/onboarding")
  }

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
      }))}
    />
  )
}
