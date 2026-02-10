"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import StockCard from "./StockCard"
import AddStockDialog from "./AddStockDialog"
import AdditionalPurchaseDialog from "./AdditionalPurchaseDialog"

interface UserStock {
  id: string
  userId: string
  stockId: string
  type: "watchlist" | "portfolio"
  // Watchlist fields
  addedReason?: string | null
  alertPrice?: number | null
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
  // Common fields
  note?: string | null
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

interface UserSettings {
  targetReturnRate: number | null
  stopLossRate: number | null
}

const MAX_USER_STOCKS = 5

export default function MyStocksClient() {
  const router = useRouter()
  const [userStocks, setUserStocks] = useState<UserStock[]>([])
  const [prices, setPrices] = useState<Record<string, StockPrice>>({})
  const [recommendations, setRecommendations] = useState<Record<string, PurchaseRecommendation>>({})
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showTransactionDialog, setShowTransactionDialog] = useState(false)
  const [selectedStock, setSelectedStock] = useState<UserStock | null>(null)
  const [transactionType, setTransactionType] = useState<"buy" | "sell">("buy")
  const [activeTab, setActiveTab] = useState<"portfolio" | "watchlist">("portfolio")
  // ウォッチリストからの購入用
  const [purchaseFromWatchlist, setPurchaseFromWatchlist] = useState<UserStock | null>(null)

  // Fetch user stocks and settings
  useEffect(() => {
    async function fetchData() {
      try {
        const [stocksResponse, settingsResponse] = await Promise.all([
          fetch("/api/user-stocks?mode=all"),
          fetch("/api/settings"),
        ])

        if (!stocksResponse.ok) {
          throw new Error("Failed to fetch stocks")
        }
        const stocksData = await stocksResponse.json()
        setUserStocks(stocksData)

        if (settingsResponse.ok) {
          const settingsData = await settingsResponse.json()
          if (settingsData.settings) {
            setUserSettings({
              targetReturnRate: settingsData.settings.targetReturnRate ?? null,
              stopLossRate: settingsData.settings.stopLossRate ?? null,
            })
          }
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
        </div>

        {/* Stock List Section */}
        <section>
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
        defaultType={purchaseFromWatchlist ? "portfolio" : activeTab}
        defaultTargetReturnRate={userSettings?.targetReturnRate}
        defaultStopLossRate={userSettings?.stopLossRate}
        initialStock={purchaseFromWatchlist ? {
          id: purchaseFromWatchlist.stock.id,
          tickerCode: purchaseFromWatchlist.stock.tickerCode,
          name: purchaseFromWatchlist.stock.name,
          market: purchaseFromWatchlist.stock.market,
          sector: purchaseFromWatchlist.stock.sector,
          latestPrice: prices[purchaseFromWatchlist.stock.tickerCode]?.currentPrice ?? purchaseFromWatchlist.stock.currentPrice,
        } : null}
        initialNote={purchaseFromWatchlist?.note || undefined}
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
