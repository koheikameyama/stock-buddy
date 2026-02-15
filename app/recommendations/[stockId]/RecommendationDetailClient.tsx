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

interface RecommendationData {
  type: "personal" | "featured"
  category: string | null
  reason: string
  date: string
}

interface Props {
  stock: StockData
  recommendation: RecommendationData | null
}

// Category badge labels and styles
const categoryBadges: Record<string, { label: string; className: string }> = {
  surge: { label: "急騰", className: "bg-red-100 text-red-700" },
  stable: { label: "安定", className: "bg-blue-100 text-blue-700" },
  trending: { label: "話題", className: "bg-yellow-100 text-yellow-700" },
}

export default function RecommendationDetailClient({ stock, recommendation }: Props) {
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

  const dateLabel = recommendation?.date
    ? new Date(recommendation.date).toLocaleDateString("ja-JP", {
        month: "long",
        day: "numeric",
      })
    : null

  // Determine badge for the header
  const getBadgeInfo = () => {
    if (!recommendation) return { badge: undefined, className: undefined }

    if (recommendation.type === "personal") {
      return {
        badge: "あなたへのおすすめ",
        className: "bg-blue-100 text-blue-700",
      }
    }

    if (recommendation.category && categoryBadges[recommendation.category]) {
      const cat = categoryBadges[recommendation.category]
      return { badge: cat.label, className: cat.className }
    }

    return { badge: "おすすめ", className: "bg-purple-100 text-purple-700" }
  }

  const badgeInfo = getBadgeInfo()

  return (
    <StockDetailLayout
      name={stock.name}
      tickerCode={stock.tickerCode}
      sector={stock.sector}
      badge={badgeInfo.badge}
      badgeClassName={badgeInfo.className}
      backHref="/dashboard"
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
              className="px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded transition-colors disabled:opacity-50"
            >
              {addingToWatchlist ? "追加中..." : "+気になる"}
            </button>
            <button
              onClick={handleAddToTracked}
              disabled={addingToWatchlist || addingToTracked}
              className="px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
            >
              {addingToTracked ? "追加中..." : "+追跡"}
            </button>
          </>
        }
      />

      {/* AI Recommendation Section */}
      {recommendation && (
        <section className="bg-white rounded-xl shadow-md p-4 sm:p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-lg">🤖</span>
            <h2 className="text-lg sm:text-xl font-bold text-gray-900">
              {recommendation.type === "personal" ? "AIおすすめ理由" : "注目理由"}
            </h2>
            {dateLabel && (
              <span className="text-xs text-gray-400">
                {dateLabel}
              </span>
            )}
          </div>

          {/* Category Badge (for featured stocks) */}
          {recommendation.category && categoryBadges[recommendation.category] && (
            <div className="mb-4">
              <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-bold ${categoryBadges[recommendation.category].className}`}
              >
                {recommendation.category === "surge" && "🚀 "}
                {recommendation.category === "stable" && "🛡️ "}
                {recommendation.category === "trending" && "🔥 "}
                {categoryBadges[recommendation.category].label}
              </span>
            </div>
          )}

          {/* Recommendation Text */}
          <div
            className={`rounded-lg p-4 ${
              recommendation.type === "personal"
                ? "bg-blue-50 border border-blue-100"
                : "bg-purple-50 border border-purple-100"
            }`}
          >
            <p className="text-sm text-gray-800 leading-relaxed">
              {recommendation.reason}
            </p>
          </div>
        </section>
      )}

      {/* Earnings Info Section */}
      <EarningsInfo earnings={stock} />

      {/* Related News Section */}
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
