import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import PortfolioGrowthChart from "./PortfolioGrowthChart"
import Header from "@/app/components/Header"
import DashboardClient from "./DashboardClient"
import HotStocks from "./HotStocks"
import FeaturedStocksByCategory from "./FeaturedStocksByCategory"

export default async function DashboardPage() {
  const session = await auth()

  if (!session?.user?.email) {
    redirect("/login")
  }

  // ユーザー情報を取得
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: {
      id: true,
      termsAccepted: true,
      privacyPolicyAccepted: true,
      settings: true,
      userStocks: {
        include: {
          stock: true,
        },
      },
    },
  })

  if (!user) {
    redirect("/login")
  }

  // 利用規約・プライバシーポリシーの同意はクライアント側でモーダル表示するため、ここではチェックしない

  const hasHoldings = user.userStocks.some((s) => s.quantity !== null)
  const hasWatchlist = user.userStocks.some((s) => s.quantity === null)
  const stockCount = user.userStocks.filter((s) => s.quantity !== null).length

  // スナップショットデータは削除されたので空配列
  const snapshots: never[] = []

  // デフォルトメッセージ
  const coachMessage = hasHoldings
    ? `${stockCount}銘柄を一緒に見守っていますね。今日も市場の動きをチェックしましょう！`
    : "まだ投資を始めていませんね。一緒にあなたにぴったりの銘柄を探しましょう！"

  return (
    <>
      <Header />
      <DashboardClient
        hasHoldings={hasHoldings}
        hasWatchlist={hasWatchlist}
        termsAccepted={user.termsAccepted}
        privacyPolicyAccepted={user.privacyPolicyAccepted}
        hasInvestmentStyle={!!user.settings}
      />
      <main className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-blue-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          {/* ページタイトル */}
          <div className="mb-6 sm:mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
              おはようございます、{session.user.name?.split(" ")[0]}さん！
            </h1>
            <p className="text-sm sm:text-base text-gray-600 mt-1">今日も一緒に投資を見守りましょう</p>
          </div>



        {/* 成長グラフ */}
        {hasHoldings && <PortfolioGrowthChart snapshots={snapshots} />}

        {/* 今日の注目銘柄（カテゴリ別） */}
        {user && (
          <div className="mb-8 mt-8">
            <FeaturedStocksByCategory userId={user.id} />
          </div>
        )}

        {/* 今週のチャンス銘柄 */}
        <div className="mb-8">
          <HotStocks />
        </div>


 
      </div>
    </main>
    </>
  )
}
