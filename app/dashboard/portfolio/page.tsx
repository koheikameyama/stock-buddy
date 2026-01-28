import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { PrismaClient } from "@prisma/client"

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
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white py-12 px-4">
      <div className="max-w-6xl mx-auto">
        {/* ヘッダー */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            あなたのポートフォリオ
          </h1>
          <p className="text-lg text-gray-600">
            AIが選んだおすすめ銘柄
          </p>
        </div>

        {/* ポートフォリオ概要 */}
        <div className="bg-white rounded-2xl shadow-md p-6 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">投資スタイル</h2>
          <div className="grid grid-cols-3 gap-6">
            <div>
              <p className="text-sm text-gray-500 mb-1">予算</p>
              <p className="text-2xl font-bold text-blue-600">
                {settings.investmentAmount.toLocaleString()}円
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-1">投資期間</p>
              <p className="text-xl font-semibold text-gray-900">
                {settings.investmentPeriod === "short"
                  ? "短期（〜3ヶ月）"
                  : settings.investmentPeriod === "medium"
                  ? "中期（3ヶ月〜1年）"
                  : "長期（1年以上）"}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-1">リスク許容度</p>
              <p className="text-xl font-semibold text-gray-900">
                {settings.riskTolerance === "low"
                  ? "低（安定重視）"
                  : settings.riskTolerance === "medium"
                  ? "中（バランス型）"
                  : "高（成長重視）"}
              </p>
            </div>
          </div>
        </div>

        {/* 推奨銘柄リスト */}
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">推奨銘柄</h2>
          {stocks.map((portfolioStock) => {
            const totalCost = Number(portfolioStock.averagePrice) * portfolioStock.quantity

            return (
              <div
                key={portfolioStock.id}
                className="bg-white rounded-2xl shadow-md p-6 hover:shadow-lg transition-shadow"
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900 mb-1">
                      {portfolioStock.stock.name}
                    </h3>
                    <p className="text-gray-500">{portfolioStock.stock.tickerCode}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-500 mb-1">推奨購入価格</p>
                    <p className="text-3xl font-bold text-blue-600">
                      {Number(portfolioStock.averagePrice).toLocaleString()}円
                    </p>
                  </div>
                </div>

                <div className="mb-4">
                  <p className="text-sm text-gray-500 mb-1">推奨購入株数</p>
                  <p className="text-xl font-semibold text-gray-900">
                    {portfolioStock.quantity}株
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    合計: {totalCost.toLocaleString()}円
                  </p>
                </div>

                <div className="bg-blue-50 rounded-lg p-4">
                  <p className="text-sm font-semibold text-gray-700 mb-2">
                    📊 この銘柄について
                  </p>
                  <p className="text-gray-700 leading-relaxed">
                    {portfolioStock.stock.sector && `セクター: ${portfolioStock.stock.sector} | `}
                    市場: {portfolioStock.stock.market}
                  </p>
                </div>
              </div>
            )
          })}
        </div>

        {/* 合計金額 */}
        <div className="mt-8 bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl shadow-md p-6 text-white">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-blue-100 mb-1">推奨投資総額</p>
              <p className="text-4xl font-bold">
                {stocks
                  .reduce((sum, s) => sum + Number(s.averagePrice) * s.quantity, 0)
                  .toLocaleString()}円
              </p>
            </div>
            <div className="text-right">
              <p className="text-blue-100 mb-1">予算</p>
              <p className="text-2xl font-bold">{settings.investmentAmount.toLocaleString()}円</p>
            </div>
          </div>
        </div>

        {/* 注意事項 */}
        <div className="mt-8 bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            ⚠️ 投資にあたっての注意事項
          </h3>
          <ul className="space-y-2 text-gray-700">
            <li className="flex items-start">
              <span className="mr-2">•</span>
              <span>推奨価格は目安です。実際の株価は市場の状況により変動します。</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">•</span>
              <span>投資は自己責任で行ってください。損失が発生する可能性があります。</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">•</span>
              <span>毎日のレポートで最新の分析と推奨をお届けします。</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}
