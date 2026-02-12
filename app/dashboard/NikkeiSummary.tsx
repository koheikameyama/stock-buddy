"use client"

import { useState, useEffect } from "react"

interface NikkeiData {
  currentPrice: number
  previousClose: number
  change: number
  changePercent: number
  timestamp: string
}

export default function NikkeiSummary() {
  const [nikkei, setNikkei] = useState<NikkeiData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchNikkei = async () => {
      try {
        const response = await fetch("/api/market/nikkei")
        const data = await response.json()

        if (response.ok) {
          setNikkei(data)
        }
      } catch (error) {
        console.error("Error fetching Nikkei 225:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchNikkei()
  }, [])

  if (loading) {
    return (
      <div className="mb-4 sm:mb-6 bg-white rounded-xl p-3 sm:p-4 shadow-sm border border-gray-200">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-orange-50 flex items-center justify-center shrink-0">
            <span className="text-lg sm:text-xl">📈</span>
          </div>
          <div className="flex-1">
            <div className="text-xs text-gray-500 mb-1">日経平均株価</div>
            <div className="flex items-baseline gap-2">
              <div className="h-6 w-24 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-4 w-16 bg-gray-200 rounded animate-pulse"></div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!nikkei) {
    return null
  }

  const isPositive = nikkei.change >= 0

  return (
    <div className="mb-4 sm:mb-6 bg-white rounded-xl p-3 sm:p-4 shadow-sm border border-gray-200">
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-orange-50 flex items-center justify-center shrink-0">
          <span className="text-lg sm:text-xl">📈</span>
        </div>
        <div className="flex-1">
          <div className="text-xs text-gray-500 mb-0.5">日経平均株価</div>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-base sm:text-lg font-bold text-gray-900">
              ¥{Math.round(nikkei.currentPrice).toLocaleString()}
            </span>
            <span
              className={`text-xs sm:text-sm font-semibold ${
                isPositive ? "text-green-600" : "text-red-600"
              }`}
            >
              {isPositive ? "+" : ""}
              {Math.round(nikkei.change).toLocaleString()}
              <span className="ml-1">
                ({isPositive ? "+" : ""}
                {nikkei.changePercent.toFixed(2)}%)
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
