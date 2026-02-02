import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import PortfolioGrowthChart from "./PortfolioGrowthChart"
import Header from "@/app/components/Header"
import DashboardClient from "./DashboardClient"
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

  // スナップショットデータは削除されたので空配列
  const snapshots: never[] = []


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
      <main className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-blue-50 pb-8">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-8">
          {/* ページタイトル */}
          <div className="mb-4 sm:mb-8">
            <h1 className="text-xl sm:text-3xl font-bold text-gray-900">
              おはようございます、{session.user.name?.split(" ")[0]}さん！
            </h1>
            <p className="text-xs sm:text-base text-gray-600 mt-1">今日も一緒に投資を見守りましょう</p>
          </div>

          {/* クイックナビゲーション */}
          <div className="mb-6 sm:mb-8">
            <a
              href="/my-stocks"
              className="inline-flex items-center gap-3 px-4 py-3 bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md hover:border-blue-300 transition-all group"
            >
              <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                <svg
                  className="w-5 h-5 text-blue-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <div className="flex-1">
                <div className="text-sm sm:text-base font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                  マイ銘柄を見る
                </div>
                <div className="text-xs text-gray-500">
                  気になる銘柄と保有銘柄を管理
                </div>
              </div>
              <svg
                className="w-5 h-5 text-gray-400 group-hover:text-blue-600 transition-colors"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </a>
          </div>



        {/* 成長グラフ */}
        {hasHoldings && <PortfolioGrowthChart snapshots={snapshots} />}

        {/* 今日の注目銘柄（カテゴリ別） */}
        {user && (
          <div className="mb-4 sm:mb-8 mt-4 sm:mt-8">
            <FeaturedStocksByCategory userId={user.id} />
          </div>
        )}
      </div>
    </main>
    </>
  )
}
