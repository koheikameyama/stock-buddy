"use client"

import { useEffect, useState } from "react"

interface Stock {
  id: string
  stockId: string
  tickerCode: string
  name: string
  market: string
  sector: string | null
  quantity: number
  averagePrice: string
}

interface StockPrice {
  tickerCode: string
  currentPrice: number
  previousClose: number
  change: number
  changePercent: number
  volume: number
  high: number
  low: number
}

interface Settings {
  investmentAmount: number
  investmentPeriod: string
  riskTolerance: string
}

export default function PortfolioClient({
  settings,
  stocks,
}: {
  settings: Settings
  stocks: Stock[]
}) {
  const [prices, setPrices] = useState<Record<string, StockPrice>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchPrices() {
      try {
        setLoading(true)
        const response = await fetch("/api/stocks/prices")
        if (!response.ok) {
          throw new Error("株価の取得に失敗しました")
        }
        const data = await response.json()
        const priceMap: Record<string, StockPrice> = {}
        data.prices.forEach((price: StockPrice) => {
          priceMap[price.tickerCode] = price
        })
        setPrices(priceMap)
        setError(null)
      } catch (err) {
        console.error(err)
        setError("株価の取得に失敗しました")
      } finally {
        setLoading(false)
      }
    }

    fetchPrices()
    // 5分ごとに更新
    const interval = setInterval(fetchPrices, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white py-12 px-4">
      <div className="max-w-6xl mx-auto">
        {/* ヘッダー */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            あなたのポートフォリオ
          </h1>
          <p className="text-lg text-gray-600">AIが選んだおすすめ銘柄</p>
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

        {/* エラー表示 */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-8">
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {/* 推奨銘柄リスト */}
        <div className="space-y-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-gray-900">推奨銘柄</h2>
            {loading && (
              <p className="text-sm text-gray-500">株価を取得中...</p>
            )}
          </div>

          {stocks.map((portfolioStock) => {
            const averagePrice = Number(portfolioStock.averagePrice)
            const totalCost = averagePrice * portfolioStock.quantity
            const price = prices[portfolioStock.tickerCode]

            const currentValue = price
              ? price.currentPrice * portfolioStock.quantity
              : null
            const profit = currentValue ? currentValue - totalCost : null
            const profitPercent = profit && totalCost > 0 ? (profit / totalCost) * 100 : null

            return (
              <div
                key={portfolioStock.id}
                className="bg-white rounded-2xl shadow-md p-6 hover:shadow-lg transition-shadow"
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900 mb-1">
                      {portfolioStock.name}
                    </h3>
                    <p className="text-gray-500">{portfolioStock.tickerCode}</p>
                  </div>
                  <div className="text-right">
                    {price ? (
                      <>
                        <p className="text-sm text-gray-500 mb-1">現在価格</p>
                        <p className="text-3xl font-bold text-blue-600">
                          {price.currentPrice.toLocaleString()}円
                        </p>
                        <div className="flex items-center justify-end mt-1">
                          {price.change >= 0 ? (
                            <span className="text-green-600 font-semibold flex items-center">
                              <svg
                                className="w-4 h-4 mr-1"
                                fill="currentColor"
                                viewBox="0 0 20 20"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z"
                                  clipRule="evenodd"
                                />
                              </svg>
                              +{price.change.toLocaleString()}円 (+
                              {price.changePercent.toFixed(2)}%)
                            </span>
                          ) : (
                            <span className="text-red-600 font-semibold flex items-center">
                              <svg
                                className="w-4 h-4 mr-1"
                                fill="currentColor"
                                viewBox="0 0 20 20"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 12.586V5a1 1 0 012 0v7.586l2.293-2.293a1 1 0 011.414 0z"
                                  clipRule="evenodd"
                                />
                              </svg>
                              {price.change.toLocaleString()}円 (
                              {price.changePercent.toFixed(2)}%)
                            </span>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="text-sm text-gray-500 mb-1">推奨購入価格</p>
                        <p className="text-3xl font-bold text-gray-400">
                          {averagePrice.toLocaleString()}円
                        </p>
                      </>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <p className="text-sm text-gray-500 mb-1">保有/推奨株数</p>
                    <p className="text-xl font-semibold text-gray-900">
                      {portfolioStock.quantity}株
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 mb-1">購入時価格</p>
                    <p className="text-xl font-semibold text-gray-900">
                      {averagePrice.toLocaleString()}円
                    </p>
                  </div>
                </div>

                {price && profit !== null && profitPercent !== null && (
                  <div className="bg-gray-50 rounded-lg p-4 mb-4">
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <p className="text-sm text-gray-500 mb-1">購入時総額</p>
                        <p className="text-lg font-semibold text-gray-900">
                          {totalCost.toLocaleString()}円
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500 mb-1">現在評価額</p>
                        <p className="text-lg font-semibold text-gray-900">
                          {currentValue?.toLocaleString()}円
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500 mb-1">損益</p>
                        <p
                          className={`text-lg font-bold ${
                            profit >= 0 ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {profit >= 0 ? "+" : ""}
                          {profit.toLocaleString()}円 ({profitPercent >= 0 ? "+" : ""}
                          {profitPercent.toFixed(2)}%)
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="bg-blue-50 rounded-lg p-4">
                  <p className="text-sm font-semibold text-gray-700 mb-2">
                    📊 この銘柄について
                  </p>
                  <p className="text-gray-700 leading-relaxed">
                    {portfolioStock.sector && `セクター: ${portfolioStock.sector} | `}
                    市場: {portfolioStock.market}
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
                  .toLocaleString()}
                円
              </p>
            </div>
            {!loading && Object.keys(prices).length > 0 && (
              <div className="text-right">
                <p className="text-blue-100 mb-1">現在評価額</p>
                <p className="text-3xl font-bold">
                  {stocks
                    .reduce((sum, s) => {
                      const price = prices[s.tickerCode]
                      return sum + (price ? price.currentPrice * s.quantity : 0)
                    }, 0)
                    .toLocaleString()}
                  円
                </p>
              </div>
            )}
            <div className="text-right">
              <p className="text-blue-100 mb-1">予算</p>
              <p className="text-2xl font-bold">
                {settings.investmentAmount.toLocaleString()}円
              </p>
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
              <span>
                投資は自己責任で行ってください。損失が発生する可能性があります。
              </span>
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
