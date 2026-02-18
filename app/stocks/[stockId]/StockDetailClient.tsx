"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import FinancialMetrics from "@/app/components/FinancialMetrics"
import EarningsInfo from "@/app/components/EarningsInfo"
import StockChart from "@/app/components/StockChart"
import PriceHistory from "@/app/components/PriceHistory"
import RelatedNews from "@/app/components/RelatedNews"
import StockDetailLayout from "@/app/components/StockDetailLayout"
import CurrentPriceCard from "@/app/components/CurrentPriceCard"
import StockActionButtons from "@/app/components/StockActionButtons"
import DeleteButton from "@/app/components/DeleteButton"
import AddStockDialog from "@/app/my-stocks/AddStockDialog"
import Tabs from "@/app/components/Tabs"
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
  volatility: number | null
  weekChangeRate: number | null
}

interface RecommendationData {
  type: "personal" | "featured"
  category: string | null
  reason: string
  date: string
}

interface SoldStockInfo {
  lastSellDate: string
  totalBuyQuantity: number
  totalBuyAmount: number
  totalSellAmount: number
  totalProfit: number
  profitPercent: number
  currentPrice: number | null
  hypotheticalProfit: number | null
  hypotheticalProfitPercent: number | null
}

interface Props {
  stock: StockData
  recommendation: RecommendationData | null
  isInWatchlist: boolean
  isTracked: boolean
  trackedStockId?: string
  soldStockInfo?: SoldStockInfo | null
}

// Category badge labels and styles
const categoryBadges: Record<string, { label: string; className: string }> = {
  surge: { label: "急騰", className: "bg-red-100 text-red-700" },
  stable: { label: "安定", className: "bg-blue-100 text-blue-700" },
  trending: { label: "話題", className: "bg-yellow-100 text-yellow-700" },
}

export default function StockDetailClient({
  stock,
  recommendation,
  isInWatchlist,
  isTracked,
  trackedStockId,
  soldStockInfo,
}: Props) {
  const router = useRouter()
  const { price, loading } = useStockPrice(stock.tickerCode)
  const [showPurchaseDialog, setShowPurchaseDialog] = useState(false)
  const [movingToWatchlist, setMovingToWatchlist] = useState(false)
  const [localIsTracked, setLocalIsTracked] = useState(isTracked)
  const [localTrackedStockId, setLocalTrackedStockId] = useState(trackedStockId)

  const currentPrice = price?.currentPrice || stock.currentPrice || 0

  const dateLabel = recommendation?.date
    ? new Date(recommendation.date).toLocaleDateString("ja-JP", {
        month: "long",
        day: "numeric",
      })
    : null

  // Determine badge for the header
  const getBadgeInfo = () => {
    // 追跡中の場合
    if (localIsTracked) {
      return {
        badge: "追跡中",
        className: "bg-gray-100 text-gray-700",
      }
    }

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

  // 追跡銘柄の削除
  const handleDeleteTracked = async () => {
    if (!localTrackedStockId) return
    if (!confirm(`${stock.name}の追跡をやめますか？`)) return

    try {
      const response = await fetch(`/api/tracked-stocks/${localTrackedStockId}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "削除に失敗しました")
      }

      router.push("/my-stocks")
    } catch (err: unknown) {
      console.error(err)
      alert(err instanceof Error ? err.message : "削除に失敗しました")
    }
  }

  // 追跡銘柄をウォッチリストに移動
  const handleMoveToWatchlist = async () => {
    if (!localTrackedStockId) return
    setMovingToWatchlist(true)
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
        throw new Error(data.error || "Failed to add to watchlist")
      }

      await fetch(`/api/tracked-stocks/${localTrackedStockId}`, {
        method: "DELETE",
      })

      router.push("/my-stocks")
    } catch (err: unknown) {
      console.error(err)
      alert(err instanceof Error ? err.message : "追加に失敗しました")
    } finally {
      setMovingToWatchlist(false)
    }
  }

  // 追跡成功時のコールバック
  const handleTrackedSuccess = (newTrackedStockId?: string) => {
    setLocalIsTracked(true)
    if (newTrackedStockId) {
      setLocalTrackedStockId(newTrackedStockId)
    }
  }

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
          localIsTracked ? (
            // 追跡中のアクション
            <>
              <button
                onClick={handleMoveToWatchlist}
                disabled={movingToWatchlist}
                className="px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded transition-colors disabled:opacity-50"
              >
                {movingToWatchlist ? "移動中..." : "気になるへ"}
              </button>
              <button
                onClick={() => setShowPurchaseDialog(true)}
                className="px-2 py-1 text-xs font-medium text-green-600 hover:bg-green-50 rounded transition-colors"
              >
                +購入
              </button>
            </>
          ) : (
            // おすすめのアクション
            <StockActionButtons
              tickerCode={stock.tickerCode}
              isInWatchlist={isInWatchlist}
              isTracked={localIsTracked}
              stockRiskInfo={{
                isProfitable: stock.isProfitable,
                volatility: stock.volatility,
                weekChangeRate: stock.weekChangeRate,
              }}
              onTrackedSuccess={handleTrackedSuccess}
            />
          )
        }
      />

      {/* Tracked Mode Info Box */}
      {localIsTracked && (
        <section className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <span className="text-xl">👁️</span>
            <div>
              <p className="text-sm text-blue-800 font-semibold mb-1">
                追跡モード
              </p>
              <p className="text-xs text-blue-700">
                この銘柄はAI分析なしで株価を追跡しています。AI分析を利用するには「気になる」へ移動してください。
              </p>
            </div>
          </div>
        </section>
      )}

      {/* AI Recommendation Section */}
      {recommendation && !localIsTracked && (
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

      {/* Tabs Section */}
      <Tabs
        tabs={[
          { id: "chart", label: "チャート" },
          { id: "news", label: "ニュース" },
          { id: "details", label: "詳細" },
        ]}
        defaultTab="chart"
      >
        {(activeTab) => (
          <div className="bg-white rounded-xl shadow-md p-4 sm:p-6">
            {activeTab === "chart" && (
              <>
                <StockChart stockId={stock.id} embedded />
                <PriceHistory stockId={stock.id} embedded />
              </>
            )}
            {activeTab === "news" && (
              <RelatedNews stockId={stock.id} embedded />
            )}
            {activeTab === "details" && (
              <>
                <FinancialMetrics stock={stock} embedded />
                <EarningsInfo earnings={stock} embedded />
              </>
            )}
          </div>
        )}
      </Tabs>

      {/* Delete Button (for tracked stocks) */}
      {localIsTracked && (
        <DeleteButton label="追跡をやめる" onClick={handleDeleteTracked} />
      )}

      {/* Purchase Dialog */}
      <AddStockDialog
        isOpen={showPurchaseDialog}
        onClose={() => setShowPurchaseDialog(false)}
        onSuccess={async () => {
          if (localTrackedStockId) {
            await fetch(`/api/tracked-stocks/${localTrackedStockId}`, {
              method: "DELETE",
            })
          }
          setShowPurchaseDialog(false)
          router.push("/my-stocks")
        }}
        defaultType="portfolio"
        initialStock={{
          id: stock.id,
          tickerCode: stock.tickerCode,
          name: stock.name,
          market: stock.market,
          sector: stock.sector,
          latestPrice: currentPrice || null,
        }}
      />
    </StockDetailLayout>
  )
}
