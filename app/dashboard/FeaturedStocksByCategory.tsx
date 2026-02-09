"use client"

import { useState, useEffect } from "react"

interface FeaturedStock {
  id: string
  stockId: string
  category: string
  reason: string | null
  score: number | null
  isOwned: boolean
  stock: {
    id: string
    tickerCode: string
    name: string
    sector: string | null
    currentPrice: number | null
  }
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
  const [date, setDate] = useState<string | null>(null)

  useEffect(() => {
    fetchFeaturedStocks()
  }, [])

  const fetchFeaturedStocks = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/featured-stocks")
      const data = await response.json()

      if (response.ok) {
        setPersonalRecommendations(data.personalRecommendations || [])
        setTrendingStocks(data.trendingStocks || [])
        setDate(data.date || null)
      } else {
        console.error("Error fetching featured stocks:", data.error)
      }
    } catch (error) {
      console.error("Error fetching featured stocks:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleAddToWatchlist = async (stock: FeaturedStock) => {
    try {
      setAddingStockId(stock.stockId)

      const response = await fetch("/api/user-stocks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tickerCode: stock.stock.tickerCode,
          type: "watchlist",
          addedReason: stock.reason || "注目銘柄から追加",
        }),
      })

      const data = await response.json()

      if (response.ok) {
        alert(data.message || "ウォッチリストに追加しました")
      } else {
        alert(data.error || "追加に失敗しました")
      }
    } catch (error) {
      console.error("Error adding to watchlist:", error)
      alert("追加に失敗しました")
    } finally {
      setAddingStockId(null)
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
      const response = await fetch("/api/featured-stocks/generate-for-user", {
        method: "POST",
      })

      const data = await response.json()

      if (response.ok) {
        await fetchFeaturedStocks()
      } else {
        alert(data.error || "生成に失敗しました")
      }
    } catch (error) {
      console.error("Error generating featured stocks:", error)
      alert("生成に失敗しました")
    } finally {
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
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {generating ? "生成中..." : "今すぐ生成する"}
          </button>
        </div>
      </div>
    )
  }

  const formatDate = (dateString: string | null): string => {
    if (!dateString) return ""
    const d = new Date(dateString)
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日分`
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
        className={`flex-shrink-0 w-64 sm:w-72 bg-white rounded-lg p-3 sm:p-4 border-2 ${theme.border} ${theme.bg} hover:shadow-md transition-shadow`}
      >
        <div className="mb-2 sm:mb-3">
          <div className="flex items-start justify-between mb-1">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="text-sm sm:text-base font-bold text-gray-900 truncate">
                  {stock.stock.name}
                </h4>
                {stock.isOwned && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800 whitespace-nowrap">
                    保有中
                  </span>
                )}
              </div>
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

          {stock.stock.currentPrice && (
            <div className="text-base sm:text-lg font-bold text-gray-900 mt-1.5 sm:mt-2">
              ¥{stock.stock.currentPrice.toLocaleString()}
            </div>
          )}

          {stock.score !== null && (
            <div className="flex items-center gap-1 mt-1">
              <div className="text-xs text-gray-500">スコア:</div>
              <div className="text-xs sm:text-sm font-semibold text-gray-900">
                {Math.round(stock.score)}/100
              </div>
            </div>
          )}
        </div>

        {stock.reason && (
          <div className="mb-2 sm:mb-3">
            <p className="text-xs text-gray-700 leading-relaxed line-clamp-3">
              {stock.reason}
            </p>
          </div>
        )}

        <button
          onClick={() => handleAddToWatchlist(stock)}
          disabled={addingStockId === stock.stockId || stock.isOwned}
          className={`w-full px-3 sm:px-4 py-2 rounded-lg font-semibold text-xs sm:text-sm transition-colors disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed ${stock.isOwned ? "" : theme.button}`}
        >
          {addingStockId === stock.stockId
            ? "追加中..."
            : stock.isOwned
              ? "登録済み"
              : "ウォッチリストに追加"}
        </button>
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
              {date && (
                <span className="text-xs sm:text-sm text-gray-500 whitespace-nowrap">
                  {formatDate(date)}
                </span>
              )}
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
            <p className="text-xs sm:text-sm text-gray-600">
              いま話題になっている銘柄です
            </p>
          </div>
          <div className="overflow-x-auto pb-2 -mx-1 px-1">
            <div className="flex gap-3 sm:gap-4" style={{ minWidth: "min-content" }}>
              {trendingStocks.map((stock) => renderStockCard(stock, "purple"))}
            </div>
          </div>
        </div>
      )}

      {/* Footer Note */}
      <div className="pt-2">
        <p className="text-xs text-gray-500 text-center">
          注目銘柄は毎日AIが分析して更新されます
        </p>
      </div>
    </div>
  )
}
