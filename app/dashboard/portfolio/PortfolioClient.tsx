"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import PurchaseModal from "./PurchaseModal"
import AddStockModal from "./AddStockModal"
import UpdateStockModal from "./UpdateStockModal"
import SettingsModal from "./SettingsModal"

interface StockAnalysis {
  action: string
  analysis: string
  reasoning: string | null
  currentPrice: string
  gainLoss: string
  gainLossPct: string
}

interface Stock {
  id: string
  stockId: string
  tickerCode: string
  name: string
  market: string
  sector: string | null
  quantity: number
  averagePrice: string
  reason: string | null
  isSimulation: boolean
  analysis: StockAnalysis | null
}

interface WatchlistItem {
  id: string
  stockId: string
  tickerCode: string
  name: string
  market: string
  sector: string | null
  recommendedPrice: string
  recommendedQty: number
  reason: string | null
  source: string
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
  investmentAmount: number | null
  investmentPeriod: string
  riskTolerance: string
}

export default function PortfolioClient({
  settings,
  stocks,
  watchlist,
}: {
  settings: Settings
  stocks: Stock[]
  watchlist: WatchlistItem[]
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState<"portfolio" | "watchlist">("portfolio")
  const [prices, setPrices] = useState<Record<string, StockPrice>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedWatchlistItem, setSelectedWatchlistItem] = useState<WatchlistItem | null>(null)
  const [showPurchaseModal, setShowPurchaseModal] = useState(false)
  const [showAddStockModal, setShowAddStockModal] = useState(false)
  const [showUpdateStockModal, setShowUpdateStockModal] = useState(false)
  const [selectedStock, setSelectedStock] = useState<Stock | null>(null)
  const [deletingStockId, setDeletingStockId] = useState<string | null>(null)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [addStockMode, setAddStockMode] = useState<"portfolio" | "watchlist">("portfolio")
  const [expandedStocks, setExpandedStocks] = useState<Set<string>>(new Set())

  // URLパラメータからタブを設定
  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab === 'watchlist') {
      setActiveTab('watchlist')
    }
  }, [searchParams])

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

  const handleDeleteStock = async (portfolioStockId: string, stockName: string) => {
    if (!confirm(`${stockName}を今持ってる銘柄から削除しますか？`)) {
      return
    }

    try {
      setDeletingStockId(portfolioStockId)
      setError(null)

      const response = await fetch("/api/portfolio/remove-stock", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ portfolioStockId }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "削除に失敗しました")
      }

      // 成功: ページをリフレッシュ
      router.refresh()
    } catch (err: any) {
      console.error(err)
      setError(err.message || "削除に失敗しました")
    } finally {
      setDeletingStockId(null)
    }
  }

  const handleUpdateStock = async (data: {
    purchaseDate: string
    purchasePrice: number
    quantity: number
    isSimulation: boolean
  }) => {
    if (!selectedStock) return

    try {
      setError(null)

      const response = await fetch("/api/portfolio/update-stock", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          portfolioStockId: selectedStock.id,
          purchaseDate: data.purchaseDate,
          purchasePrice: data.purchasePrice,
          quantity: data.quantity,
          currentIsSimulation: selectedStock.isSimulation,
          newIsSimulation: data.isSimulation,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "更新に失敗しました")
      }

      // 成功: ページをリフレッシュ
      setShowUpdateStockModal(false)
      setSelectedStock(null)
      router.refresh()
    } catch (err: any) {
      console.error(err)
      throw err
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white py-6 sm:py-12 px-4">
      <div className="max-w-6xl mx-auto">

        {/* ヘッダー */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-4xl font-bold text-gray-900 mb-2">
            あなたの投資を見守りましょう
          </h1>
          <p className="text-base sm:text-lg text-gray-600">一緒に成長を確認していきますね</p>
        </div>

        {/* タブ切り替え */}
        <div className="flex border-b border-gray-200 mb-6 overflow-x-auto">
          <button
            onClick={() => setActiveTab("portfolio")}
            className={`px-4 sm:px-6 py-3 font-semibold transition-colors whitespace-nowrap text-sm sm:text-base ${
              activeTab === "portfolio"
                ? "border-b-2 border-blue-600 text-blue-600"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            今持っている銘柄 ({stocks.length})
          </button>
          <button
            onClick={() => setActiveTab("watchlist")}
            className={`px-4 sm:px-6 py-3 font-semibold transition-colors whitespace-nowrap text-sm sm:text-base ${
              activeTab === "watchlist"
                ? "border-b-2 border-blue-600 text-blue-600"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            気になる銘柄リスト ({watchlist.length})
          </button>
        </div>

        {/* ポートフォリオ概要 */}
        <div className="bg-white rounded-2xl shadow-md p-5 sm:p-6 mb-6 sm:mb-8 relative">
          <button
            onClick={() => setShowSettingsModal(true)}
            className="absolute top-6 right-6 text-gray-400 hover:text-blue-600 transition-colors"
            title="投資スタイルを変更"
          >
            <svg
              className="w-5 h-5"
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
          </button>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4 pr-8">投資スタイル</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
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

        {/* 保有銘柄タブ */}
        {activeTab === "portfolio" && (
          <>
            {/* 推奨銘柄リスト */}
            <div className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                <h2 className="text-2xl font-bold text-gray-900">推奨銘柄</h2>
                {loading && (
                  <p className="text-sm text-gray-500">株価を取得中...</p>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-1">※登録できるのは5銘柄まで（現在: {stocks.length}/5）</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-4">
              <button
                onClick={() => router.push('/onboarding')}
                className="px-4 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors flex items-center gap-2 text-sm sm:text-base"
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
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                もう一度提案を受ける
              </button>
              <button
                onClick={() => {
                  setAddStockMode("portfolio")
                  setShowAddStockModal(true)
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm sm:text-base"
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
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                銘柄を追加
              </button>
            </div>
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
                className="bg-white rounded-2xl shadow-md p-6 hover:shadow-lg transition-shadow relative"
              >
                <button
                  onClick={() => handleDeleteStock(portfolioStock.id, portfolioStock.name)}
                  disabled={deletingStockId === portfolioStock.id}
                  className="absolute top-4 right-4 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
                  title="削除"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>

                {/* 銘柄名・ティッカー */}
                <div className="mb-4">
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <h3 className="text-2xl font-bold text-gray-900">
                      {portfolioStock.name}
                    </h3>
                    {portfolioStock.isSimulation ? (
                      <span className="px-3 py-1 text-xs font-semibold bg-gray-100 text-gray-600 rounded-full">
                        シミュレーション
                      </span>
                    ) : (
                      <span className="px-3 py-1 text-xs font-semibold bg-green-100 text-green-700 rounded-full">
                        投資中
                      </span>
                    )}
                  </div>
                  <p className="text-gray-500">{portfolioStock.tickerCode}</p>
                </div>

                {/* 損益 or 購入シミュレーション（最重要・最上部に大きく表示） */}
                {portfolioStock.isSimulation ? (
                  // シミュレーション：推奨価格と現在価格の比較
                  <div className="rounded-xl p-6 mb-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200">
                    <div className="text-center">
                      <p className="text-sm font-semibold text-gray-600 mb-2">今買ったら</p>
                      {price ? (
                        <>
                          <p className="text-4xl font-bold text-blue-600 mb-1">
                            {(price.currentPrice * portfolioStock.quantity).toLocaleString()}円
                          </p>
                          <p className="text-sm text-gray-600 mb-3">
                            現在価格 {price.currentPrice.toLocaleString()}円 × {portfolioStock.quantity}株
                          </p>
                          <div className="mt-3 pt-3 border-t border-blue-200">
                            <p className="text-xs text-gray-500 mb-1">推奨購入価格との差</p>
                            {price.currentPrice <= averagePrice ? (
                              <p className="text-lg font-bold text-green-600">
                                買い時！ {(averagePrice - price.currentPrice).toLocaleString()}円お得
                              </p>
                            ) : (
                              <p className="text-lg font-bold text-orange-600">
                                {(price.currentPrice - averagePrice).toLocaleString()}円高い
                              </p>
                            )}
                          </div>
                        </>
                      ) : (
                        <p className="text-2xl font-bold text-gray-400">
                          {totalCost.toLocaleString()}円（推奨）
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  // 実投資：損益表示
                  price && profit !== null && profitPercent !== null && (
                    <div className={`rounded-xl p-6 mb-4 ${
                      profit >= 0
                        ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200'
                        : 'bg-gradient-to-r from-red-50 to-rose-50 border-2 border-red-200'
                    }`}>
                      <div className="text-center">
                        <p className="text-sm font-semibold text-gray-600 mb-2">損益</p>
                        <div className="flex items-center justify-center gap-2 mb-1">
                          {profit >= 0 ? (
                            <svg className="w-8 h-8 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                            </svg>
                          ) : (
                            <svg className="w-8 h-8 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 12.586V5a1 1 0 012 0v7.586l2.293-2.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                          <p className={`text-4xl font-bold ${
                            profit >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {profit >= 0 ? '+' : ''}{profit.toLocaleString()}円
                          </p>
                        </div>
                        <p className={`text-2xl font-bold ${
                          profit >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          ({profitPercent >= 0 ? '+' : ''}{profitPercent.toFixed(2)}%)
                        </p>
                        <div className="mt-3 pt-3 border-t border-gray-200 grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-gray-500 mb-1">投資額</p>
                            <p className="font-semibold text-gray-900">{totalCost.toLocaleString()}円</p>
                          </div>
                          <div>
                            <p className="text-gray-500 mb-1">評価額</p>
                            <p className="font-semibold text-gray-900">{currentValue?.toLocaleString()}円</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                )}

                {/* 今日の分析 */}
                {portfolioStock.analysis && (
                  <div className="mb-4 p-4 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg border border-purple-200">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-bold text-purple-900 flex items-center gap-2">
                        🤖 今日の分析
                      </h4>
                      <span
                        className={`px-3 py-1 text-xs font-semibold rounded-full ${
                          portfolioStock.analysis.action === "hold"
                            ? "bg-blue-100 text-blue-700"
                            : portfolioStock.analysis.action === "buy_more"
                              ? "bg-green-100 text-green-700"
                              : portfolioStock.analysis.action === "sell_partial"
                                ? "bg-yellow-100 text-yellow-700"
                                : "bg-red-100 text-red-700"
                        }`}
                      >
                        {portfolioStock.analysis.action === "hold"
                          ? "保有継続"
                          : portfolioStock.analysis.action === "buy_more"
                            ? "買い増し"
                            : portfolioStock.analysis.action === "sell_partial"
                              ? "一部売却"
                              : "売却検討"}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 leading-relaxed mb-3">
                      {portfolioStock.analysis.analysis}
                    </p>
                    {portfolioStock.analysis.reasoning && (
                      <div className="mt-3 pt-3 border-t border-purple-200">
                        <p className="text-xs font-semibold text-purple-900 mb-1">
                          💡 判断理由
                        </p>
                        <p className="text-xs text-gray-600 leading-relaxed">
                          {portfolioStock.analysis.reasoning}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* 詳細情報（折りたたみ可能） */}
                <div className="mb-4">
                  <button
                    onClick={() => {
                      const newExpanded = new Set(expandedStocks)
                      if (newExpanded.has(portfolioStock.id)) {
                        newExpanded.delete(portfolioStock.id)
                      } else {
                        newExpanded.add(portfolioStock.id)
                      }
                      setExpandedStocks(newExpanded)
                    }}
                    className="w-full flex items-center justify-between py-3 px-4 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <span className="text-sm font-semibold text-gray-700">
                      📊 詳細情報を{expandedStocks.has(portfolioStock.id) ? '閉じる' : '見る'}
                    </span>
                    <svg
                      className={`w-5 h-5 text-gray-500 transition-transform ${
                        expandedStocks.has(portfolioStock.id) ? 'rotate-180' : ''
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {expandedStocks.has(portfolioStock.id) && (
                    <div className="mt-3 bg-blue-50 rounded-lg p-4 space-y-3">
                      {price && (
                        <div className="grid grid-cols-2 gap-3 pb-3 border-b border-blue-200">
                          <div>
                            <p className="text-xs text-gray-500 mb-1">現在価格</p>
                            <p className="text-lg font-semibold text-gray-900">
                              {price.currentPrice.toLocaleString()}円
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 mb-1">前日比</p>
                            <p className={`text-lg font-semibold ${
                              price.change >= 0 ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {price.change >= 0 ? '+' : ''}{price.change.toLocaleString()}円
                            </p>
                          </div>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-xs text-gray-500 mb-1">保有株数</p>
                          <p className="text-lg font-semibold text-gray-900">
                            {portfolioStock.quantity}株
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 mb-1">{portfolioStock.isSimulation ? '推奨' : '購入時'}価格</p>
                          <p className="text-lg font-semibold text-gray-900">
                            {averagePrice.toLocaleString()}円
                          </p>
                        </div>
                      </div>
                      <div className="pt-3 border-t border-blue-200">
                        <p className="text-xs text-gray-500 mb-1">銘柄情報</p>
                        <p className="text-sm text-gray-700">
                          {portfolioStock.sector && `セクター: ${portfolioStock.sector} | `}
                          市場: {portfolioStock.market}
                        </p>
                      </div>
                      {portfolioStock.reason && (
                        <div className="pt-3 border-t border-blue-200">
                          <p className="text-xs text-gray-500 mb-1">💡 推奨理由</p>
                          <p className="text-sm text-gray-700 leading-relaxed">
                            {portfolioStock.reason}
                          </p>
                        </div>
                      )}
                      <button
                        onClick={() => {
                          setSelectedStock(portfolioStock)
                          setShowUpdateStockModal(true)
                        }}
                        className="w-full mt-3 py-2 px-4 rounded-lg font-semibold transition-colors bg-blue-600 text-white hover:bg-blue-700"
                      >
                        📝 購入情報を更新
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

            {/* 合計金額（シミュレーション・実投資別） */}
            <div className="mt-8 space-y-4 px-4 sm:px-0">
              {/* シミュレーション合計 */}
              {stocks.filter(s => s.isSimulation).length > 0 && (
                <div className="bg-gradient-to-r from-gray-600 to-gray-700 rounded-xl shadow-sm p-4 text-white">
                  <h3 className="text-sm font-semibold mb-3 text-gray-100">シミュレーション</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <p className="text-gray-200 mb-1 text-xs">投資総額</p>
                      <p className="text-lg font-bold">
                        {stocks
                          .filter(s => s.isSimulation)
                          .reduce((sum, s) => sum + Number(s.averagePrice) * s.quantity, 0)
                          .toLocaleString()}円
                      </p>
                    </div>
                    {!loading && Object.keys(prices).length > 0 && (
                      <div>
                        <p className="text-gray-200 mb-1 text-xs">現在評価額</p>
                        <p className="text-lg font-bold">
                          {stocks
                            .filter(s => s.isSimulation)
                            .reduce((sum, s) => {
                              const price = prices[s.tickerCode]
                              return sum + (price ? price.currentPrice * s.quantity : 0)
                            }, 0)
                            .toLocaleString()}円
                        </p>
                      </div>
                    )}
                    <div>
                      <p className="text-gray-200 mb-1 text-xs">銘柄数</p>
                      <p className="text-lg font-bold">
                        {stocks.filter(s => s.isSimulation).length}銘柄
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* 実投資合計 */}
              {stocks.filter(s => !s.isSimulation).length > 0 && (
                <div className="bg-gradient-to-r from-green-600 to-green-700 rounded-2xl shadow-md p-6 text-white">
                  <h3 className="text-lg font-semibold mb-4 text-green-100">投資中</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    <div>
                      <p className="text-green-100 mb-1 text-sm">投資総額</p>
                      <p className="text-2xl font-bold">
                        {stocks
                          .filter(s => !s.isSimulation)
                          .reduce((sum, s) => sum + Number(s.averagePrice) * s.quantity, 0)
                          .toLocaleString()}円
                      </p>
                    </div>
                    {!loading && Object.keys(prices).length > 0 && (
                      <div>
                        <p className="text-green-100 mb-1 text-sm">現在評価額</p>
                        <p className="text-2xl font-bold">
                          {stocks
                            .filter(s => !s.isSimulation)
                            .reduce((sum, s) => {
                              const price = prices[s.tickerCode]
                              return sum + (price ? price.currentPrice * s.quantity : 0)
                            }, 0)
                            .toLocaleString()}円
                        </p>
                      </div>
                    )}
                    <div>
                      <p className="text-green-100 mb-1 text-sm">銘柄数</p>
                      <p className="text-2xl font-bold">
                        {stocks.filter(s => !s.isSimulation).length}銘柄
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* 総合計 */}
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl shadow-md p-6 text-white">
                <h3 className="text-lg font-semibold mb-4 text-blue-100">総合計</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                  <div>
                    <p className="text-blue-100 mb-1 text-sm">投資総額</p>
                    <p className="text-3xl font-bold">
                      {stocks
                        .reduce((sum, s) => sum + Number(s.averagePrice) * s.quantity, 0)
                        .toLocaleString()}円
                    </p>
                  </div>
                  {!loading && Object.keys(prices).length > 0 && (
                    <div>
                      <p className="text-blue-100 mb-1 text-sm">現在評価額</p>
                      <p className="text-3xl font-bold">
                        {stocks
                          .reduce((sum, s) => {
                            const price = prices[s.tickerCode]
                            return sum + (price ? price.currentPrice * s.quantity : 0)
                          }, 0)
                          .toLocaleString()}円
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="text-blue-100 mb-1 text-sm">総銘柄数</p>
                    <p className="text-3xl font-bold">
                      {stocks.length}銘柄
                    </p>
                  </div>
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
          </>
        )}

        {/* ウォッチリストタブ */}
        {activeTab === "watchlist" && (
          <>
            <div className="space-y-4">
              <div className="mb-4">
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div>
                      <h2 className="text-2xl font-bold text-gray-900">気になる銘柄たち</h2>
                      <p className="text-gray-600 mt-1">
                        AIのおすすめや、あなたが気になる銘柄を保存できます。
                      </p>
                      <p className="text-sm text-gray-500 mt-1">※登録できるのは5銘柄まで（現在: {watchlist.length}/5）</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => router.push('/onboarding')}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors flex items-center gap-2 text-sm sm:text-base whitespace-nowrap"
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
                            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                          />
                        </svg>
                        もう一度提案を受ける
                      </button>
                      <button
                        onClick={() => {
                          setAddStockMode("watchlist")
                          setShowAddStockModal(true)
                        }}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm sm:text-base whitespace-nowrap"
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
                            d="M12 4v16m8-8H4"
                          />
                        </svg>
                        銘柄を追加
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {watchlist.length === 0 ? (
                <div className="bg-white rounded-2xl shadow-md p-12 text-center">
                  <p className="text-gray-500 text-lg mb-4">
                    まだ気になる銘柄がありません
                  </p>
                  <p className="text-gray-400 text-sm">
                    一緒におすすめの銘柄を探しましょう
                  </p>
                </div>
              ) : (
                watchlist.map((item) => {
                  const recommendedPrice = Number(item.recommendedPrice)
                  const totalCost = recommendedPrice * item.recommendedQty
                  const price = prices[item.tickerCode]

                  return (
                    <div
                      key={item.id}
                      className="bg-white rounded-2xl shadow-md p-6 hover:shadow-lg transition-shadow"
                    >
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h3 className="text-2xl font-bold text-gray-900 mb-1">
                            {item.name}
                          </h3>
                          <p className="text-gray-500">{item.tickerCode}</p>
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
                              <p className="text-sm text-gray-500 mb-1">推奨価格</p>
                              <p className="text-3xl font-bold text-gray-600">
                                {recommendedPrice.toLocaleString()}円
                              </p>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                          <p className="text-sm text-gray-500 mb-1">推奨株数</p>
                          <p className="text-xl font-semibold text-gray-900">
                            {item.recommendedQty}株
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500 mb-1">推奨投資額</p>
                          <p className="text-xl font-semibold text-gray-900">
                            {totalCost.toLocaleString()}円
                          </p>
                        </div>
                      </div>

                      {item.reason && (
                        <div className="bg-blue-50 rounded-lg p-4 mb-4">
                          <p className="text-sm font-semibold text-gray-700 mb-2">
                            📊 推奨理由
                          </p>
                          <p className="text-gray-700 leading-relaxed text-sm">
                            {item.reason}
                          </p>
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                        <div className="text-sm text-gray-500">
                          {item.sector && `セクター: ${item.sector} | `}
                          市場: {item.market}
                          {item.source && ` | 提案元: ${item.source === 'onboarding' ? 'オンボーディング' : item.source}`}
                        </div>
                        <button
                          onClick={() => {
                            setSelectedWatchlistItem(item)
                            setShowPurchaseModal(true)
                          }}
                          className="bg-blue-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                        >
                          購入した
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* ウォッチリスト合計 */}
            {watchlist.length > 0 && (
              <div className="mt-8 bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl shadow-md p-6 text-white">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-blue-100 mb-1">推奨投資総額</p>
                    <p className="text-4xl font-bold">
                      {watchlist
                        .reduce(
                          (sum, w) => sum + Number(w.recommendedPrice) * w.recommendedQty,
                          0
                        )
                        .toLocaleString()}
                      円
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-blue-100 mb-1">銘柄数</p>
                    <p className="text-2xl font-bold">
                      {watchlist.length}銘柄
                    </p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Purchase Modal */}
      {selectedWatchlistItem && (
        <PurchaseModal
          isOpen={showPurchaseModal}
          onClose={() => {
            setShowPurchaseModal(false)
            setSelectedWatchlistItem(null)
          }}
          watchlistItem={selectedWatchlistItem}
          onSuccess={() => {
            router.refresh()
          }}
        />
      )}

      {/* Add Stock Modal */}
      <AddStockModal
        isOpen={showAddStockModal}
        onClose={() => setShowAddStockModal(false)}
        onSuccess={() => {
          router.refresh()
        }}
        mode={addStockMode}
      />

      {/* Update Stock Modal */}
      {selectedStock && (
        <UpdateStockModal
          isOpen={showUpdateStockModal}
          onClose={() => {
            setShowUpdateStockModal(false)
            setSelectedStock(null)
          }}
          onSubmit={handleUpdateStock}
          stock={{
            id: selectedStock.id,
            name: selectedStock.name,
            tickerCode: selectedStock.tickerCode,
            quantity: selectedStock.quantity,
            averagePrice: Number(selectedStock.averagePrice),
            isSimulation: selectedStock.isSimulation,
          }}
        />
      )}

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        currentPeriod={settings.investmentPeriod}
        currentRisk={settings.riskTolerance}
        onSuccess={() => {
          router.refresh()
        }}
      />
    </div>
  )
}
