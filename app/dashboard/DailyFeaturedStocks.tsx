"use client"

import { useState, useEffect } from "react"

interface FeaturedStock {
  id: string
  position: number
  reason: string
  score: number
  stock: {
    id: string
    tickerCode: string
    name: string
    sector: string | null
    currentPrice: number | null
  }
}

interface DailyFeaturedStocksProps {
  userId: string
}

export default function DailyFeaturedStocks({ userId }: DailyFeaturedStocksProps) {
  const [featuredStocks, setFeaturedStocks] = useState<FeaturedStock[]>([])
  const [loading, setLoading] = useState(true)
  const [addingStockId, setAddingStockId] = useState<string | null>(null)

  useEffect(() => {
    fetchFeaturedStocks()
  }, [])

  const fetchFeaturedStocks = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/featured-stocks")
      const data = await response.json()

      if (data.needsGeneration) {
        // 注目銘柄がない場合は生成
        await generateFeaturedStocks()
      } else {
        setFeaturedStocks(data.featuredStocks || [])
      }
    } catch (error) {
      console.error("Error fetching featured stocks:", error)
    } finally {
      setLoading(false)
    }
  }

  const generateFeaturedStocks = async () => {
    try {
      const response = await fetch("/api/featured-stocks/generate", {
        method: "POST",
      })
      const data = await response.json()
      setFeaturedStocks(data.featuredStocks || [])
    } catch (error) {
      console.error("Error generating featured stocks:", error)
    }
  }

  const addToWatchlist = async (stockId: string) => {
    try {
      setAddingStockId(stockId)

      const stock = featuredStocks.find((fs) => fs.stock.id === stockId)?.stock
      if (!stock || !stock.currentPrice) {
        alert("株価情報が取得できませんでした")
        return
      }

      const response = await fetch("/api/onboarding/add-to-watchlist", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId,
          stockId,
          recommendedPrice: stock.currentPrice,
          recommendedQty: Math.floor(100000 / stock.currentPrice / 100) * 100, // 10万円分の株数
          reason: "今日の注目銘柄から追加",
          source: "featured",
        }),
      })

      const data = await response.json()

      if (response.ok) {
        alert(data.message || "気になる銘柄に追加しました")
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

  if (loading) {
    return (
      <div className="bg-white rounded-xl p-6 shadow-md">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-2xl">⭐</span>
          <h3 className="text-lg font-bold text-gray-900">今日の注目銘柄</h3>
        </div>
        <p className="text-sm text-gray-500">読み込み中...</p>
      </div>
    )
  }

  if (featuredStocks.length === 0) {
    return null
  }

  return (
    <div className="bg-gradient-to-br from-yellow-50 to-orange-50 rounded-xl p-6 shadow-md border border-yellow-200">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">⭐</span>
        <h3 className="text-lg font-bold text-gray-900">今日の注目銘柄</h3>
      </div>
      <p className="text-sm text-gray-600 mb-4">
        初心者の方におすすめの銘柄を毎日ご紹介します
      </p>

      <div className="space-y-3">
        {featuredStocks.map((featured) => (
          <div
            key={featured.id}
            className="bg-white rounded-lg p-4 shadow-sm border border-gray-200 hover:border-yellow-400 transition-colors"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold text-yellow-600 bg-yellow-100 px-2 py-0.5 rounded">
                    #{featured.position}
                  </span>
                  <h4 className="text-base font-bold text-gray-900 truncate">
                    {featured.stock.name}
                  </h4>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
                  <span>{featured.stock.tickerCode}</span>
                  {featured.stock.sector && (
                    <>
                      <span>•</span>
                      <span>{featured.stock.sector}</span>
                    </>
                  )}
                </div>
                {featured.stock.currentPrice && (
                  <p className="text-lg font-bold text-gray-900 mb-2">
                    ¥{featured.stock.currentPrice.toLocaleString()}
                  </p>
                )}
                <p className="text-xs text-gray-600">{featured.reason}</p>
              </div>
            </div>
            <button
              onClick={() => addToWatchlist(featured.stock.id)}
              disabled={addingStockId === featured.stock.id}
              className="w-full mt-3 px-4 py-2 bg-yellow-500 text-white rounded-lg font-semibold hover:bg-yellow-600 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed text-sm"
            >
              {addingStockId === featured.stock.id
                ? "追加中..."
                : "気になる銘柄に追加"}
            </button>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-4 border-t border-yellow-200">
        <p className="text-xs text-gray-500 text-center">
          注目銘柄は毎日更新されます
        </p>
      </div>
    </div>
  )
}
