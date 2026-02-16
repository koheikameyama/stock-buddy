"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import StockCard from "./StockCard"
import TrackedStockCard from "./TrackedStockCard"
import SoldStockCard from "./SoldStockCard"
import AddStockDialog from "./AddStockDialog"
import AdditionalPurchaseDialog from "./AdditionalPurchaseDialog"
import { UPDATE_SCHEDULES, MAX_PORTFOLIO_STOCKS, MAX_WATCHLIST_STOCKS } from "@/lib/constants"
import { useMarkPageSeen } from "@/app/hooks/useMarkPageSeen"

interface UserStock {
  id: string
  userId: string
  stockId: string
  type: "watchlist" | "portfolio"
  // Portfolio fields
  quantity?: number
  averagePurchasePrice?: number
  purchaseDate?: string
  lastAnalysis?: string | null
  shortTerm?: string | null
  mediumTerm?: string | null
  longTerm?: string | null
  // AI推奨（StockAnalysisから取得）
  recommendation?: "buy" | "sell" | "hold" | null
  // 分析日時（StockAnalysisから取得）
  analyzedAt?: string | null
  stock: {
    id: string
    tickerCode: string
    name: string
    sector: string | null
    market: string
    currentPrice: number | null
  }
  createdAt: string
  updatedAt: string
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

interface PurchaseRecommendation {
  recommendation: "buy" | "stay"
  confidence: number
  reason: string
  caution: string
  analyzedAt?: string
}

interface TrackedStock {
  id: string
  stockId: string
  stock: {
    id: string
    tickerCode: string
    name: string
    sector: string | null
    market: string
  }
  currentPrice: number | null
  change: number | null
  changePercent: number | null
  createdAt: string
}

interface SoldStock {
  id: string
  stockId: string
  stock: {
    id: string
    tickerCode: string
    name: string
    sector: string | null
    market: string
  }
  firstPurchaseDate: string
  lastSellDate: string
  totalBuyQuantity: number
  totalBuyAmount: number
  totalSellAmount: number
  totalProfit: number
  profitPercent: number
  transactions: {
    id: string
    type: string
    quantity: number
    price: number
    totalAmount: number
    transactionDate: string
    note: string | null
  }[]
}

type TabType = "portfolio" | "watchlist" | "tracked" | "sold"

export default function MyStocksClient() {
  const router = useRouter()
  // ページ訪問時に閲覧済みをマーク
  useMarkPageSeen("my-stocks")
  const [userStocks, setUserStocks] = useState<UserStock[]>([])
  const [prices, setPrices] = useState<Record<string, StockPrice>>({})
  const [recommendations, setRecommendations] = useState<Record<string, PurchaseRecommendation>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showTransactionDialog, setShowTransactionDialog] = useState(false)
  const [selectedStock, setSelectedStock] = useState<UserStock | null>(null)
  const [transactionType, setTransactionType] = useState<"buy" | "sell">("buy")
  const [activeTab, setActiveTab] = useState<TabType>("portfolio")
  // ウォッチリストからの購入用
  const [purchaseFromWatchlist, setPurchaseFromWatchlist] = useState<UserStock | null>(null)
  // 追跡・過去の保有銘柄からの移動用
  const [stockToMove, setStockToMove] = useState<{
    stockId: string
    tickerCode: string
    name: string
    market?: string
    sector?: string | null
  } | null>(null)
  // 追跡銘柄用
  const [trackedStocks, setTrackedStocks] = useState<TrackedStock[]>([])
  const [trackedStocksLoading, setTrackedStocksLoading] = useState(false)
  // 売却済み銘柄用
  const [soldStocks, setSoldStocks] = useState<SoldStock[]>([])
  const [soldStocksLoading, setSoldStocksLoading] = useState(false)

  // Fetch user stocks and counts
  useEffect(() => {
    async function fetchData() {
      try {
        // 並列でユーザー銘柄、追跡銘柄、売却済み銘柄を取得
        const [stocksResponse, trackedResponse, soldResponse] = await Promise.all([
          fetch("/api/user-stocks?mode=all"),
          fetch("/api/tracked-stocks"),
          fetch("/api/sold-stocks"),
        ])

        if (!stocksResponse.ok) {
          throw new Error("Failed to fetch stocks")
        }
        const stocksData = await stocksResponse.json()
        setUserStocks(stocksData)

        // 追跡銘柄（エラーでも続行）
        if (trackedResponse.ok) {
          const trackedData = await trackedResponse.json()
          setTrackedStocks(trackedData)
        }

        // 売却済み銘柄（エラーでも続行）
        if (soldResponse.ok) {
          const soldData = await soldResponse.json()
          setSoldStocks(soldData)
        }
      } catch (err) {
        console.error("Error fetching data:", err)
        setError("銘柄の取得に失敗しました")
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  // Fetch stock prices for user stocks
  useEffect(() => {
    async function fetchPrices() {
      // ユーザー銘柄のティッカーコードを取得
      const tickerCodes = userStocks.map((s) => s.stock.tickerCode)
      if (tickerCodes.length === 0) return

      try {
        const response = await fetch(`/api/stocks/prices?tickers=${tickerCodes.join(",")}`)
        if (!response.ok) {
          throw new Error("Failed to fetch prices")
        }
        const data = await response.json()
        const priceMap: Record<string, StockPrice> = {}
        data.prices.forEach((price: StockPrice) => {
          priceMap[price.tickerCode] = price
        })
        setPrices((prev) => ({ ...prev, ...priceMap }))
      } catch (err) {
        console.error("Error fetching prices:", err)
      }
    }

    if (userStocks.length > 0) {
      fetchPrices()
      // Update prices every 5 minutes
      const interval = setInterval(fetchPrices, 5 * 60 * 1000)
      return () => clearInterval(interval)
    }
  }, [userStocks])

  // Fetch stock prices for tracked stocks
  useEffect(() => {
    async function fetchTrackedPrices() {
      const tickerCodes = trackedStocks.map((s) => s.stock.tickerCode)
      if (tickerCodes.length === 0) return

      try {
        const response = await fetch(`/api/stocks/prices?tickers=${tickerCodes.join(",")}`)
        if (!response.ok) return

        const data = await response.json()
        const priceMap = new Map<string, StockPrice>(
          data.prices?.map((p: StockPrice) => [p.tickerCode, p]) || []
        )

        // 追跡銘柄の株価を更新
        setTrackedStocks((prev) =>
          prev.map((ts) => {
            const priceData = priceMap.get(ts.stock.tickerCode)
            return priceData
              ? {
                  ...ts,
                  currentPrice: priceData.currentPrice,
                  change: priceData.change,
                  changePercent: priceData.changePercent,
                }
              : ts
          })
        )
      } catch (err) {
        console.error("Error fetching tracked prices:", err)
      }
    }

    if (trackedStocks.length > 0) {
      fetchTrackedPrices()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackedStocks.length])

  // Fetch purchase recommendations for watchlist stocks
  useEffect(() => {
    async function fetchRecommendations() {
      const watchlistStocks = userStocks.filter((s) => s.type === "watchlist")
      if (watchlistStocks.length === 0) return

      try {
        // Fetch recommendations for each watchlist stock
        const results = await Promise.allSettled(
          watchlistStocks.map((stock) =>
            fetch(`/api/stocks/${stock.stockId}/purchase-recommendation`)
              .then((res) => (res.ok ? res.json() : null))
              .then((data) => ({ stockId: stock.stockId, data }))
          )
        )

        const recommendationMap: Record<string, PurchaseRecommendation> = {}
        results.forEach((result) => {
          if (result.status === "fulfilled" && result.value.data) {
            recommendationMap[result.value.stockId] = {
              recommendation: result.value.data.recommendation,
              confidence: result.value.data.confidence,
              reason: result.value.data.reason,
              caution: result.value.data.caution,
              analyzedAt: result.value.data.analyzedAt,
            }
          }
        })
        setRecommendations(recommendationMap)
      } catch (err) {
        console.error("Error fetching recommendations:", err)
      }
    }

    if (userStocks.length > 0) {
      fetchRecommendations()
    }
  }, [userStocks])

  // Fetch tracked stocks when tab is switched
  useEffect(() => {
    async function fetchTrackedStocks() {
      if (activeTab !== "tracked" || trackedStocks.length > 0) return

      setTrackedStocksLoading(true)
      try {
        const response = await fetch("/api/tracked-stocks")
        if (!response.ok) throw new Error("Failed to fetch tracked stocks")
        const data = await response.json()
        setTrackedStocks(data)
      } catch (err) {
        console.error("Error fetching tracked stocks:", err)
      } finally {
        setTrackedStocksLoading(false)
      }
    }

    fetchTrackedStocks()
  }, [activeTab, trackedStocks.length])

  // Fetch sold stocks when tab is switched
  useEffect(() => {
    async function fetchSoldStocks() {
      if (activeTab !== "sold" || soldStocks.length > 0) return

      setSoldStocksLoading(true)
      try {
        const response = await fetch("/api/sold-stocks")
        if (!response.ok) throw new Error("Failed to fetch sold stocks")
        const data = await response.json()
        setSoldStocks(data)
      } catch (err) {
        console.error("Error fetching sold stocks:", err)
      } finally {
        setSoldStocksLoading(false)
      }
    }

    fetchSoldStocks()
  }, [activeTab, soldStocks.length])

  // 追跡銘柄をウォッチリストに追加
  const handleTrackedToWatchlist = async (stockId: string, tickerCode: string, name: string) => {
    try {
      const response = await fetch("/api/user-stocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickerCode, type: "watchlist" }),
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to add to watchlist")
      }
      const newStock = await response.json()
      setUserStocks((prev) => [...prev, newStock])
      // 追跡銘柄リストから削除
      setTrackedStocks((prev) => prev.filter((ts) => ts.stockId !== stockId))
      setActiveTab("watchlist")
    } catch (err) {
      console.error("Error adding to watchlist:", err)
      toast.error(err instanceof Error ? err.message : "追加に失敗しました")
    }
  }

  // 追跡銘柄をポートフォリオに追加（AddStockDialogを開く）
  const handleTrackedToPurchase = (stockId: string, tickerCode: string, name: string, market: string, sector: string | null) => {
    setStockToMove({ stockId, tickerCode, name, market, sector })
    setShowAddDialog(true)
  }

  // 過去の保有銘柄をウォッチリストに追加
  const handleSoldToWatchlist = async (stockId: string, tickerCode: string, name: string) => {
    try {
      const response = await fetch("/api/user-stocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickerCode, type: "watchlist" }),
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to add to watchlist")
      }
      const newStock = await response.json()
      setUserStocks((prev) => [...prev, newStock])
      setActiveTab("watchlist")
    } catch (err) {
      console.error("Error adding to watchlist:", err)
      toast.error(err instanceof Error ? err.message : "追加に失敗しました")
    }
  }

  // 過去の保有銘柄を再購入（AddStockDialogを開く）
  const handleSoldToRepurchase = (stockId: string, tickerCode: string, name: string, market: string, sector: string | null) => {
    setStockToMove({ stockId, tickerCode, name, market, sector })
    setShowAddDialog(true)
  }

  const handleAddStock = () => {
    setShowAddDialog(true)
  }

  const handleAdditionalPurchase = (stock: UserStock) => {
    setSelectedStock(stock)
    setTransactionType("buy")
    setShowTransactionDialog(true)
  }

  const handleSell = (stock: UserStock) => {
    setSelectedStock(stock)
    setTransactionType("sell")
    setShowTransactionDialog(true)
  }

  const handlePurchaseFromWatchlist = (stock: UserStock) => {
    setPurchaseFromWatchlist(stock)
    setShowAddDialog(true)
  }

  const handleStockAdded = (newStock: UserStock) => {
    setUserStocks((prev) => [...prev, newStock])
    setShowAddDialog(false)
  }

  const handleTransactionSuccess = (updatedStock: UserStock) => {
    setUserStocks((prev) =>
      prev.map((s) => (s.id === updatedStock.id ? updatedStock : s))
    )
    setShowTransactionDialog(false)
    setSelectedStock(null)
  }

  // Filter stocks by type
  // quantity > 0 のものだけを保有中として表示（0株は「過去の保有」に表示される）
  const portfolioStocks = userStocks.filter((s) => s.type === "portfolio" && (s.quantity ?? 0) > 0)
  const watchlistStocks = userStocks.filter((s) => s.type === "watchlist")
  const displayStocks = activeTab === "portfolio" ? portfolioStocks : watchlistStocks

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-10 sm:h-12 w-10 sm:w-12 border-b-2 border-blue-600"></div>
        <p className="mt-4 text-sm sm:text-base text-gray-600">読み込み中...</p>
      </div>
    )
  }

  return (
    <>
      {/* 戻るボタン */}
        <div className="mb-4 sm:mb-6">
          <button
            onClick={() => router.push('/dashboard')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
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
                d="M15 19l-7-7 7-7"
              />
            </svg>
            <span className="text-sm sm:text-base font-semibold">ダッシュボードに戻る</span>
          </button>
        </div>

        {/* Page Header */}
        <div className="mb-4 sm:mb-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl sm:text-3xl font-bold text-gray-900">
                マイ銘柄
              </h1>
              <p className="text-xs sm:text-base text-gray-600 mt-1">
                気になる銘柄と保有銘柄を一覧管理
              </p>
            </div>
            <button
              onClick={() => router.push('/portfolio-analysis')}
              className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 hover:border-blue-300 transition-all shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <span>総評</span>
            </button>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-4 sm:mb-6 bg-red-50 border border-red-200 rounded-lg p-3 sm:p-4">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="relative mb-6">
          <div className="flex overflow-x-auto scrollbar-hide border-b border-gray-200 -mx-3 px-3 sm:mx-0 sm:px-0">
            <button
              onClick={() => setActiveTab("portfolio")}
              className={`flex-shrink-0 px-3 sm:px-6 py-3 font-semibold text-sm sm:text-base transition-colors whitespace-nowrap ${
                activeTab === "portfolio"
                  ? "border-b-2 border-blue-600 text-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              保有中 ({portfolioStocks.length})
            </button>
            <button
              onClick={() => setActiveTab("watchlist")}
              className={`flex-shrink-0 px-3 sm:px-6 py-3 font-semibold text-sm sm:text-base transition-colors whitespace-nowrap ${
                activeTab === "watchlist"
                  ? "border-b-2 border-blue-600 text-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              気になる ({watchlistStocks.length})
            </button>
            <button
              onClick={() => setActiveTab("tracked")}
              className={`flex-shrink-0 px-3 sm:px-6 py-3 font-semibold text-sm sm:text-base transition-colors whitespace-nowrap ${
                activeTab === "tracked"
                  ? "border-b-2 border-blue-600 text-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              追跡 ({trackedStocks.length})
            </button>
            <button
              onClick={() => setActiveTab("sold")}
              className={`flex-shrink-0 px-3 sm:px-6 py-3 font-semibold text-sm sm:text-base transition-colors whitespace-nowrap ${
                activeTab === "sold"
                  ? "border-b-2 border-blue-600 text-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              過去の保有 ({soldStocks.length})
            </button>
          </div>
          {/* スクロール可能インジケーター（スマホのみ） */}
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-blue-50 to-transparent pointer-events-none sm:hidden" />
        </div>

        {/* Stock List Section */}
        <section>
          {activeTab === "tracked" ? (
            // 追跡銘柄タブ
            <>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4 mb-4">
                <div>
                  <p className="text-xs sm:text-sm text-gray-500">
                    AI分析なしで株価を追跡
                  </p>
                </div>
                <button
                  onClick={() => setShowAddDialog(true)}
                  className="w-full sm:w-auto px-4 py-2 sm:py-2.5 bg-blue-600 text-white rounded-lg text-sm sm:text-base font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
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
                  追跡銘柄を追加
                </button>
              </div>
              {trackedStocksLoading ? (
                <div className="text-center py-8">
                  <div className="inline-block animate-spin rounded-full h-10 sm:h-12 w-10 sm:w-12 border-b-2 border-blue-600"></div>
                  <p className="mt-4 text-sm sm:text-base text-gray-600">読み込み中...</p>
                </div>
              ) : trackedStocks.length === 0 ? (
                <div className="bg-white rounded-xl p-6 sm:p-12 text-center shadow-sm">
                  <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">
                    追跡中の銘柄はありません
                  </h3>
                  <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6">
                    AI分析なしで株価だけ追いたい銘柄を追加しましょう
                  </p>
                  <button
                    onClick={() => setShowAddDialog(true)}
                    className="px-5 sm:px-6 py-2.5 sm:py-3 bg-blue-600 text-white rounded-lg text-sm sm:text-base font-semibold hover:bg-blue-700 transition-colors"
                  >
                    銘柄を追加する
                  </button>
                </div>
              ) : (
                <div className="grid gap-3 sm:gap-6">
                  {trackedStocks.map((ts) => (
                    <TrackedStockCard
                      key={ts.id}
                      trackedStock={ts}
                      onMoveToWatchlist={handleTrackedToWatchlist}
                      onPurchase={handleTrackedToPurchase}
                    />
                  ))}
                </div>
              )}
            </>
          ) : activeTab === "sold" ? (
            // 保有してた銘柄タブ
            <>
              {soldStocksLoading ? (
                <div className="text-center py-8">
                  <div className="inline-block animate-spin rounded-full h-10 sm:h-12 w-10 sm:w-12 border-b-2 border-blue-600"></div>
                  <p className="mt-4 text-sm sm:text-base text-gray-600">読み込み中...</p>
                </div>
              ) : soldStocks.length === 0 ? (
                <div className="bg-white rounded-xl p-6 sm:p-12 text-center shadow-sm">
                  <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">
                    保有してた銘柄はありません
                  </h3>
                  <p className="text-sm sm:text-base text-gray-600">
                    全株売却した銘柄がここに表示されます
                  </p>
                </div>
              ) : (
                <div className="grid gap-3 sm:gap-6">
                  {soldStocks.map((ss) => (
                    <SoldStockCard
                      key={ss.id}
                      soldStock={ss}
                      onAddToWatchlist={handleSoldToWatchlist}
                      onRepurchase={handleSoldToRepurchase}
                    />
                  ))}
                </div>
              )}
            </>
          ) : (
            // 保有銘柄・気になる銘柄タブ
            <>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4 mb-4">
                <div>
                  <p className="text-xs sm:text-sm text-gray-500">
                    現在 {displayStocks.length} 銘柄
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    AI分析更新 {UPDATE_SCHEDULES.STOCK_ANALYSIS}（平日）
                  </p>
                </div>
                <button
                  onClick={handleAddStock}
                  disabled={displayStocks.length >= (activeTab === "portfolio" ? MAX_PORTFOLIO_STOCKS : MAX_WATCHLIST_STOCKS)}
                  className="w-full sm:w-auto px-4 py-2 sm:py-2.5 bg-blue-600 text-white rounded-lg text-sm sm:text-base font-semibold hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
                  {activeTab === "portfolio" ? "保有銘柄を追加" : "気になる銘柄を追加"}
                </button>
              </div>

              {displayStocks.length === 0 ? (
                <div className="bg-white rounded-xl p-6 sm:p-12 text-center shadow-sm">
                  <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">
                    {activeTab === "portfolio" ? "保有銘柄がありません" : "気になる銘柄がありません"}
                  </h3>
                  <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6">
                    銘柄を追加して投資を始めましょう
                  </p>
                  <button
                    onClick={handleAddStock}
                    className="px-5 sm:px-6 py-2.5 sm:py-3 bg-blue-600 text-white rounded-lg text-sm sm:text-base font-semibold hover:bg-blue-700 transition-colors"
                  >
                    銘柄を追加する
                  </button>
                </div>
              ) : (
                <div className="grid gap-3 sm:gap-6">
                  {displayStocks.map((stock) => (
                    <StockCard
                      key={stock.id}
                      stock={stock}
                      price={prices[stock.stock.tickerCode]}
                      recommendation={recommendations[stock.stockId]}
                      portfolioRecommendation={stock.type === "portfolio" ? stock.recommendation : undefined}
                      analyzedAt={stock.type === "watchlist" ? recommendations[stock.stockId]?.analyzedAt : stock.analyzedAt}
                      onAdditionalPurchase={stock.type === "portfolio" ? () => handleAdditionalPurchase(stock) : undefined}
                      onSell={stock.type === "portfolio" ? () => handleSell(stock) : undefined}
                      onPurchase={stock.type === "watchlist" ? () => handlePurchaseFromWatchlist(stock) : undefined}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </section>

      {/* Dialogs */}
      <AddStockDialog
        isOpen={showAddDialog}
        onClose={() => {
          setShowAddDialog(false)
          setPurchaseFromWatchlist(null)
          setStockToMove(null)
        }}
        onSuccess={(newStock) => {
          // 追跡タブからの直接追加の場合
          if (activeTab === "tracked" && !purchaseFromWatchlist && !stockToMove) {
            setTrackedStocks((prev) => [...prev, newStock as unknown as TrackedStock])
          } else {
            handleStockAdded(newStock)
          }
          setPurchaseFromWatchlist(null)
          // 追跡銘柄からの移動の場合、追跡銘柄リストを更新
          if (stockToMove) {
            setTrackedStocks((prev) => prev.filter((ts) => ts.stockId !== stockToMove.stockId))
            setStockToMove(null)
            setActiveTab("portfolio")
          }
        }}
        defaultType={(purchaseFromWatchlist || stockToMove) ? "portfolio" : activeTab === "tracked" ? "tracked" : activeTab === "sold" ? "portfolio" : activeTab}
        initialStock={purchaseFromWatchlist ? {
          id: purchaseFromWatchlist.stock.id,
          tickerCode: purchaseFromWatchlist.stock.tickerCode,
          name: purchaseFromWatchlist.stock.name,
          market: purchaseFromWatchlist.stock.market,
          sector: purchaseFromWatchlist.stock.sector,
          latestPrice: prices[purchaseFromWatchlist.stock.tickerCode]?.currentPrice ?? purchaseFromWatchlist.stock.currentPrice,
        } : stockToMove ? {
          id: stockToMove.stockId,
          tickerCode: stockToMove.tickerCode,
          name: stockToMove.name,
          market: stockToMove.market || "プライム",
          sector: stockToMove.sector || null,
          latestPrice: null,
        } : null}
      />

      <AdditionalPurchaseDialog
        isOpen={showTransactionDialog}
        onClose={() => {
          setShowTransactionDialog(false)
          setSelectedStock(null)
        }}
        stock={selectedStock ? {
          ...selectedStock,
          stock: {
            ...selectedStock.stock,
            currentPrice: prices[selectedStock.stock.tickerCode]?.currentPrice ?? selectedStock.stock.currentPrice,
          },
        } : null}
        onSuccess={handleTransactionSuccess}
        transactionType={transactionType}
      />
    </>
  )
}
