"use client"

import { useState, useEffect } from "react"
import AddStockDialog from "../my-stocks/AddStockDialog"

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
  const [date, setDate] = useState<string | null>(null)
  const [isToday, setIsToday] = useState(true)
  // ウォッチリスト追加ダイアログ
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [selectedFeaturedStock, setSelectedFeaturedStock] = useState<FeaturedStock | null>(null)

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
        setIsToday(data.isToday ?? true)
      } else {
        console.error("Error fetching featured stocks:", data.error)
      }
    } catch (error) {
      console.error("Error fetching featured stocks:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleAddToWatchlist = (stock: FeaturedStock) => {
    setSelectedFeaturedStock(stock)
    setShowAddDialog(true)
  }

  const handleAddDialogSuccess = () => {
    setShowAddDialog(false)
    setSelectedFeaturedStock(null)
    // リストを再取得して登録済み状態を更新
    fetchFeaturedStocks()
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

          {stock.category && categoryBadges[stock.category] && (
            <div className="mt-1">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${categoryBadges[stock.category].className}`}>
                {categoryBadges[stock.category].label}
              </span>
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
          disabled={stock.isRegistered}
          className={`w-full px-3 sm:px-4 py-2 rounded-lg font-semibold text-xs sm:text-sm transition-colors disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed ${stock.isRegistered ? "" : theme.button}`}
        >
          {stock.isRegistered ? "登録済み" : "ウォッチリストに追加"}
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

      {/* 当日データでない場合は生成ボタンを表示 */}
      {!isToday && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
          <p className="text-sm text-amber-800 mb-3">
            これは昨日のデータです。最新のおすすめを生成しますか？
          </p>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="px-4 py-2 bg-amber-600 text-white rounded-lg font-semibold text-sm hover:bg-amber-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {generating ? "生成中..." : "今日のおすすめを生成"}
          </button>
        </div>
      )}

      {/* Footer Note */}
      <div className="pt-2">
        <p className="text-xs text-gray-500 text-center">
          注目銘柄は毎日AIが分析して更新されます
        </p>
      </div>

      {/* ウォッチリスト追加ダイアログ */}
      <AddStockDialog
        isOpen={showAddDialog}
        onClose={() => {
          setShowAddDialog(false)
          setSelectedFeaturedStock(null)
        }}
        onSuccess={handleAddDialogSuccess}
        defaultType="watchlist"
        initialStock={
          selectedFeaturedStock
            ? {
                id: selectedFeaturedStock.stock.id,
                tickerCode: selectedFeaturedStock.stock.tickerCode,
                name: selectedFeaturedStock.stock.name,
                market: "",
                sector: selectedFeaturedStock.stock.sector,
                latestPrice: selectedFeaturedStock.stock.currentPrice,
              }
            : null
        }
        initialNote={selectedFeaturedStock?.reason || undefined}
      />
    </div>
  )
}
