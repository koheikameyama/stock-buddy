import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import AuthenticatedLayout from "@/app/components/AuthenticatedLayout"
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
    <AuthenticatedLayout maxWidth="6xl">
      <PortfolioAnalysisClient
        portfolioCount={user.portfolioStocks.length}
        watchlistCount={user.watchlistStocks.length}
      />
    </AuthenticatedLayout>
  )
}
