"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { UPDATE_SCHEDULES } from "@/lib/constants"
import { CARD_FOOTER_STYLES } from "@/lib/ui-config"
import StockActionButtons from "@/app/components/StockActionButtons"
import CopyableTicker from "@/app/components/CopyableTicker"

interface FeaturedStock {
  id: string
  stockId: string
  category: string | null
  reason: string | null
  isOwned: boolean // ポートフォリオにある場合
  isRegistered: boolean // ウォッチリストにある場合
  isTracked: boolean // 追跡中の場合
  userStockId: string | null // ポートフォリオまたはウォッチリストのID
  stock: {
    id: string
    tickerCode: string
    name: string
    sector: string | null
    currentPrice: number | null
    isProfitable: boolean | null
    volatility: number | null
    weekChangeRate: number | null
  }
}

export default function FeaturedStocksByCategory() {
  const [personalRecommendations, setPersonalRecommendations] = useState<FeaturedStock[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchFeaturedStocks()
  }, [])

  // 株価を非同期で取得
  const fetchPrices = async (stocks: FeaturedStock[]) => {
    if (stocks.length === 0) return

    const tickerCodes = stocks.map((s) => s.stock.tickerCode)
    try {
      const response = await fetch(`/api/stocks/prices?tickers=${tickerCodes.join(",")}`)
      if (!response.ok) return

      const data = await response.json()
      const priceMap = new Map<string, number>(
        data.prices?.map((p: { tickerCode: string; currentPrice: number }) => [p.tickerCode, p.currentPrice]) || []
      )

      // 株価を更新
      setPersonalRecommendations((prev) =>
        prev.map((s) => ({
          ...s,
          stock: {
            ...s.stock,
            currentPrice: priceMap.get(s.stock.tickerCode) ?? s.stock.currentPrice,
          },
        }))
      )
    } catch (error) {
      console.error("Error fetching prices:", error)
    }
  }

  const fetchFeaturedStocks = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/featured-stocks")
      const data = await response.json()

      if (response.ok) {
        const personal = data.personalRecommendations || []
        setPersonalRecommendations(personal)

        // 株価を非同期で取得（表示後にバックグラウンドで）
        fetchPrices(personal)
      } else {
        console.error("Error fetching featured stocks:", data.error)
      }
    } catch (error) {
      console.error("Error fetching featured stocks:", error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl p-4 sm:p-6 shadow-md">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xl sm:text-2xl">⭐</span>
          <h3 className="text-lg sm:text-xl font-bold text-gray-900">今日の注目銘柄</h3>
        </div>
        <p className="text-xs sm:text-sm text-gray-500">読み込み中...</p>
      </div>
    )
  }

  if (personalRecommendations.length === 0) {
    return (
      <div className="bg-white rounded-xl p-4 sm:p-6 shadow-md">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xl sm:text-2xl">⭐</span>
          <h3 className="text-lg sm:text-xl font-bold text-gray-900">今日の注目銘柄</h3>
        </div>
        <div className="text-center py-6 sm:py-8">
          <div className="text-4xl sm:text-5xl mb-3 sm:mb-4">🔍</div>
          <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">
            おすすめ銘柄がまだありません
          </h3>
          <p className="text-xs sm:text-sm text-gray-600">
            AIが毎日あなたに合った銘柄をおすすめします
          </p>
        </div>
      </div>
    )
  }

  // 銘柄のステータスを更新するハンドラー
  const updateStockStatus = (stockId: string, type: "watchlist" | "tracked") => {
    const updateFn = (stocks: FeaturedStock[]) =>
      stocks.map((s) =>
        s.stockId === stockId
          ? { ...s, isRegistered: type === "watchlist", isTracked: type === "tracked" }
          : s
      )
    setPersonalRecommendations(updateFn)
  }

  const renderStockCard = (stock: FeaturedStock) => {
    return (
      <div
        key={stock.id}
        className="relative flex-shrink-0 w-64 sm:w-72 bg-white rounded-lg p-3 sm:p-4 border-2 border-blue-200 bg-blue-50 hover:shadow-md transition-shadow"
      >
        {/* バッジ - 右上 */}
        <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
          {stock.isOwned ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">
              保有中
            </span>
          ) : stock.isRegistered ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800">
              気になる
            </span>
          ) : stock.isTracked ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-800">
              追跡中
            </span>
          ) : null}
        </div>

        <div className="mb-2 sm:mb-3">
          <div className="flex items-start justify-between mb-1">
            <div className="flex-1 min-w-0 pr-14">
              <h4 className="text-sm sm:text-base font-bold text-gray-900 truncate mb-1">
                {stock.stock.name}
              </h4>
              <div className="flex items-center gap-1.5 sm:gap-2 text-xs text-gray-500">
                <CopyableTicker tickerCode={stock.stock.tickerCode} />
                {stock.stock.sector && (
                  <>
                    <span>•</span>
                    <span className="truncate">{stock.stock.sector}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="text-base sm:text-lg font-bold text-gray-900 mt-1.5 sm:mt-2">
            {stock.stock.currentPrice != null ? (
              `¥${stock.stock.currentPrice.toLocaleString()}`
            ) : (
              <span className="text-gray-400 text-sm">取得中...</span>
            )}
          </div>
        </div>

        {stock.reason && (
          <div className="mb-2 sm:mb-3 p-2.5 rounded-lg bg-gray-50 border border-gray-200">
            <p className="text-xs text-gray-700 leading-relaxed line-clamp-3">
              {stock.reason}
            </p>
          </div>
        )}

        <div className={CARD_FOOTER_STYLES.container}>
          {/* アクションボタン（保有中以外で表示） */}
          {!stock.isOwned && (
            <div className={CARD_FOOTER_STYLES.actionGroup}>
              <StockActionButtons
                tickerCode={stock.stock.tickerCode}
                showWatchlist={!stock.isRegistered && !stock.isTracked}
                showTracked={!stock.isRegistered && !stock.isTracked}
                isInWatchlist={stock.isRegistered}
                isTracked={stock.isTracked}
                onWatchlistSuccess={() => updateStockStatus(stock.stockId, "watchlist")}
                onTrackedSuccess={() => updateStockStatus(stock.stockId, "tracked")}
                stockRiskInfo={{
                  isProfitable: stock.stock.isProfitable,
                  volatility: stock.stock.volatility,
                  weekChangeRate: stock.stock.weekChangeRate,
                }}
              />
            </div>
          )}
          {stock.isOwned && <div />}

          <Link
            href={stock.userStockId ? `/my-stocks/${stock.userStockId}` : `/stocks/${stock.stockId}`}
            className={CARD_FOOTER_STYLES.detailLink}
          >
            <span className={CARD_FOOTER_STYLES.detailLinkText}>詳細を見る</span>
            <svg
              className="w-4 h-4 ml-1"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl p-4 sm:p-6 shadow-md">
      <div className="mb-4 sm:mb-5">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xl sm:text-2xl">⭐</span>
          <h3 className="text-lg sm:text-xl font-bold text-gray-900">あなたへのおすすめ</h3>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
          <p className="text-xs sm:text-sm text-gray-600">
            投資スタイルと予算に合わせてAIが選びました
          </p>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span>更新 {UPDATE_SCHEDULES.PERSONAL_RECOMMENDATIONS}（平日）</span>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto pb-2 -mx-1 px-1">
        <div className="flex gap-3 sm:gap-4" style={{ minWidth: "min-content" }}>
          {personalRecommendations.map((stock) => renderStockCard(stock))}
        </div>
      </div>
    </div>
  )
}
