import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import Header from "@/app/components/Header"
import PortfolioAnalysisClient from "./PortfolioAnalysisClient"

export default async function PortfolioAnalysisPage() {
  const session = await auth()

  if (!session?.user?.email) {
    redirect("/login")
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: {
      watchlistStocks: { select: { id: true } },
      portfolioStocks: { select: { id: true } },
    },
  })

  if (!user) {
    redirect("/login")
  }

  return (
    <>
      <Header />
      <main className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-blue-50 pb-8">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-8">
          <PortfolioAnalysisClient
            portfolioCount={user.portfolioStocks.length}
            watchlistCount={user.watchlistStocks.length}
          />
        </div>
      </main>
    </>
  )
}
