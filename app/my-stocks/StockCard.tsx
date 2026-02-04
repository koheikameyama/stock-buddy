"use client"

import { useRouter } from "next/navigation"

interface UserStock {
  id: string
  stockId: string
  type: "watchlist" | "portfolio"
  // Watchlist fields
  addedReason?: string | null
  alertPrice?: number | null
  // Portfolio fields
  quantity?: number
  averagePurchasePrice?: number
  purchaseDate?: string
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
}

interface StockPrice {
  currentPrice: number
  previousClose: number
  change: number
  changePercent: number
  volume: number
  high: number
  low: number
}

interface StockCardProps {
  stock: UserStock
  price?: StockPrice
}

export default function StockCard({ stock, price }: StockCardProps) {
  const router = useRouter()
  const isHolding = stock.type === "portfolio"
  const isWatchlist = stock.type === "watchlist"
  const quantity = stock.quantity || 0
  const averagePrice = stock.averagePurchasePrice || 0
  const currentPrice = price?.currentPrice || stock.stock.currentPrice || 0

  // Calculate profit/loss for holdings
  const totalCost = averagePrice * quantity
  const currentValue = currentPrice * quantity
  const profit = currentValue - totalCost
  const profitPercent = totalCost > 0 ? (profit / totalCost) * 100 : 0

  // AI Purchase Judgment (simple version for watchlist)
  const getAIPurchaseJudgment = () => {
    if (!price) return null
    // Simple logic based on price change (can be enhanced with real AI later)
    if (price.changePercent > 3) return { text: "様子見", color: "text-gray-600", bg: "bg-gray-50" }
    if (price.changePercent < -2) return { text: "買い時です！", color: "text-green-700", bg: "bg-green-50" }
    return { text: "検討中", color: "text-blue-700", bg: "bg-blue-50" }
  }

  const aiJudgment = isWatchlist ? getAIPurchaseJudgment() : null

  const handleClick = () => {
    router.push(`/my-stocks/${stock.id}`)
  }

  return (
    <div
      onClick={handleClick}
      className="bg-white rounded-xl shadow-md hover:shadow-lg transition-all p-4 sm:p-6 cursor-pointer hover:bg-gray-50"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          handleClick()
        }
      }}
    >
      {/* Stock Header */}
      <div className="mb-3 sm:mb-4">
        <div className="flex items-center gap-2 sm:gap-3 mb-2">
          <h3 className="text-lg sm:text-xl font-bold text-gray-900">
            {stock.stock.name}
          </h3>
          <span
            className={`px-2 sm:px-3 py-0.5 sm:py-1 text-xs font-semibold rounded-full ${
              isHolding
                ? "bg-blue-100 text-blue-700"
                : "bg-amber-100 text-amber-700"
            }`}
          >
            {isHolding ? "保有中" : "気になる"}
          </span>
        </div>
        <p className="text-xs sm:text-sm text-gray-500">
          {stock.stock.tickerCode}
          {stock.stock.sector && ` • ${stock.stock.sector}`}
        </p>
      </div>

      {/* Price and Holdings Info */}
      <div className="space-y-3">
        {/* Current Price */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">現在価格</span>
          {price ? (
            <div className="text-right">
              <p className="text-lg sm:text-xl font-bold text-gray-900">
                ¥{price.currentPrice.toLocaleString()}
              </p>
              <p
                className={`text-xs sm:text-sm font-semibold ${
                  price.change >= 0 ? "text-green-600" : "text-red-600"
                }`}
              >
                {price.change >= 0 ? "+" : ""}
                {price.changePercent.toFixed(2)}%
              </p>
            </div>
          ) : (
            <p className="text-sm text-gray-400">読み込み中...</p>
          )}
        </div>

        {/* Portfolio Specific Info */}
        {isHolding && (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">保有数</span>
              <span className="font-semibold text-gray-900">{quantity}株</span>
            </div>

            {price && (
              <div
                className={`rounded-lg p-3 sm:p-4 ${
                  profit >= 0
                    ? "bg-gradient-to-r from-green-50 to-emerald-50"
                    : "bg-gradient-to-r from-red-50 to-rose-50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs sm:text-sm text-gray-600">評価損益</span>
                  <div className="text-right">
                    <p
                      className={`text-lg sm:text-xl font-bold ${
                        profit >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {profit >= 0 ? "+" : ""}¥{profit.toLocaleString()}
                    </p>
                    <p
                      className={`text-xs sm:text-sm font-semibold ${
                        profit >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      ({profitPercent >= 0 ? "+" : ""}
                      {profitPercent.toFixed(2)}%)
                    </p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Watchlist Specific Info */}
        {isWatchlist && aiJudgment && (
          <div className={`rounded-lg p-3 sm:p-4 ${aiJudgment.bg}`}>
            <div className="flex items-center gap-2">
              <span className="text-xl">💰</span>
              <span className={`text-sm sm:text-base font-semibold ${aiJudgment.color}`}>
                {aiJudgment.text}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
