"use client"

import { useState, useEffect } from "react"

interface FeaturedStock {
  id: string
  stockId: string
  category: string // "surge" | "stable" | "trending"
  reason: string | null
  score: number | null
  isOwned: boolean // 保有中かどうか
  isRecommended: boolean // 最優先カテゴリかどうか
  stock: {
    id: string
    tickerCode: string
    name: string
    sector: string | null
    currentPrice: number | null
  }
}

interface CategoryConfig {
  label: string
  description: string
  color: string
  bgColor: string
  borderColor: string
  icon: string
}

const categories: Record<string, CategoryConfig> = {
  surge: {
    label: "急騰",
    description: "短期で急騰が期待される銘柄",
    color: "text-red-700",
    bgColor: "bg-red-50",
    borderColor: "border-red-200",
    icon: "📈",
  },
  stable: {
    label: "安定",
    description: "中長期で安定成長が期待される銘柄",
    color: "text-blue-700",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
    icon: "📊",
  },
  trending: {
    label: "話題",
    description: "注目度が高い銘柄",
    color: "text-purple-700",
    bgColor: "bg-purple-50",
    borderColor: "border-purple-200",
    icon: "🔥",
  },
}

interface FeaturedStocksByCategoryProps {
  userId: string
}

export default function FeaturedStocksByCategory({
  userId,
}: FeaturedStocksByCategoryProps) {
  const [featuredStocks, setFeaturedStocks] = useState<FeaturedStock[]>([])
  const [loading, setLoading] = useState(true)
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
        setFeaturedStocks(data.featuredStocks || [])
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

  const handleAddToWatchlist = async (stockId: string) => {
    try {
      setAddingStockId(stockId)

      const response = await fetch("/api/watchlist/add", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId,
          stockId,
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

  // Group stocks by category
  const stocksByCategory = {
    surge: featuredStocks.filter((s) => s.category === "surge").slice(0, 5),
    stable: featuredStocks.filter((s) => s.category === "stable").slice(0, 5),
    trending: featuredStocks.filter((s) => s.category === "trending").slice(0, 5),
  }

  const hasAnyStocks =
    stocksByCategory.surge.length > 0 ||
    stocksByCategory.stable.length > 0 ||
    stocksByCategory.trending.length > 0

  if (loading) {
    return (
      <div className="bg-white rounded-xl p-4 sm:p-6 shadow-md">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xl sm:text-2xl">⭐</span>
          <h3 className="text-base sm:text-lg font-bold text-gray-900">注目銘柄</h3>
        </div>
        <p className="text-xs sm:text-sm text-gray-500">読み込み中...</p>
      </div>
    )
  }

  if (!hasAnyStocks) {
    return (
      <div className="bg-white rounded-xl p-4 sm:p-6 shadow-md">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xl sm:text-2xl">⭐</span>
          <h3 className="text-base sm:text-lg font-bold text-gray-900">注目銘柄</h3>
        </div>
        <div className="text-center py-6 sm:py-8">
          <div className="text-4xl sm:text-5xl mb-3 sm:mb-4">🔍</div>
          <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">
            注目銘柄がまだありません
          </h3>
          <p className="text-xs sm:text-sm text-gray-600">
            AIが毎日注目銘柄を発見します
          </p>
        </div>
      </div>
    )
  }

  // Format date as "YYYY年M月D日分"
  const formatDate = (dateString: string | null): string => {
    if (!dateString) return ""
    const date = new Date(dateString)
    const year = date.getFullYear()
    const month = date.getMonth() + 1
    const day = date.getDate()
    return `${year}年${month}月${day}日分`
  }

  return (
    <div className="bg-white rounded-xl p-4 sm:p-6 shadow-md">
      {/* Section Header */}
      <div className="mb-4 sm:mb-6">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl sm:text-2xl">⭐</span>
          <h3 className="text-lg sm:text-xl font-bold text-gray-900">あなたにおすすめの注目銘柄</h3>
          {date && (
            <span className="text-xs sm:text-sm text-gray-500 ml-auto">
              {formatDate(date)}
            </span>
          )}
        </div>
        <p className="text-xs sm:text-sm text-gray-600">
          あなたの投資スタイルに合わせて、AIが今日の注目銘柄をご紹介します
        </p>
      </div>

      {/* Category Sections */}
      <div className="space-y-4 sm:space-y-6">
        {(["surge", "stable", "trending"] as const).map((categoryKey) => {
          const stocks = stocksByCategory[categoryKey]
          if (stocks.length === 0) return null

          const config = categories[categoryKey]

          return (
            <div key={categoryKey}>
              {/* Category Header */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mb-3">
                <span
                  className={`inline-flex items-center gap-1 px-2.5 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-semibold ${config.bgColor} ${config.color} ${config.borderColor} border w-fit`}
                >
                  <span>{config.icon}</span>
                  <span>{config.label}</span>
                </span>
                <p className="text-xs text-gray-500">{config.description}</p>
              </div>

              {/* Horizontal Scroll Container */}
              <div className="overflow-x-auto pb-2 -mx-1 px-1">
                <div className="flex gap-3 sm:gap-4" style={{ minWidth: "min-content" }}>
                  {stocks.map((stock) => (
                    <div
                      key={stock.id}
                      className={`flex-shrink-0 w-64 sm:w-72 bg-white rounded-lg p-3 sm:p-4 border-2 ${config.borderColor} ${config.bgColor} hover:shadow-md transition-shadow`}
                    >
                      {/* Stock Header */}
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
                              {stock.isRecommended && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800 whitespace-nowrap">
                                  ⭐ おすすめ
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 sm:gap-2 text-xs text-gray-500">
                              <span>{stock.stock.tickerCode}</span>
                              {stock.stock.sector && (
                                <>
                                  <span>•</span>
                                  <span className="truncate">
                                    {stock.stock.sector}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Current Price */}
                        {stock.stock.currentPrice && (
                          <div className="text-base sm:text-lg font-bold text-gray-900 mt-1.5 sm:mt-2">
                            ¥{stock.stock.currentPrice.toLocaleString()}
                          </div>
                        )}

                        {/* Score */}
                        {stock.score !== null && (
                          <div className="flex items-center gap-1 mt-1">
                            <div className="text-xs text-gray-500">スコア:</div>
                            <div className="text-xs sm:text-sm font-semibold text-gray-900">
                              {Math.round(stock.score)}/100
                            </div>
                          </div>
                        )}
                      </div>

                      {/* AI Reason */}
                      {stock.reason && (
                        <div className="mb-2 sm:mb-3">
                          <p className="text-xs text-gray-700 leading-relaxed line-clamp-3">
                            {stock.reason}
                          </p>
                        </div>
                      )}

                      {/* Add to Watchlist Button */}
                      <button
                        onClick={() => handleAddToWatchlist(stock.stockId)}
                        disabled={addingStockId === stock.stockId}
                        className={`w-full px-3 sm:px-4 py-2 rounded-lg font-semibold text-xs sm:text-sm transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed ${
                          categoryKey === "surge"
                            ? "bg-red-600 text-white hover:bg-red-700"
                            : categoryKey === "stable"
                            ? "bg-blue-600 text-white hover:bg-blue-700"
                            : "bg-purple-600 text-white hover:bg-purple-700"
                        }`}
                      >
                        {addingStockId === stock.stockId
                          ? "追加中..."
                          : "ウォッチリストに追加"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer Note */}
      <div className="mt-4 sm:mt-6 pt-3 sm:pt-4 border-t border-gray-200">
        <p className="text-xs text-gray-500 text-center">
          注目銘柄は毎日AIがニュースを分析して更新されます。投資スタイルに応じて最適な銘柄を優先的に表示しています。
        </p>
      </div>
    </div>
  )
}
