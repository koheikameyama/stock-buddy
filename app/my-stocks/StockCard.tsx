"use client"

import { useRouter } from "next/navigation"
import { formatAnalysisTime } from "@/lib/analysis-time"

interface UserStock {
  id: string
  stockId: string
  type: "watchlist" | "portfolio"
  // Portfolio fields
  quantity?: number
  averagePurchasePrice?: number
  purchaseDate?: string
  // 感情コーチング・ステータス
  emotionalCoaching?: string | null
  simpleStatus?: string | null
  statusType?: string | null
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

interface PurchaseRecommendation {
  recommendation: "buy" | "hold" | "pass"
  confidence: number
  reason: string
  caution: string
}

interface StockCardProps {
  stock: UserStock
  price?: StockPrice
  recommendation?: PurchaseRecommendation
  portfolioRecommendation?: "buy" | "sell" | "hold" | null
  analyzedAt?: string | null
  onAdditionalPurchase?: () => void
  onSell?: () => void
  onPurchase?: () => void
}


export default function StockCard({ stock, price, recommendation, portfolioRecommendation, analyzedAt, onAdditionalPurchase, onSell, onPurchase }: StockCardProps) {
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

  // AI Purchase Judgment using real recommendations (for watchlist)
  const getAIPurchaseJudgment = () => {
    if (!recommendation) return null

    const displayMap = {
      buy: { text: "買い時", color: "text-green-700", bg: "bg-green-50" },
      hold: { text: "様子見", color: "text-blue-700", bg: "bg-blue-50" },
      pass: { text: "見送り", color: "text-gray-700", bg: "bg-gray-50" },
    }

    return displayMap[recommendation.recommendation]
  }

  // AI Sell Judgment using StockAnalysis.recommendation (for portfolio)
  const getAISellJudgment = () => {
    if (!portfolioRecommendation) return null

    const displayMap = {
      buy: { text: "買い増し検討", color: "text-green-700", bg: "bg-green-50" },
      sell: { text: "売却検討", color: "text-red-700", bg: "bg-red-50" },
      hold: { text: "保有継続", color: "text-blue-700", bg: "bg-blue-50" },
    }
    return displayMap[portfolioRecommendation]
  }

  const aiJudgment = isWatchlist ? getAIPurchaseJudgment() : getAISellJudgment()

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
          {aiJudgment && (
            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${aiJudgment.bg} ${aiJudgment.color}`}>
              {aiJudgment.text}
            </span>
          )}
          {analyzedAt && (() => {
            const { label, relative, colorClass } = formatAnalysisTime(analyzedAt)
            return (
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <span className={colorClass}>{label}</span>
                <span>|</span>
                <span>{relative}</span>
              </span>
            )
          })()}
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
                {/* Emotional Coaching Message */}
                {stock.emotionalCoaching && (
                  <p className="mt-2 text-xs sm:text-sm text-gray-600 border-t border-gray-200 pt-2">
                    {stock.emotionalCoaching}
                  </p>
                )}
              </div>
            )}

            {/* Transaction Buttons */}
            {(onAdditionalPurchase || onSell) && (
              <div className="flex gap-2">
                {onAdditionalPurchase && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onAdditionalPurchase()
                    }}
                    className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-1"
                  >
                    <svg
                      className="w-4 h-4"
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
                    追加購入
                  </button>
                )}
                {onSell && quantity > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onSell()
                    }}
                    className="flex-1 px-3 py-2 bg-orange-600 text-white rounded-lg text-sm font-semibold hover:bg-orange-700 transition-colors flex items-center justify-center gap-1"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M20 12H4"
                      />
                    </svg>
                    売却
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {/* Purchase Button for Watchlist */}
        {isWatchlist && onPurchase && (
          <div className="flex gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation()
                onPurchase()
              }}
              className="flex-1 px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors flex items-center justify-center gap-1"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
              購入する
            </button>
          </div>
        )}

        {/* Detail Link */}
        <div className="flex items-center justify-end text-blue-600 pt-2 mt-2 border-t border-gray-100">
          <span className="text-sm font-medium">詳細を見る</span>
          <svg
            className="w-4 h-4 ml-1"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </div>
      </div>
    </div>
  )
}
