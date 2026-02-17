"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { getActionButtonClass, ACTION_BUTTON_LABELS, CARD_FOOTER_STYLES } from "@/lib/ui-config"
import CopyableTicker from "@/app/components/CopyableTicker"

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
  onMoveToWatchlist: (stockId: string, tickerCode: string, name: string) => void
  onPurchase: (stockId: string, tickerCode: string, name: string, market: string, sector: string | null) => void
}

export default function TrackedStockCard({ trackedStock, onMoveToWatchlist, onPurchase }: TrackedStockCardProps) {
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
    router.push(`/stocks/${trackedStock.stockId}`)
  }

  return (
    <div
      onClick={handleClick}
      className="relative bg-white rounded-xl shadow-md hover:shadow-lg transition-all p-4 sm:p-6 cursor-pointer hover:bg-gray-50"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          handleClick()
        }
      }}
    >
      {/* シグナルバッジ - 右上 */}
      {signal && (
        <span
          className={`absolute top-3 right-3 sm:top-4 sm:right-4 px-2 py-0.5 rounded-full text-xs font-semibold ${
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
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="pr-24">
          <h3 className="text-lg sm:text-xl font-bold text-gray-900">
            {stock.name}
          </h3>
          <p className="text-xs sm:text-sm text-gray-500">
            <CopyableTicker tickerCode={stock.tickerCode} />
            {stock.sector && ` • ${stock.sector}`}
          </p>
        </div>
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

      {/* Footer: Actions + Detail Link */}
      <div className={CARD_FOOTER_STYLES.containerLarge} onClick={(e) => e.stopPropagation()}>
        {/* Action Buttons */}
        <div className={CARD_FOOTER_STYLES.actionGroup}>
          <button
            onClick={() => onMoveToWatchlist(stock.id, stock.tickerCode, stock.name)}
            className={getActionButtonClass("watchlist")}
          >
            {ACTION_BUTTON_LABELS.watchlist}
          </button>
          <button
            onClick={() => onPurchase(stock.id, stock.tickerCode, stock.name, stock.market, stock.sector)}
            className={getActionButtonClass("purchase")}
          >
            {ACTION_BUTTON_LABELS.purchase}
          </button>
        </div>

        {/* Detail Link */}
        <div className={CARD_FOOTER_STYLES.detailLink}>
          <span className={CARD_FOOTER_STYLES.detailLinkText}>詳細を見る</span>
          <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </div>
  )
}
