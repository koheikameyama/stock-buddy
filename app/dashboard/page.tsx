import { auth } from "@/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { PrismaClient } from "@prisma/client"
import PortfolioGrowthChart from "./PortfolioGrowthChart"
import Header from "@/app/components/Header"

const prisma = new PrismaClient()

export default async function DashboardPage() {
  const session = await auth()

  if (!session?.user?.email) {
    redirect("/login")
  }

  // ユーザー情報を取得
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: {
      portfolio: {
        include: {
          stocks: {
            include: {
              stock: true,
            },
          },
          snapshots: {
            orderBy: { date: "asc" },
            take: 30, // 過去30日分
          },
        },
      },
      coachMessages: {
        orderBy: { date: "desc" },
        take: 1, // 最新のメッセージのみ
      },
    },
  })

  const hasPortfolio = !!user?.portfolio
  const stockCount = user?.portfolio?.stocks.length || 0

  // スナップショットデータを整形
  const snapshots = user?.portfolio?.snapshots.map((s) => ({
    date: s.date.toISOString(),
    totalValue: Number(s.totalValue),
    gainLossPct: Number(s.gainLossPct),
  })) || []

  // 今日のコーチメッセージを取得
  const todayMessage = user?.coachMessages[0]

  // デフォルトメッセージ（メッセージが生成されていない場合）
  const defaultMessage = hasPortfolio
    ? `${stockCount}銘柄を一緒に見守っていますね。今日も市場の動きをチェックしましょう！`
    : "まだ投資を始めていませんね。一緒にあなたにぴったりの銘柄を探しましょう！"

  const coachMessage = todayMessage?.message || defaultMessage

  return (
    <>
      <Header />
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
                {hasPortfolio ? (
                  <>
                    <Link
                      href="/dashboard/portfolio"
                      className="px-4 py-2 bg-white text-blue-600 rounded-lg font-semibold hover:bg-blue-50 transition-colors text-center text-sm sm:text-base"
                    >
                      ポートフォリオを見る
                    </Link>
                    <Link
                      href="/dashboard/reports"
                      className="px-4 py-2 bg-blue-400 text-white rounded-lg font-semibold hover:bg-blue-500 transition-colors text-center text-sm sm:text-base"
                    >
                      今日の振り返り
                    </Link>
                  </>
                ) : (
                  <Link
                    href="/onboarding"
                    className="inline-block w-full sm:w-auto px-6 py-3 bg-white text-blue-600 rounded-lg font-semibold hover:bg-blue-50 transition-colors text-center"
                  >
                    銘柄を探す
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 成長グラフ */}
        {hasPortfolio && <PortfolioGrowthChart snapshots={snapshots} />}

        {/* クイックアクションカード */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 mt-8">
          <Link
            href="/dashboard/portfolio"
            className="group bg-white rounded-xl p-6 shadow-md hover:shadow-xl transition-all border-2 border-transparent hover:border-blue-500"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center text-2xl">
                📊
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
                  あなたの投資
                </h3>
                <p className="text-sm text-gray-500">{stockCount}銘柄</p>
              </div>
            </div>
            <p className="text-sm text-gray-600">
              一緒に見守りましょう
            </p>
          </Link>

          <Link
            href="/dashboard/reports"
            className="group bg-white rounded-xl p-6 shadow-md hover:shadow-xl transition-all border-2 border-transparent hover:border-blue-500"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center text-2xl">
                💡
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
                  振り返り
                </h3>
                <p className="text-sm text-gray-500">アドバイス</p>
              </div>
            </div>
            <p className="text-sm text-gray-600">
              今日の分析をチェック
            </p>
          </Link>

          <Link
            href="/dashboard/settings"
            className="group bg-white rounded-xl p-6 shadow-md hover:shadow-xl transition-all border-2 border-transparent hover:border-blue-500"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center text-2xl">
                ⚙️
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
                  投資スタイル
                </h3>
                <p className="text-sm text-gray-500">設定</p>
              </div>
            </div>
            <p className="text-sm text-gray-600">
              設定を変更できます
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
          </div>
        </div>
      </div>
    </main>
    </>
  )
}
