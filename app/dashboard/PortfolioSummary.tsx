"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import PerformanceSummary from "./PerformanceSummary"
import { useAppStore } from "@/store/useAppStore"
import type { PortfolioSummary as PortfolioSummaryData, NikkeiData, UserStock } from "@/store/types"

interface PortfolioSummaryProps {
  hasHoldings: boolean
}

interface HoldingStock {
  id: string
  name: string
  tickerCode: string
  quantity: number
  averagePurchasePrice: number
  currentPrice: number | null
  unrealizedGain: number | null
  unrealizedGainPercent: number | null
}

export default function PortfolioSummary({ hasHoldings }: PortfolioSummaryProps) {
  const { fetchPortfolioSummary, fetchNikkei, fetchUserStocks, fetchStockPrices } = useAppStore()
  const [summary, setSummary] = useState<PortfolioSummaryData | null>(null)
  const [nikkei, setNikkei] = useState<NikkeiData | null>(null)
  const [holdings, setHoldings] = useState<HoldingStock[]>([])
  const [loading, setLoading] = useState(true)
  const [isExpanded, setIsExpanded] = useState(false)

  useEffect(() => {
    if (!hasHoldings) {
      setLoading(false)
      return
    }

    const fetchData = async () => {
      try {
        const [summaryData, nikkeiData, userStocks] = await Promise.all([
          fetchPortfolioSummary(),
          fetchNikkei(),
          fetchUserStocks(),
        ])

        setSummary(summaryData)
        setNikkei(nikkeiData)

        // ポートフォリオ銘柄（保有数 > 0）をフィルタ
        const portfolioStocks = userStocks.filter(
          (s): s is UserStock & { quantity: number; averagePurchasePrice: number } =>
            s.type === "portfolio" && (s.quantity ?? 0) > 0
        )

        if (portfolioStocks.length > 0) {
          // 株価を取得
          const tickers = portfolioStocks.map((s) => s.stock.tickerCode)
          const priceMap = await fetchStockPrices(tickers)

          // 保有銘柄リストを作成
          const holdingsList: HoldingStock[] = portfolioStocks.map((s) => {
            const price = priceMap.get(s.stock.tickerCode)
            const currentPrice = price?.currentPrice ?? null
            let unrealizedGain: number | null = null
            let unrealizedGainPercent: number | null = null

            if (currentPrice !== null && s.averagePurchasePrice > 0) {
              unrealizedGain = (currentPrice - s.averagePurchasePrice) * s.quantity
              unrealizedGainPercent = ((currentPrice - s.averagePurchasePrice) / s.averagePurchasePrice) * 100
            }

            return {
              id: s.id,
              name: s.stock.name,
              tickerCode: s.stock.tickerCode,
              quantity: s.quantity,
              averagePurchasePrice: s.averagePurchasePrice,
              currentPrice,
              unrealizedGain,
              unrealizedGainPercent,
            }
          })

          setHoldings(holdingsList)
        }
      } catch (error) {
        console.error("Error fetching data:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [hasHoldings, fetchPortfolioSummary, fetchNikkei, fetchUserStocks, fetchStockPrices])

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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
          <div className="text-center">
            <div className="text-xs text-gray-500 mb-1">市場比較</div>
            <div className="h-6 bg-gray-200 rounded animate-pulse"></div>
          </div>
        </div>
      </div>
    )
  }

  if (!summary) {
    return null
  }

  // 市場比較の計算
  const comparison = nikkei
    ? summary.unrealizedGainPercent - nikkei.changePercent
    : null
  const isOutperforming = comparison !== null && comparison > 0

  return (
    <>
    <Link href="/my-stocks" className="block">
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 hover:shadow-md hover:border-blue-200 transition-all cursor-pointer">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center">
              <span className="text-lg">💰</span>
            </div>
            <span className="text-sm font-semibold text-gray-900">資産状況</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <span>マイ銘柄へ</span>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
          <div className="text-center">
            <div className="text-xs text-gray-500 mb-1">市場比較</div>
            {nikkei ? (
              <div className="flex flex-col items-center">
                <div
                  className={`text-base sm:text-lg font-bold ${
                    isOutperforming ? "text-green-600" : "text-orange-500"
                  }`}
                >
                  {comparison !== null && comparison >= 0 ? "+" : ""}
                  {comparison?.toFixed(1)}%
                </div>
                <div className="text-[10px] text-gray-400">
                  vs 日経平均
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-400">-</div>
            )}
          </div>
        </div>

        {/* 保有銘柄リスト */}
        {holdings.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                setIsExpanded(!isExpanded)
              }}
              className="flex items-center justify-between w-full text-left"
            >
              <div className="text-xs text-gray-500">
                保有銘柄（{holdings.length}件）
              </div>
              <svg
                className={`w-4 h-4 text-gray-400 transition-transform ${
                  isExpanded ? "rotate-180" : ""
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {isExpanded && (
              <div className="space-y-2 mt-2">
                {holdings.map((stock) => (
                  <div
                    key={stock.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 truncate">
                        {stock.name}
                      </div>
                      <div className="text-xs text-gray-400">
                        {stock.quantity.toLocaleString()}株
                      </div>
                    </div>
                    <div className="text-right ml-2">
                      <div className="text-gray-900">
                        {stock.currentPrice !== null
                          ? `¥${stock.currentPrice.toLocaleString()}`
                          : "-"}
                      </div>
                      {stock.unrealizedGain !== null && stock.unrealizedGainPercent !== null && (
                        <div
                          className={`text-xs ${
                            stock.unrealizedGain >= 0 ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {stock.unrealizedGain >= 0 ? "+" : ""}
                          ¥{Math.round(stock.unrealizedGain).toLocaleString()}
                          <span className="ml-1">
                            ({stock.unrealizedGainPercent >= 0 ? "+" : ""}
                            {stock.unrealizedGainPercent.toFixed(1)}%)
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Link>
    <PerformanceSummary summary={summary} />
    </>
  )
}
