"use client"

import { useState, useEffect } from "react"
import { UPDATE_SCHEDULES } from "@/lib/constants"

interface FeaturedStock {
  id: string
  stockId: string
  category: string | null
  reason: string | null
  isOwned: boolean // ポートフォリオにある場合
  isRegistered: boolean // ウォッチリストまたはポートフォリオにある場合
  stock: {
    id: string
    tickerCode: string
    name: string
    sector: string | null
    currentPrice: number | null
  }
}

// カテゴリのバッジ表示用
const categoryBadges: Record<string, { label: string; className: string }> = {
  surge: { label: "急騰", className: "bg-red-100 text-red-800" },
  stable: { label: "安定", className: "bg-blue-100 text-blue-800" },
  trending: { label: "話題", className: "bg-yellow-100 text-yellow-800" },
}

interface FeaturedStocksByCategoryProps {
  userId: string
}

export default function FeaturedStocksByCategory({
  userId,
}: FeaturedStocksByCategoryProps) {
  const [personalRecommendations, setPersonalRecommendations] = useState<FeaturedStock[]>([])
  const [trendingStocks, setTrendingStocks] = useState<FeaturedStock[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [addingStockId, setAddingStockId] = useState<string | null>(null)
  const [addingType, setAddingType] = useState<"watchlist" | "tracked" | null>(null)

  useEffect(() => {
    fetchFeaturedStocks()
    // ページ読み込み時に処理中のジョブがあるかチェック
    checkPendingJob()
  }, [])

  // 処理中のジョブがあるか確認
  const checkPendingJob = async () => {
    try {
      const response = await fetch("/api/analysis-jobs?type=featured-stocks")
      const data = await response.json()
      if (data.job) {
        setGenerating(true)
        pollJob(data.job.jobId)
      }
    } catch (error) {
      console.error("Error checking pending job:", error)
    }
  }

  // ジョブの完了をポーリングで監視
  const pollJob = async (jobId: string) => {
    const maxAttempts = 120 // 4分（2秒×120回）- 50銘柄の処理に時間がかかる
    let attempts = 0

    while (attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 2000))

      try {
        const response = await fetch(`/api/analysis-jobs/${jobId}`)
        const job = await response.json()

        if (job.status === "completed") {
          await fetchFeaturedStocks()
          setGenerating(false)
          return
        }

        if (job.status === "failed") {
          alert(job.error || "生成に失敗しました")
          setGenerating(false)
          return
        }
      } catch (error) {
        console.error("Error polling job:", error)
      }

      attempts++
    }

    // タイムアウト
    alert("処理がタイムアウトしました。ページを更新してください。")
    setGenerating(false)
  }

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
      setTrendingStocks((prev) =>
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
        const trending = data.trendingStocks || []
        setPersonalRecommendations(personal)
        setTrendingStocks(trending)

        // 株価を非同期で取得（表示後にバックグラウンドで）
        const allStocks = [...personal, ...trending]
        fetchPrices(allStocks)
      } else {
        console.error("Error fetching featured stocks:", data.error)
      }
    } catch (error) {
      console.error("Error fetching featured stocks:", error)
    } finally {
      setLoading(false)
    }
  }

  // 銘柄を登録済みに更新するヘルパー
  const markAsRegistered = (stockId: string) => {
    setPersonalRecommendations((prev) =>
      prev.map((s) => (s.stockId === stockId ? { ...s, isRegistered: true } : s))
    )
    setTrendingStocks((prev) =>
      prev.map((s) => (s.stockId === stockId ? { ...s, isRegistered: true } : s))
    )
  }

  const handleAddToWatchlist = async (stock: FeaturedStock) => {
    setAddingStockId(stock.id)
    setAddingType("watchlist")
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
        alert(data.error || "追加に失敗しました")
        return
      }

      // ローカルstateを更新（再取得なし）
      markAsRegistered(stock.stockId)
    } catch (error) {
      console.error("Error adding to watchlist:", error)
      alert("追加に失敗しました")
    } finally {
      setAddingStockId(null)
      setAddingType(null)
    }
  }

  const handleAddToTracked = async (stock: FeaturedStock) => {
    setAddingStockId(stock.id)
    setAddingType("tracked")
    try {
      const response = await fetch("/api/tracked-stocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tickerCode: stock.stock.tickerCode,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        alert(data.error || "追加に失敗しました")
        return
      }

      // ローカルstateを更新（再取得なし）
      markAsRegistered(stock.stockId)
    } catch (error) {
      console.error("Error adding to tracked:", error)
      alert("追加に失敗しました")
    } finally {
      setAddingStockId(null)
      setAddingType(null)
    }
  }

  const hasAnyStocks = personalRecommendations.length > 0 || trendingStocks.length > 0

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

  const handleGenerate = async () => {
    try {
      setGenerating(true)

      // 非同期ジョブを作成
      const response = await fetch("/api/analysis-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "featured-stocks" }),
      })

      const data = await response.json()

      if (!response.ok) {
        alert(data.error || "生成の開始に失敗しました")
        setGenerating(false)
        return
      }

      // ポーリングでジョブの完了を待つ
      pollJob(data.jobId)
    } catch (error) {
      console.error("Error generating featured stocks:", error)
      alert("生成に失敗しました")
      setGenerating(false)
    }
  }

  if (!hasAnyStocks) {
    return (
      <div className="bg-white rounded-xl p-4 sm:p-6 shadow-md">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xl sm:text-2xl">⭐</span>
          <h3 className="text-lg sm:text-xl font-bold text-gray-900">今日の注目銘柄</h3>
        </div>
        <div className="text-center py-6 sm:py-8">
          <div className="text-4xl sm:text-5xl mb-3 sm:mb-4">🔍</div>
          <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">
            注目銘柄がまだありません
          </h3>
          <p className="text-xs sm:text-sm text-gray-600 mb-4">
            AIが毎日注目銘柄を発見します
          </p>
          {generating ? (
            <div className="flex flex-col items-center gap-2">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-400 text-white rounded-lg font-semibold text-sm cursor-not-allowed">
                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                生成中...
              </div>
              <p className="text-xs text-gray-500">50銘柄を分析しています（数分かかる場合があります）</p>
            </div>
          ) : (
            <button
              onClick={handleGenerate}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-700 transition-colors"
            >
              今すぐ生成する
            </button>
          )}
        </div>
      </div>
    )
  }

  const renderStockCard = (stock: FeaturedStock, colorTheme: "blue" | "purple") => {
    const themes = {
      blue: {
        bg: "bg-blue-50",
        border: "border-blue-200",
        button: "bg-blue-600 text-white hover:bg-blue-700",
      },
      purple: {
        bg: "bg-purple-50",
        border: "border-purple-200",
        button: "bg-purple-600 text-white hover:bg-purple-700",
      },
    }
    const theme = themes[colorTheme]

    return (
      <div
        key={stock.id}
        className={`relative flex-shrink-0 w-64 sm:w-72 bg-white rounded-lg p-3 sm:p-4 border-2 ${theme.border} ${theme.bg} hover:shadow-md transition-shadow`}
      >
        {/* バッジ - 右上 */}
        <div className="absolute top-2 right-2 flex items-center gap-1">
          {stock.category && categoryBadges[stock.category] && (
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${categoryBadges[stock.category].className}`}>
              {categoryBadges[stock.category].label}
            </span>
          )}
          {stock.isOwned ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">
              保有中
            </span>
          ) : stock.isRegistered ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800">
              気になる
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
                <span>{stock.stock.tickerCode}</span>
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
          <div className="mb-2 sm:mb-3">
            <p className="text-xs text-gray-700 leading-relaxed line-clamp-3">
              {stock.reason}
            </p>
          </div>
        )}

        {stock.isRegistered ? (
          <div className="w-full px-3 sm:px-4 py-2 rounded-lg font-semibold text-xs sm:text-sm text-center bg-gray-300 text-gray-500">
            登録済み
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => handleAddToWatchlist(stock)}
              disabled={addingStockId === stock.id}
              className={`flex-1 px-2 sm:px-3 py-2 rounded-lg font-semibold text-xs sm:text-sm transition-colors disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed ${addingStockId === stock.id ? "" : theme.button}`}
            >
              {addingStockId === stock.id && addingType === "watchlist" ? "追加中..." : "気になる"}
            </button>
            <button
              onClick={() => handleAddToTracked(stock)}
              disabled={addingStockId === stock.id}
              className="flex-1 px-2 sm:px-3 py-2 rounded-lg font-semibold text-xs sm:text-sm transition-colors bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed"
            >
              {addingStockId === stock.id && addingType === "tracked" ? "追加中..." : "追跡"}
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* あなたへのおすすめ */}
      {personalRecommendations.length > 0 && (
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
              {personalRecommendations.map((stock) => renderStockCard(stock, "blue"))}
            </div>
          </div>
        </div>
      )}

      {/* みんなが注目 */}
      {trendingStocks.length > 0 && (
        <div className="bg-white rounded-xl p-4 sm:p-6 shadow-md">
          <div className="mb-4 sm:mb-5">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl sm:text-2xl">🔥</span>
              <h3 className="text-lg sm:text-xl font-bold text-gray-900">みんなが注目</h3>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
              <p className="text-xs sm:text-sm text-gray-600">
                いま話題になっている銘柄です
              </p>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span>更新 {UPDATE_SCHEDULES.FEATURED_STOCKS}（平日）</span>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto pb-2 -mx-1 px-1">
            <div className="flex gap-3 sm:gap-4" style={{ minWidth: "min-content" }}>
              {trendingStocks.map((stock) => renderStockCard(stock, "purple"))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
