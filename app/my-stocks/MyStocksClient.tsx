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

const MAX_USER_STOCKS = 5

export default function MyStocksClient({ userId }: { userId: string }) {
  const router = useRouter()
  const [userStocks, setUserStocks] = useState<UserStock[]>([])
  const [prices, setPrices] = useState<Record<string, StockPrice>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [selectedStock, setSelectedStock] = useState<UserStock | null>(null)

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

  const handleAddStock = () => {
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
    const newMode = isHolding ? "気になる" : "保有中"
    const oldMode = isHolding ? "保有中" : "気になる"

    if (!confirm(`${stock.stock.name}のステータスを「${oldMode}」から「${newMode}」に変更しますか？`)) {
      return
    }

    try {
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

        {/* Unified Stock List Section */}
        <section>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4 mb-4">
            <div>
              <p className="text-xs sm:text-sm text-gray-500">
                現在 {userStocks.length}/{MAX_USER_STOCKS} 銘柄
              </p>
            </div>
            <button
              onClick={handleAddStock}
              disabled={userStocks.length >= MAX_USER_STOCKS}
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
              銘柄を追加
            </button>
          </div>

          {userStocks.length === 0 ? (
            <div className="bg-white rounded-xl p-6 sm:p-12 text-center shadow-sm">
              <div className="text-4xl sm:text-5xl mb-3 sm:mb-4">📊</div>
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">
                まだ銘柄がありません
              </h3>
              <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6">
                最初の銘柄を追加して投資を始めましょう
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
              {userStocks.map((stock) => (
                <StockCard
                  key={stock.id}
                  stock={stock}
                  price={prices[stock.stock.tickerCode]}
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
