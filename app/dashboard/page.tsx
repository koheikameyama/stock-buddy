import { auth } from "@/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
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

        {/* 今日のメッセージセクション */}
        <div className="mb-6 sm:mb-8 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-2xl p-6 sm:p-8 text-white shadow-lg">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="text-4xl sm:text-5xl">👋</div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl sm:text-2xl font-bold mb-2">今日のメッセージ</h2>
              <p className="text-sm sm:text-lg mb-4 text-blue-50 leading-relaxed">
                {coachMessage}
              </p>
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                <Link
                  href="/my-stocks"
                  className="px-4 py-2 bg-white text-blue-600 rounded-lg font-semibold hover:bg-blue-50 transition-colors text-center text-sm sm:text-base"
                >
                  {hasHoldings ? "マイ銘柄を見る" : "銘柄を探す"}
                </Link>
              </div>
            </div>
          </div>
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

        {/* クイックアクションカード */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <Link
            href="/my-stocks"
            className="group bg-white rounded-xl p-6 shadow-md hover:shadow-xl transition-all border-2 border-transparent hover:border-blue-500"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center text-2xl">
                📊
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
                  マイ銘柄
                </h3>
                <p className="text-sm text-gray-500">
                  {stockCount}銘柄保有 / {user.userStocks.filter((s) => s.quantity === null).length}銘柄ウォッチ中
                </p>
              </div>
            </div>
            <p className="text-sm text-gray-600">
              保有銘柄とウォッチリストを管理
            </p>
          </Link>

          <Link
            href="/dashboard/settings"
            className="group bg-white rounded-xl p-6 shadow-md hover:shadow-xl transition-all border-2 border-transparent hover:border-purple-500"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center text-2xl">
                ⚙️
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-gray-900 group-hover:text-purple-600 transition-colors">
                  設定
                </h3>
                <p className="text-sm text-gray-500">投資スタイル・通知</p>
              </div>
            </div>
            <p className="text-sm text-gray-600">
              アプリの設定を管理
            </p>
          </Link>
        </div>

        {/* サポートセクション */}
        <div className="bg-white rounded-xl p-5 sm:p-6 shadow-md">
          <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-3 sm:mb-4 flex items-center gap-2">
            <span className="text-xl sm:text-2xl">🤝</span>
            困ったことはありませんか？
          </h3>
          <p className="text-sm sm:text-base text-gray-600 mb-4">
            投資について分からないことがあれば、いつでもサポートします。
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/about/stock-selection"
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-semibold text-center"
            >
              取扱銘柄について
            </Link>
            <Link
              href="/dashboard/stock-request"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-semibold text-center"
            >
              📝 銘柄追加リクエスト
            </Link>
          </div>
        </div>
      </div>
    </main>
    </>
  )
}
