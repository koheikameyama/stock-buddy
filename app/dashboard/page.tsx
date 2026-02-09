import { auth } from "@/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { prisma } from "@/lib/prisma"
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
      watchlistStocks: {
        include: {
          stock: true,
        },
      },
      portfolioStocks: {
        include: {
          stock: true,
        },
      },
    },
  })

  if (!user) {
    redirect("/login")
  }

  // 利用規約・プライバシーポリシー未同意の場合は同意ページへリダイレクト
  if (!user.termsAccepted || !user.privacyPolicyAccepted) {
    redirect("/terms-acceptance")
  }

  const hasHoldings = user.portfolioStocks.length > 0
  const hasWatchlist = user.watchlistStocks.length > 0

  return (
    <>
      <Header />
      <DashboardClient
        hasHoldings={hasHoldings}
        hasWatchlist={hasWatchlist}
        hasInvestmentStyle={!!user.settings}
        investmentPeriod={user.settings?.investmentPeriod}
        riskTolerance={user.settings?.riskTolerance}
        investmentBudget={user.settings?.investmentBudget}
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

          {/* 投資スタイル未設定の場合のプロンプト */}
          {!user.settings && (
            <Link
              href="/dashboard?editStyle=true"
              className="block mb-4 sm:mb-6 bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl p-4 sm:p-5 shadow-md hover:shadow-lg transition-shadow"
            >
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                  <span className="text-2xl sm:text-3xl">📊</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-white font-bold text-base sm:text-lg mb-1">
                    投資スタイルを登録しましょう
                  </div>
                  <div className="text-blue-100 text-xs sm:text-sm">
                    あなたに合った銘柄をおすすめするために、投資期間とリスク許容度を教えてください
                  </div>
                </div>
                <div className="shrink-0">
                  <svg
                    className="w-6 h-6 sm:w-7 sm:h-7 text-white/80"
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
                </div>
              </div>
            </Link>
          )}

          {/* 投資スタイル表示 */}
          {user.settings && (
            <div className="mb-4 sm:mb-6 bg-white rounded-xl p-3 sm:p-4 shadow-sm border border-gray-200">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 sm:gap-3 flex-1 min-w-0">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                    <span className="text-lg sm:text-xl">📊</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-gray-500 mb-1 sm:mb-1.5">あなたの投資スタイル</div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2">
                      <span className="inline-flex items-center px-2 sm:px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 w-fit">
                        {user.settings.investmentPeriod === "short"
                          ? "短期（〜1年）"
                          : user.settings.investmentPeriod === "medium"
                          ? "中期（1〜3年）"
                          : "長期（3年〜）"}
                      </span>
                      <span className="inline-flex items-center px-2 sm:px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 w-fit">
                        {user.settings.riskTolerance === "low"
                          ? "リスク低（安定重視）"
                          : user.settings.riskTolerance === "medium"
                          ? "リスク中（バランス）"
                          : "リスク高（成長重視）"}
                      </span>
                      {user.settings.investmentBudget && (
                        <span className="inline-flex items-center px-2 sm:px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800 w-fit">
                          資金 {(user.settings.investmentBudget / 10000).toLocaleString()}万円
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <Link
                  href="/dashboard?editStyle=true"
                  className="p-1.5 sm:p-2 text-gray-400 hover:text-blue-600 transition-colors shrink-0"
                  title="投資スタイルを編集"
                >
                  <svg
                    className="w-4 h-4 sm:w-5 sm:h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                </Link>
              </div>
            </div>
          )}

          {/* マイ銘柄へのリンク */}
          <Link
            href="/my-stocks"
            className="block mb-6 bg-white rounded-xl p-4 shadow-sm border border-gray-200 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500 flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-white"
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
              <div>
                <div className="text-sm font-semibold text-gray-900">マイ銘柄</div>
                <div className="text-xs text-gray-500">保有銘柄と気になる銘柄を管理</div>
              </div>
              <div className="ml-auto">
                <svg
                  className="w-5 h-5 text-gray-400"
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
              </div>
            </div>
          </Link>

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
