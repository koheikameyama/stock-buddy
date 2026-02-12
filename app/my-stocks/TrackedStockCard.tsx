"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

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

interface Signal {
  signal: "buy" | "sell" | "neutral"
  strength: number
}

interface TrackedStockCardProps {
  trackedStock: TrackedStock
  onRemove: (id: string) => void
  onMoveToWatchlist: (stockId: string, tickerCode: string, name: string) => void
  onPurchase: (stockId: string, tickerCode: string, name: string, market: string, sector: string | null) => void
}

export default function TrackedStockCard({ trackedStock, onRemove, onMoveToWatchlist, onPurchase }: TrackedStockCardProps) {
  const router = useRouter()
  const { stock, currentPrice, changePercent } = trackedStock
  const [signal, setSignal] = useState<Signal | null>(null)

  // Fetch signal asynchronously
  useEffect(() => {
    async function fetchSignal() {
      try {
        const response = await fetch(`/api/stocks/${trackedStock.stockId}/historical-prices?period=1m`)
        if (!response.ok) return
        const data = await response.json()
        if (data.patterns?.combined) {
          setSignal({
            signal: data.patterns.combined.signal,
            strength: data.patterns.combined.strength,
          })
        }
      } catch (err) {
        console.error("Error fetching signal:", err)
      }
    }

    fetchSignal()
  }, [trackedStock.stockId])

  const handleClick = () => {
    router.push(`/my-stocks/tracked/${trackedStock.id}`)
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
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-lg sm:text-xl font-bold text-gray-900">
            {stock.name}
          </h3>
          <p className="text-xs sm:text-sm text-gray-500">
            {stock.tickerCode}
            {stock.sector && ` • ${stock.sector}`}
          </p>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onRemove(trackedStock.id)
          }}
          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
          title="追跡をやめる"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Price Info */}
      <div className="mb-4">
        {currentPrice ? (
          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-bold text-gray-900">
              ¥{currentPrice.toLocaleString()}
            </span>
            {changePercent !== null && (
              <span className={`text-sm font-semibold ${changePercent >= 0 ? "text-green-600" : "text-red-600"}`}>
                {changePercent >= 0 ? "+" : ""}{changePercent.toFixed(2)}%
              </span>
            )}
          </div>
        ) : (
          <span className="text-sm text-gray-400">価格取得中...</span>
        )}
      </div>

      {/* Signal Badge */}
      {signal && (
        <div className="mb-4">
          <span
            className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
              signal.signal === "buy"
                ? "bg-green-100 text-green-700"
                : signal.signal === "sell"
                  ? "bg-red-100 text-red-700"
                  : "bg-gray-100 text-gray-700"
            }`}
          >
            {signal.signal === "buy" && "買いシグナル"}
            {signal.signal === "sell" && "売りシグナル"}
            {signal.signal === "neutral" && "様子見"}
          </span>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => onMoveToWatchlist(stock.id, stock.tickerCode, stock.name)}
          className="flex-1 px-3 py-2 bg-blue-50 text-blue-700 rounded-lg text-sm font-semibold hover:bg-blue-100 transition-colors"
        >
          ウォッチリストへ
        </button>
        <button
          onClick={() => onPurchase(stock.id, stock.tickerCode, stock.name, stock.market, stock.sector)}
          className="flex-1 px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors"
        >
          購入
        </button>
      </div>

      {/* Detail Link */}
      <div className="flex items-center justify-end text-blue-600 pt-3 mt-3 border-t border-gray-100">
        <span className="text-sm font-medium">詳細を見る</span>
        <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </div>
  )
}
