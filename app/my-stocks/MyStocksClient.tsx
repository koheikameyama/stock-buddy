"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import StockCard from "./StockCard"
import AddStockDialog from "./AddStockDialog"
import EditStockDialog from "./EditStockDialog"

interface UserStock {
  id: string
  userId: string
  stockId: string
  quantity: number | null
  averagePrice: number | null
  purchaseDate: string | null
  lastAnalysis: string | null
  shortTerm: string | null
  mediumTerm: string | null
  longTerm: string | null
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

const MAX_HOLDINGS = 5
const MAX_WATCHLIST = 5

export default function MyStocksClient({ userId }: { userId: string }) {
  const router = useRouter()
  const [userStocks, setUserStocks] = useState<UserStock[]>([])
  const [prices, setPrices] = useState<Record<string, StockPrice>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [selectedStock, setSelectedStock] = useState<UserStock | null>(null)
  const [addMode, setAddMode] = useState<"holding" | "watchlist">("holding")

  // Fetch user stocks
  useEffect(() => {
    async function fetchUserStocks() {
      try {
        const response = await fetch("/api/user-stocks?mode=all")
        if (!response.ok) {
          throw new Error("Failed to fetch stocks")
        }
        const data = await response.json()
        setUserStocks(data)
      } catch (err) {
        console.error("Error fetching user stocks:", err)
        setError("銘柄の取得に失敗しました")
      } finally {
        setLoading(false)
      }
    }

    fetchUserStocks()
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

  // Separate holdings and watchlist
  const holdings = userStocks.filter((s) => s.quantity !== null)
  const watchlist = userStocks.filter((s) => s.quantity === null)

  const handleAddStock = (mode: "holding" | "watchlist") => {
    setAddMode(mode)
    setShowAddDialog(true)
  }

  const handleEditStock = (stock: UserStock) => {
    setSelectedStock(stock)
    setShowEditDialog(true)
  }

  const handleDeleteStock = async (id: string, name: string) => {
    if (!confirm(`${name}を削除しますか？`)) {
      return
    }

    try {
      const response = await fetch(`/api/user-stocks/${id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "削除に失敗しました")
      }

      // Remove from local state
      setUserStocks((prev) => prev.filter((s) => s.id !== id))
    } catch (err: any) {
      console.error(err)
      setError(err.message || "削除に失敗しました")
    }
  }

  const handleConvertMode = async (stock: UserStock) => {
    const isHolding = stock.quantity !== null
    const newMode = isHolding ? "ウォッチリスト" : "保有銘柄"
    const oldMode = isHolding ? "保有銘柄" : "ウォッチリスト"

    if (!confirm(`${stock.stock.name}を${oldMode}から${newMode}に変更しますか？`)) {
      return
    }

    try {
      // Check limits
      if (isHolding && watchlist.length >= MAX_WATCHLIST) {
        setError(`ウォッチリストは最大${MAX_WATCHLIST}銘柄までです`)
        return
      }
      if (!isHolding && holdings.length >= MAX_HOLDINGS) {
        setError(`保有銘柄は最大${MAX_HOLDINGS}銘柄までです`)
        return
      }

      const response = await fetch(`/api/user-stocks/${stock.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          quantity: isHolding ? null : 100,
          averagePrice: isHolding ? null : stock.stock.currentPrice || 1000,
          purchaseDate: isHolding ? null : new Date().toISOString(),
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "変更に失敗しました")
      }

      const updatedStock = await response.json()
      setUserStocks((prev) =>
        prev.map((s) => (s.id === stock.id ? updatedStock : s))
      )
      setError(null)
    } catch (err: any) {
      console.error(err)
      setError(err.message || "変更に失敗しました")
    }
  }

  const handleStockAdded = (newStock: UserStock) => {
    setUserStocks((prev) => [...prev, newStock])
    setShowAddDialog(false)
  }

  const handleStockUpdated = (updatedStock: UserStock) => {
    setUserStocks((prev) =>
      prev.map((s) => (s.id === updatedStock.id ? updatedStock : s))
    )
    setShowEditDialog(false)
    setSelectedStock(null)
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-blue-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            <p className="mt-4 text-gray-600">読み込み中...</p>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-blue-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Page Header */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
            マイ銘柄
          </h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            保有銘柄とウォッチリストをまとめて管理
          </p>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {/* Holdings Section */}
        <section className="mb-8 sm:mb-12">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
                保有銘柄
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                現在 {holdings.length}/{MAX_HOLDINGS} 銘柄
              </p>
            </div>
            <button
              onClick={() => handleAddStock("holding")}
              disabled={holdings.length >= MAX_HOLDINGS}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
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
                  d="M12 4v16m8-8H4"
                />
              </svg>
              銘柄を追加
            </button>
          </div>

          {holdings.length === 0 ? (
            <div className="bg-white rounded-xl p-8 sm:p-12 text-center shadow-sm">
              <div className="text-5xl mb-4">📊</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                保有銘柄がありません
              </h3>
              <p className="text-gray-600 mb-6">
                最初の銘柄を追加して投資を始めましょう
              </p>
              <button
                onClick={() => handleAddStock("holding")}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
              >
                銘柄を追加する
              </button>
            </div>
          ) : (
            <div className="grid gap-4 sm:gap-6">
              {holdings.map((stock) => (
                <StockCard
                  key={stock.id}
                  stock={stock}
                  price={prices[stock.stock.tickerCode]}
                  mode="holding"
                  onEdit={() => handleEditStock(stock)}
                  onDelete={() => handleDeleteStock(stock.id, stock.stock.name)}
                  onConvert={() => handleConvertMode(stock)}
                />
              ))}
            </div>
          )}
        </section>

        {/* Watchlist Section */}
        <section>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
                ウォッチリスト
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                現在 {watchlist.length}/{MAX_WATCHLIST} 銘柄
              </p>
            </div>
            <button
              onClick={() => handleAddStock("watchlist")}
              disabled={watchlist.length >= MAX_WATCHLIST}
              className="px-4 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
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
                  d="M12 4v16m8-8H4"
                />
              </svg>
              銘柄を追加
            </button>
          </div>

          {watchlist.length === 0 ? (
            <div className="bg-white rounded-xl p-8 sm:p-12 text-center shadow-sm">
              <div className="text-5xl mb-4">👀</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                ウォッチリストが空です
              </h3>
              <p className="text-gray-600 mb-6">
                気になる銘柄を追加してチェックしましょう
              </p>
              <button
                onClick={() => handleAddStock("watchlist")}
                className="px-6 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors"
              >
                銘柄を追加する
              </button>
            </div>
          ) : (
            <div className="grid gap-4 sm:gap-6">
              {watchlist.map((stock) => (
                <StockCard
                  key={stock.id}
                  stock={stock}
                  price={prices[stock.stock.tickerCode]}
                  mode="watchlist"
                  onEdit={() => handleEditStock(stock)}
                  onDelete={() => handleDeleteStock(stock.id, stock.stock.name)}
                  onConvert={() => handleConvertMode(stock)}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Dialogs */}
      <AddStockDialog
        isOpen={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        onSuccess={handleStockAdded}
        mode={addMode}
      />

      {selectedStock && (
        <EditStockDialog
          isOpen={showEditDialog}
          onClose={() => {
            setShowEditDialog(false)
            setSelectedStock(null)
          }}
          onSuccess={handleStockUpdated}
          stock={selectedStock}
        />
      )}
    </main>
  )
}
