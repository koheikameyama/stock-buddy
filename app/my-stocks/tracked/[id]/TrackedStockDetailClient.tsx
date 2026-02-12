"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import FinancialMetrics from "@/app/components/FinancialMetrics"
import StockChart from "@/app/components/StockChart"
import PriceHistory from "@/app/components/PriceHistory"
import RelatedNews from "@/app/components/RelatedNews"
import AddStockDialog from "../../AddStockDialog"

interface TrackedStockData {
  id: string
  stockId: string
  stock: {
    id: string
    tickerCode: string
    name: string
    sector: string | null
    market: string
    currentPrice: number | null
    fiftyTwoWeekHigh: number | null
    fiftyTwoWeekLow: number | null
    pbr: number | null
    per: number | null
    roe: number | null
    operatingCF: number | null
    freeCF: number | null
  }
  createdAt: string
}

interface StockPrice {
  currentPrice: number
  previousClose: number
  change: number
  changePercent: number
}

export default function TrackedStockDetailClient({ stock }: { stock: TrackedStockData }) {
  const router = useRouter()
  const [price, setPrice] = useState<StockPrice | null>(null)
  const [loading, setLoading] = useState(true)
  const [showPurchaseDialog, setShowPurchaseDialog] = useState(false)
  const [movingToWatchlist, setMovingToWatchlist] = useState(false)

  // Fetch current price
  useEffect(() => {
    async function fetchPrice() {
      try {
        const response = await fetch("/api/stocks/prices")
        if (!response.ok) throw new Error("Failed to fetch price")

        const data = await response.json()
        const priceData = data.prices.find(
          (p: any) => p.tickerCode === stock.stock.tickerCode
        )
        if (priceData) {
          setPrice(priceData)
        }
      } catch (err) {
        console.error("Error fetching price:", err)
      } finally {
        setLoading(false)
      }
    }

    fetchPrice()
  }, [stock.stock.tickerCode])

  const handleDelete = async () => {
    if (!confirm(`${stock.stock.name}の追跡をやめますか？`)) {
      return
    }

    try {
      const response = await fetch(`/api/tracked-stocks/${stock.id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "削除に失敗しました")
      }

      router.push("/my-stocks")
    } catch (err: any) {
      console.error(err)
      alert(err.message || "削除に失敗しました")
    }
  }

  const handleMoveToWatchlist = async () => {
    setMovingToWatchlist(true)
    try {
      const response = await fetch("/api/user-stocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tickerCode: stock.stock.tickerCode,
          type: "watchlist",
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to add to watchlist")
      }

      // Remove from tracked stocks
      await fetch(`/api/tracked-stocks/${stock.id}`, {
        method: "DELETE",
      })

      router.push("/my-stocks")
    } catch (err: any) {
      console.error(err)
      alert(err.message || "追加に失敗しました")
    } finally {
      setMovingToWatchlist(false)
    }
  }

  const currentPrice = price?.currentPrice || stock.stock.currentPrice || 0

  return (
    <main className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-blue-50 pb-8">
      <div className="max-w-4xl mx-auto px-3 sm:px-6 py-4 sm:py-8">
        {/* Back Button */}
        <button
          onClick={() => router.push("/my-stocks")}
          className="mb-4 sm:mb-6 flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
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
          <span className="text-sm sm:text-base font-semibold">戻る</span>
        </button>

        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs font-semibold">
              追跡中
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
            {stock.stock.name}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {stock.stock.tickerCode}
            {stock.stock.sector && ` • ${stock.stock.sector}`}
          </p>
        </div>

        {/* Current Price Section */}
        <section className="bg-white rounded-xl shadow-md p-4 sm:p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg sm:text-xl font-bold text-gray-900">
              現在の価格
            </h2>
            <div className="flex gap-2">
              <button
                onClick={handleMoveToWatchlist}
                disabled={movingToWatchlist}
                className="px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded transition-colors disabled:opacity-50"
              >
                {movingToWatchlist ? "移動中..." : "ウォッチリストへ"}
              </button>
              <button
                onClick={() => setShowPurchaseDialog(true)}
                className="px-2 py-1 text-xs font-medium text-green-600 hover:bg-green-50 rounded transition-colors"
              >
                +購入
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {loading ? (
              <p className="text-sm text-gray-400">読み込み中...</p>
            ) : price ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">現在価格</span>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-gray-900">
                      ¥{price.currentPrice.toLocaleString()}
                    </p>
                    <p
                      className={`text-sm font-semibold ${
                        price.change >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {price.change >= 0 ? "+" : ""}
                      {price.changePercent.toFixed(2)}%
                    </p>
                  </div>
                </div>

                {(stock.stock.fiftyTwoWeekHigh || stock.stock.fiftyTwoWeekLow) && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">52週高値 / 安値</span>
                    <span className="font-semibold text-gray-900">
                      ¥{(stock.stock.fiftyTwoWeekHigh || 0).toLocaleString()} / ¥
                      {(stock.stock.fiftyTwoWeekLow || 0).toLocaleString()}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-400">価格情報なし</p>
            )}
          </div>
        </section>

        {/* Info Box - No AI Analysis */}
        <section className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <span className="text-xl">👁️</span>
            <div>
              <p className="text-sm text-blue-800 font-semibold mb-1">
                追跡モード
              </p>
              <p className="text-xs text-blue-700">
                この銘柄はAI分析なしで株価を追跡しています。AI分析を利用するにはウォッチリストへ移動してください。
              </p>
            </div>
          </div>
        </section>

        {/* Related News Section */}
        <RelatedNews stockId={stock.stockId} />

        {/* Chart Section */}
        <StockChart stockId={stock.stockId} />

        {/* Price History Section */}
        <PriceHistory stockId={stock.stockId} />

        {/* Financial Metrics Section */}
        <FinancialMetrics stock={stock.stock} />

        {/* Delete Button */}
        <button
          onClick={handleDelete}
          className="w-full px-4 py-2 bg-red-50 text-red-700 rounded-lg text-sm font-semibold hover:bg-red-100 transition-colors flex items-center justify-center gap-2"
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
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
          追跡をやめる
        </button>

        {/* Purchase Dialog */}
        <AddStockDialog
          isOpen={showPurchaseDialog}
          onClose={() => setShowPurchaseDialog(false)}
          onSuccess={async () => {
            // Remove from tracked after purchase
            await fetch(`/api/tracked-stocks/${stock.id}`, {
              method: "DELETE",
            })
            setShowPurchaseDialog(false)
            router.push("/my-stocks")
          }}
          defaultType="portfolio"
          initialStock={{
            id: stock.stock.id,
            tickerCode: stock.stock.tickerCode,
            name: stock.stock.name,
            market: stock.stock.market,
            sector: stock.stock.sector,
            latestPrice: currentPrice || null,
          }}
        />
      </div>
    </main>
  )
}
