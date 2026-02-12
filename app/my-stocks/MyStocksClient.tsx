"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import StockCard from "./StockCard"
import PassedStockCard from "./PassedStockCard"
import SoldStockCard from "./SoldStockCard"
import AddStockDialog from "./AddStockDialog"
import AdditionalPurchaseDialog from "./AdditionalPurchaseDialog"

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
  recommendation: "buy" | "hold" | "pass"
  confidence: number
  reason: string
  caution: string
}

interface PassedStock {
  id: string
  stockId: string
  stock: {
    id: string
    tickerCode: string
    name: string
    sector: string | null
  }
  passedAt: string
  passedPrice: number
  passedReason: string | null
  source: string
  currentPrice: number | null
  priceChangePercent: number | null
  whatIfProfit: number | null
  whatIfQuantity: number | null
  wasGoodDecision: boolean | null
  feedbackNote: string | null
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

type TabType = "portfolio" | "watchlist" | "passed" | "sold"

const MAX_USER_STOCKS = 5

export default function MyStocksClient() {
  const router = useRouter()
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
  // 見送り銘柄用
  const [passedStocks, setPassedStocks] = useState<PassedStock[]>([])
  const [passedStocksLoading, setPassedStocksLoading] = useState(false)
  // 売却済み銘柄用
  const [soldStocks, setSoldStocks] = useState<SoldStock[]>([])
  const [soldStocksLoading, setSoldStocksLoading] = useState(false)

  // Fetch user stocks
  useEffect(() => {
    async function fetchData() {
      try {
        const stocksResponse = await fetch("/api/user-stocks?mode=all")

        if (!stocksResponse.ok) {
          throw new Error("Failed to fetch stocks")
        }
        const stocksData = await stocksResponse.json()
        setUserStocks(stocksData)
      } catch (err) {
        console.error("Error fetching data:", err)
        setError("銘柄の取得に失敗しました")
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  // Fetch stock prices
  useEffect(() => {
    async function fetchPrices() {
      try {
        const response = await fetch("/api/stocks/prices")
        if (!response.ok) {
          throw new Error("Failed to fetch prices")
        }
        const data = await response.json()
        const priceMap: Record<string, StockPrice> = {}
        data.prices.forEach((price: StockPrice) => {
          priceMap[price.tickerCode] = price
        })
        setPrices(priceMap)
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

  // Fetch passed stocks when tab is switched
  useEffect(() => {
    async function fetchPassedStocks() {
      if (activeTab !== "passed" || passedStocks.length > 0) return

      setPassedStocksLoading(true)
      try {
        const response = await fetch("/api/passed-stocks")
        if (!response.ok) throw new Error("Failed to fetch passed stocks")
        const data = await response.json()
        setPassedStocks(data)
      } catch (err) {
        console.error("Error fetching passed stocks:", err)
      } finally {
        setPassedStocksLoading(false)
      }
    }

    fetchPassedStocks()
  }, [activeTab, passedStocks.length])

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

  const handleRemovePassedStock = async (id: string) => {
    try {
      const response = await fetch(`/api/passed-stocks/${id}`, {
        method: "DELETE",
      })
      if (!response.ok) throw new Error("Failed to remove tracking")
      setPassedStocks((prev) => prev.filter((ps) => ps.id !== id))
    } catch (err) {
      console.error("Error removing passed stock:", err)
    }
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
  const portfolioStocks = userStocks.filter((s) => s.type === "portfolio")
  const watchlistStocks = userStocks.filter((s) => s.type === "watchlist")
  const displayStocks = activeTab === "portfolio" ? portfolioStocks : watchlistStocks

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-blue-50 pb-8">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-8">
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-10 sm:h-12 w-10 sm:w-12 border-b-2 border-blue-600"></div>
            <p className="mt-4 text-sm sm:text-base text-gray-600">読み込み中...</p>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-blue-50 pb-8">
      <div className="max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-8">
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
        <div className="mb-4 sm:mb-8">
          <h1 className="text-xl sm:text-3xl font-bold text-gray-900">
            マイ銘柄
          </h1>
          <p className="text-xs sm:text-base text-gray-600 mt-1">
            気になる銘柄と保有銘柄を一覧管理
          </p>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-4 sm:mb-6 bg-red-50 border border-red-200 rounded-lg p-3 sm:p-4">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-200 mb-6">
          <button
            onClick={() => setActiveTab("portfolio")}
            className={`px-4 sm:px-6 py-3 font-semibold text-sm sm:text-base transition-colors ${
              activeTab === "portfolio"
                ? "border-b-2 border-blue-600 text-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            保有銘柄 ({portfolioStocks.length})
          </button>
          <button
            onClick={() => setActiveTab("watchlist")}
            className={`px-4 sm:px-6 py-3 font-semibold text-sm sm:text-base transition-colors ${
              activeTab === "watchlist"
                ? "border-b-2 border-blue-600 text-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            気になる銘柄 ({watchlistStocks.length})
          </button>
          <button
            onClick={() => setActiveTab("passed")}
            className={`px-4 sm:px-6 py-3 font-semibold text-sm sm:text-base transition-colors ${
              activeTab === "passed"
                ? "border-b-2 border-blue-600 text-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            見送った銘柄 ({passedStocks.length})
          </button>
          <button
            onClick={() => setActiveTab("sold")}
            className={`px-4 sm:px-6 py-3 font-semibold text-sm sm:text-base transition-colors ${
              activeTab === "sold"
                ? "border-b-2 border-blue-600 text-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            保有してた銘柄 ({soldStocks.length})
          </button>
        </div>

        {/* Stock List Section */}
        <section>
          {activeTab === "passed" ? (
            // 見送った銘柄タブ
            <>
              {passedStocksLoading ? (
                <div className="text-center py-8">
                  <div className="inline-block animate-spin rounded-full h-10 sm:h-12 w-10 sm:w-12 border-b-2 border-blue-600"></div>
                  <p className="mt-4 text-sm sm:text-base text-gray-600">読み込み中...</p>
                </div>
              ) : passedStocks.length === 0 ? (
                <div className="bg-white rounded-xl p-6 sm:p-12 text-center shadow-sm">
                  <div className="text-4xl sm:text-5xl mb-3 sm:mb-4">📊</div>
                  <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">
                    見送った銘柄はありません
                  </h3>
                  <p className="text-sm sm:text-base text-gray-600">
                    気になる銘柄を見送ると、ここに表示されます
                  </p>
                </div>
              ) : (
                <div className="grid gap-3 sm:gap-6">
                  {passedStocks.map((ps) => (
                    <PassedStockCard
                      key={ps.id}
                      passedStock={ps}
                      onRemove={handleRemovePassedStock}
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
                  <div className="text-4xl sm:text-5xl mb-3 sm:mb-4">📈</div>
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
                    現在 {displayStocks.length}/{MAX_USER_STOCKS} 銘柄
                  </p>
                </div>
                <button
                  onClick={handleAddStock}
                  disabled={displayStocks.length >= MAX_USER_STOCKS}
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
                  <div className="text-4xl sm:text-5xl mb-3 sm:mb-4">📊</div>
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
      </div>

      {/* Dialogs */}
      <AddStockDialog
        isOpen={showAddDialog}
        onClose={() => {
          setShowAddDialog(false)
          setPurchaseFromWatchlist(null)
        }}
        onSuccess={(newStock) => {
          handleStockAdded(newStock)
          setPurchaseFromWatchlist(null)
        }}
        defaultType={purchaseFromWatchlist ? "portfolio" : (activeTab === "passed" || activeTab === "sold") ? "portfolio" : activeTab}
        initialStock={purchaseFromWatchlist ? {
          id: purchaseFromWatchlist.stock.id,
          tickerCode: purchaseFromWatchlist.stock.tickerCode,
          name: purchaseFromWatchlist.stock.name,
          market: purchaseFromWatchlist.stock.market,
          sector: purchaseFromWatchlist.stock.sector,
          latestPrice: prices[purchaseFromWatchlist.stock.tickerCode]?.currentPrice ?? purchaseFromWatchlist.stock.currentPrice,
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
    </main>
  )
}
