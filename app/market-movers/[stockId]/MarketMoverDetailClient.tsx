"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import FinancialMetrics from "@/app/components/FinancialMetrics"
import EarningsInfo from "@/app/components/EarningsInfo"
import StockChart from "@/app/components/StockChart"
import PriceHistory from "@/app/components/PriceHistory"
import RelatedNews from "@/app/components/RelatedNews"
import StockDetailLayout from "@/app/components/StockDetailLayout"
import CurrentPriceCard from "@/app/components/CurrentPriceCard"
import { useStockPrice } from "@/app/hooks/useStockPrice"

interface StockData {
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
  isProfitable: boolean | null
  profitTrend: string | null
  revenueGrowth: number | null
  netIncomeGrowth: number | null
  eps: number | null
  latestRevenue: number | null
  latestNetIncome: number | null
}

interface MoverData {
  type: "gainer" | "loser"
  changeRate: number
  analysis: string
  relatedNews: { title: string; url: string | null; sentiment: string | null }[] | null
  date: string
}

interface Props {
  stock: StockData
  mover: MoverData | null
}

export default function MarketMoverDetailClient({ stock, mover }: Props) {
  const router = useRouter()
  const { price, loading } = useStockPrice(stock.tickerCode)
  const [addingToWatchlist, setAddingToWatchlist] = useState(false)
  const [addingToTracked, setAddingToTracked] = useState(false)

  const handleAddToWatchlist = async () => {
    setAddingToWatchlist(true)
    try {
      const response = await fetch("/api/user-stocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tickerCode: stock.tickerCode,
          type: "watchlist",
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "追加に失敗しました")
      }

      toast.success("気になるに追加しました")
      router.push("/my-stocks")
    } catch (err: unknown) {
      const error = err as Error
      toast.error(error.message || "追加に失敗しました")
    } finally {
      setAddingToWatchlist(false)
    }
  }

  const handleAddToTracked = async () => {
    setAddingToTracked(true)
    try {
      const response = await fetch("/api/tracked-stocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tickerCode: stock.tickerCode,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "追加に失敗しました")
      }

      toast.success("追跡に追加しました")
      router.push("/my-stocks")
    } catch (err: unknown) {
      const error = err as Error
      toast.error(error.message || "追加に失敗しました")
    } finally {
      setAddingToTracked(false)
    }
  }

  const isGainer = mover?.type === "gainer"
  const dateLabel = mover?.date
    ? new Date(mover.date).toLocaleDateString("ja-JP", {
        month: "long",
        day: "numeric",
      })
    : null

  return (
    <StockDetailLayout
      name={stock.name}
      tickerCode={stock.tickerCode}
      sector={stock.sector}
      badge={mover ? (isGainer ? "値上がり" : "値下がり") : undefined}
      badgeClassName={mover ? (isGainer ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700") : undefined}
      backHref="/market-movers"
    >
          {/* Current Price Section */}
          <CurrentPriceCard
            price={price}
            loading={loading}
            fiftyTwoWeekHigh={stock.fiftyTwoWeekHigh}
            fiftyTwoWeekLow={stock.fiftyTwoWeekLow}
            actions={
              <>
                <button
                  onClick={handleAddToWatchlist}
                  disabled={addingToWatchlist || addingToTracked}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors disabled:opacity-50"
                >
                  {addingToWatchlist ? "追加中..." : "気になる"}
                </button>
                <button
                  onClick={handleAddToTracked}
                  disabled={addingToWatchlist || addingToTracked}
                  className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded transition-colors disabled:opacity-50"
                >
                  {addingToTracked ? "追加中..." : "追跡"}
                </button>
              </>
            }
          />

          {/* AI Analysis Section (from Market Mover) */}
          {mover && (
            <section className="bg-white rounded-xl shadow-md p-4 sm:p-6 mb-6">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-lg">🤖</span>
                <h2 className="text-lg sm:text-xl font-bold text-gray-900">
                  AI原因分析
                </h2>
                {dateLabel && (
                  <span className="text-xs text-gray-400">
                    {dateLabel}
                  </span>
                )}
              </div>

              {/* Change Rate Badge */}
              <div className="mb-4">
                <span
                  className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-bold ${
                    isGainer
                      ? "bg-red-100 text-red-700"
                      : "bg-blue-100 text-blue-700"
                  }`}
                >
                  {isGainer ? "🔺" : "🔻"}{" "}
                  {isGainer ? "+" : ""}
                  {mover.changeRate.toFixed(2)}%
                </span>
              </div>

              {/* Analysis Text */}
              <div
                className={`rounded-lg p-4 mb-4 ${
                  isGainer
                    ? "bg-red-50 border border-red-100"
                    : "bg-blue-50 border border-blue-100"
                }`}
              >
                <p className="text-sm text-gray-800 leading-relaxed">
                  {mover.analysis}
                </p>
              </div>

              {/* Related News from Analysis */}
              {mover.relatedNews && mover.relatedNews.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-3">
                    <span className="text-sm">📰</span>
                    <span className="text-sm font-semibold text-gray-700">
                      関連ニュース
                    </span>
                  </div>
                  <div className="space-y-2">
                    {mover.relatedNews.map((item, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          {item.url ? (
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-gray-800 hover:text-blue-600 transition-colors line-clamp-2"
                            >
                              {item.title}
                            </a>
                          ) : (
                            <p className="text-sm text-gray-800 line-clamp-2">
                              {item.title}
                            </p>
                          )}
                          {item.sentiment && (
                            <span
                              className={`inline-block mt-1 px-2 py-0.5 text-xs rounded ${
                                item.sentiment === "positive"
                                  ? "bg-green-100 text-green-700"
                                  : item.sentiment === "negative"
                                  ? "bg-red-100 text-red-700"
                                  : "bg-gray-100 text-gray-600"
                              }`}
                            >
                              {item.sentiment === "positive"
                                ? "好材料"
                                : item.sentiment === "negative"
                                ? "悪材料"
                                : "中立"}
                            </span>
                          )}
                        </div>
                        {item.url && (
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-shrink-0 p-1 text-gray-400 hover:text-blue-500"
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
                                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                              />
                            </svg>
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Earnings Info Section */}
          <EarningsInfo earnings={stock} />

          {/* Related News Section (from News table) */}
          <RelatedNews stockId={stock.id} />

          {/* Chart Section */}
          <StockChart stockId={stock.id} />

          {/* Price History Section */}
          <PriceHistory stockId={stock.id} />

      {/* Financial Metrics Section */}
      <FinancialMetrics stock={stock} />
    </StockDetailLayout>
  )
}
