"use client"

import { useEffect, useState } from "react"

// Inline SVG icon
const XMarkIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
)

interface PassedStock {
  id: string
  stockId: string
  stock: {
    id: string
    tickerCode: string
    name: string
    sector: string | null
    currentPrice: number | null
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

export default function PassedStocksTracker() {
  const [passedStocks, setPassedStocks] = useState<PassedStock[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function fetchPassedStocks() {
    try {
      const response = await fetch("/api/passed-stocks")
      if (!response.ok) {
        throw new Error("見送り銘柄の取得に失敗しました")
      }
      const data = await response.json()
      setPassedStocks(data)
    } catch (err) {
      console.error("Error fetching passed stocks:", err)
      setError("見送り銘柄の取得に失敗しました")
    } finally {
      setLoading(false)
    }
  }

  async function removeTracking(id: string) {
    try {
      const response = await fetch(`/api/passed-stocks/${id}`, {
        method: "DELETE",
      })
      if (!response.ok) {
        throw new Error("追跡の解除に失敗しました")
      }
      setPassedStocks((prev) => prev.filter((ps) => ps.id !== id))
    } catch (err) {
      console.error("Error removing tracking:", err)
    }
  }

  useEffect(() => {
    fetchPassedStocks()
  }, [])

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-md p-6">
        <div className="flex items-center justify-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-md p-6">
        <p className="text-sm text-red-600 text-center">{error}</p>
      </div>
    )
  }

  if (passedStocks.length === 0) {
    return null // 見送り銘柄がなければ何も表示しない
  }

  return (
    <div className="bg-white rounded-xl shadow-md p-4 sm:p-6">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">📊</span>
        <h2 className="text-lg font-bold text-gray-900">見送った銘柄の追跡</h2>
      </div>

      <p className="text-sm text-gray-600 mb-4">
        「あの時買ってたらどうなってた？」を振り返って、判断力を磨きましょう
      </p>

      <div className="space-y-3">
        {passedStocks.map((ps) => {
          const priceChange = ps.priceChangePercent || 0
          const whatIfProfit = ps.whatIfProfit || 0
          const isPositive = priceChange >= 0

          return (
            <div
              key={ps.id}
              className={`rounded-lg p-4 border ${
                isPositive
                  ? "bg-red-50 border-red-100"
                  : "bg-green-50 border-green-100"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-gray-900">{ps.stock.name}</h3>
                    <span className="text-xs text-gray-500">{ps.stock.tickerCode}</span>
                  </div>

                  <div className="text-xs text-gray-600 mb-2">
                    見送り日: {new Date(ps.passedAt).toLocaleDateString("ja-JP")}
                    {ps.passedReason && ` ・ 理由: ${ps.passedReason}`}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-gray-600">見送り時: </span>
                      <span className="font-medium">{ps.passedPrice.toLocaleString()}円</span>
                    </div>
                    <div>
                      <span className="text-gray-600">現在: </span>
                      <span className="font-medium">
                        {ps.currentPrice?.toLocaleString() || "-"}円
                      </span>
                    </div>
                  </div>

                  <div className="mt-2 flex items-center gap-3">
                    <span
                      className={`text-sm font-bold ${
                        isPositive ? "text-red-600" : "text-green-600"
                      }`}
                    >
                      {priceChange >= 0 ? "+" : ""}
                      {priceChange.toFixed(1)}%
                    </span>

                    {ps.whatIfQuantity && (
                      <span
                        className={`text-sm ${
                          isPositive ? "text-red-600" : "text-green-600"
                        }`}
                      >
                        {whatIfProfit >= 0 ? "+" : ""}
                        {whatIfProfit.toLocaleString()}円
                        <span className="text-gray-500 text-xs ml-1">
                          （{ps.whatIfQuantity}株なら）
                        </span>
                      </span>
                    )}
                  </div>

                  {/* 判断の振り返り */}
                  <div className="mt-2 p-2 bg-white rounded text-xs">
                    {isPositive ? (
                      <p className="text-red-700">
                        <span className="font-bold">買っていれば利益</span>が出ていました。
                        次回は良いタイミングを逃さないようにしましょう。
                      </p>
                    ) : (
                      <p className="text-green-700">
                        <span className="font-bold">見送り正解！</span>
                        株価は下がっています。良い判断でした。
                      </p>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => removeTracking(ps.id)}
                  className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                  title="追跡を解除"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
