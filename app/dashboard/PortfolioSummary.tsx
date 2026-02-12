"use client"

import { useState, useEffect } from "react"

interface PortfolioSummaryData {
  totalValue: number
  totalCost: number
  unrealizedGain: number
  unrealizedGainPercent: number
}

interface PortfolioSummaryProps {
  hasHoldings: boolean
}

export default function PortfolioSummary({ hasHoldings }: PortfolioSummaryProps) {
  const [summary, setSummary] = useState<PortfolioSummaryData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!hasHoldings) {
      setLoading(false)
      return
    }

    const fetchSummary = async () => {
      try {
        const response = await fetch("/api/portfolio/summary")
        const data = await response.json()

        if (response.ok && data.summary) {
          setSummary(data.summary)
        }
      } catch (error) {
        console.error("Error fetching portfolio summary:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchSummary()
  }, [hasHoldings])

  if (!hasHoldings) {
    return null
  }

  if (loading) {
    return (
      <div className="mb-6 bg-white rounded-xl p-4 shadow-sm border border-gray-200">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center">
            <span className="text-lg">💰</span>
          </div>
          <span className="text-sm font-semibold text-gray-900">資産状況</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center">
            <div className="text-xs text-gray-500 mb-1">総資産額</div>
            <div className="h-6 bg-gray-200 rounded animate-pulse"></div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-500 mb-1">含み損益</div>
            <div className="h-6 bg-gray-200 rounded animate-pulse"></div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-500 mb-1">損益率</div>
            <div className="h-6 bg-gray-200 rounded animate-pulse"></div>
          </div>
        </div>
      </div>
    )
  }

  if (!summary) {
    return null
  }

  return (
    <div className="mb-6 bg-white rounded-xl p-4 shadow-sm border border-gray-200">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center">
          <span className="text-lg">💰</span>
        </div>
        <span className="text-sm font-semibold text-gray-900">資産状況</span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="text-center">
          <div className="text-xs text-gray-500 mb-1">総資産額</div>
          <div className="text-base sm:text-lg font-bold text-gray-900">
            ¥{Math.round(summary.totalValue).toLocaleString()}
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-500 mb-1">含み損益</div>
          <div
            className={`text-base sm:text-lg font-bold ${
              summary.unrealizedGain >= 0 ? "text-green-600" : "text-red-600"
            }`}
          >
            {summary.unrealizedGain >= 0 ? "+" : ""}
            ¥{Math.round(summary.unrealizedGain).toLocaleString()}
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-500 mb-1">損益率</div>
          <div
            className={`text-base sm:text-lg font-bold ${
              summary.unrealizedGainPercent >= 0 ? "text-green-600" : "text-red-600"
            }`}
          >
            {summary.unrealizedGainPercent >= 0 ? "+" : ""}
            {summary.unrealizedGainPercent.toFixed(1)}%
          </div>
        </div>
      </div>
    </div>
  )
}
