"use client"

import { useState } from "react"
import StockPrediction from "@/app/components/StockPrediction"
import PurchaseRecommendation from "@/app/components/PurchaseRecommendation"

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
  onEdit: () => void
  onDelete: () => void
  onConvert: () => void
}

export default function StockCard({
  stock,
  price,
  onEdit,
  onDelete,
  onConvert,
}: StockCardProps) {
  const [showPrediction, setShowPrediction] = useState(false)
  const [showPurchaseRecommendation, setShowPurchaseRecommendation] = useState(false)
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

  return (
    <div className="bg-white rounded-xl shadow-md hover:shadow-lg transition-all p-6 relative">
      {/* Delete Button */}
      <button
        onClick={onDelete}
        className="absolute top-4 right-4 text-gray-400 hover:text-red-600 transition-colors"
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

      {/* Stock Header */}
      <div className="mb-4 pr-8">
        <div className="flex items-center gap-3 mb-2">
          <h3 className="text-xl sm:text-2xl font-bold text-gray-900">
            {stock.stock.name}
          </h3>
          <span
            className={`px-3 py-1 text-xs font-semibold rounded-full ${
              isHolding
                ? "bg-blue-100 text-blue-700"
                : "bg-amber-100 text-amber-700"
            }`}
          >
            {isHolding ? "保有中" : "気になる"}
          </span>
        </div>
        <p className="text-sm text-gray-500">
          {stock.stock.tickerCode}
          {stock.stock.sector && ` • ${stock.stock.sector}`}
        </p>
      </div>

      {/* Price Information */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1">現在価格</p>
          {price ? (
            <p className="text-lg font-bold text-gray-900">
              ¥{price.currentPrice.toLocaleString()}
            </p>
          ) : (
            <p className="text-sm text-gray-400">読み込み中...</p>
          )}
        </div>

        {price && (
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">前日比</p>
            <p
              className={`text-lg font-bold ${
                price.change >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {price.change >= 0 ? "+" : ""}
              {price.changePercent.toFixed(2)}%
            </p>
          </div>
        )}

        {isHolding && (
          <>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">保有数</p>
              <p className="text-lg font-bold text-gray-900">{quantity}株</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">平均取得単価</p>
              <p className="text-lg font-bold text-gray-900">
                ¥{averagePrice.toLocaleString()}
              </p>
            </div>
          </>
        )}
      </div>

      {/* Profit/Loss for Holdings */}
      {isHolding && price && (
        <div
          className={`rounded-lg p-4 mb-4 ${
            profit >= 0
              ? "bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200"
              : "bg-gradient-to-r from-red-50 to-rose-50 border-2 border-red-200"
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-600 mb-1">損益</p>
              <p
                className={`text-2xl font-bold ${
                  profit >= 0 ? "text-green-600" : "text-red-600"
                }`}
              >
                {profit >= 0 ? "+" : ""}¥{profit.toLocaleString()}
              </p>
              <p
                className={`text-sm font-semibold ${
                  profit >= 0 ? "text-green-600" : "text-red-600"
                }`}
              >
                ({profitPercent >= 0 ? "+" : ""}
                {profitPercent.toFixed(2)}%)
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-600 mb-1">評価額</p>
              <p className="text-xl font-bold text-gray-900">
                ¥{currentValue.toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-2">
        {isHolding && (
          <button
            onClick={onEdit}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
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
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
            編集
          </button>
        )}
        <button
          onClick={onConvert}
          className={`flex-1 px-4 py-2 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 ${
            isHolding
              ? "bg-gray-100 text-gray-700 hover:bg-gray-200"
              : "bg-blue-100 text-blue-700 hover:bg-blue-200"
          }`}
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
              d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
            />
          </svg>
          {isHolding ? "気になるに変更" : "保有中に変更"}
        </button>
      </div>

      {/* Prediction Toggle */}
      <button
        onClick={() => setShowPrediction(!showPrediction)}
        className="mt-4 w-full px-4 py-2 bg-purple-50 text-purple-700 rounded-lg font-semibold hover:bg-purple-100 transition-colors flex items-center justify-center gap-2"
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
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
        {showPrediction ? "予測を非表示" : "🔮 今後の予測を見る"}
      </button>

      {/* Stock Prediction */}
      {showPrediction && (
        <StockPrediction stockId={stock.stockId} />
      )}

      {/* Purchase Recommendation Toggle (watchlist only) */}
      {isWatchlist && (
        <button
          onClick={() => setShowPurchaseRecommendation(!showPurchaseRecommendation)}
          className="mt-4 w-full px-4 py-2 bg-green-50 text-green-700 rounded-lg font-semibold hover:bg-green-100 transition-colors flex items-center justify-center gap-2"
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
              d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          {showPurchaseRecommendation ? "購入判断を非表示" : "💰 購入判断を見る"}
        </button>
      )}

      {/* Purchase Recommendation */}
      {showPurchaseRecommendation && (
        <PurchaseRecommendation stockId={stock.stockId} />
      )}

      {/* Additional Info */}
      {price && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>52週安値: ¥{price.low.toLocaleString()}</span>
            <span>52週高値: ¥{price.high.toLocaleString()}</span>
          </div>
          {/* Price position indicator */}
          <div className="mt-2 relative h-2 bg-gradient-to-r from-blue-200 via-gray-300 to-red-200 rounded-full">
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-blue-600 rounded-full border-2 border-white shadow-lg"
              style={{
                left: `${Math.max(
                  0,
                  Math.min(
                    100,
                    ((price.currentPrice - price.low) / (price.high - price.low)) *
                      100
                  )
                )}%`,
                transform: "translate(-50%, -50%)",
              }}
              title={`現在価格: ¥${price.currentPrice.toLocaleString()}`}
            />
          </div>
        </div>
      )}
    </div>
  )
}
