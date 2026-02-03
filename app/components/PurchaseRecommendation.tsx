"use client"

import { useEffect, useState } from "react"

interface PurchaseRecommendationProps {
  stockId: string
}

interface RecommendationData {
  stockId: string
  stockName: string
  tickerCode: string
  currentPrice: number | null
  recommendation: "buy" | "hold" | "pass"
  confidence: number
  reason: string
  recommendedQuantity?: number | null
  recommendedPrice?: number | null
  estimatedAmount?: number | null
  caution: string
  analyzedAt: string
}

export default function PurchaseRecommendation({ stockId }: PurchaseRecommendationProps) {
  const [data, setData] = useState<RecommendationData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchRecommendation() {
      try {
        const response = await fetch(`/api/stocks/${stockId}/purchase-recommendation`)

        if (response.status === 404) {
          setError("購入判断はまだ生成されていません。明日以降に表示されます。")
          return
        }

        if (!response.ok) {
          throw new Error("購入判断の取得に失敗しました")
        }

        const result = await response.json()
        setData(result)
      } catch (err) {
        console.error("Error fetching purchase recommendation:", err)
        setError("購入判断の取得に失敗しました")
      } finally {
        setLoading(false)
      }
    }

    fetchRecommendation()
  }, [stockId])

  if (loading) {
    return (
      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="flex items-center justify-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="ml-3 text-sm text-gray-600">読み込み中...</p>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="bg-gray-50 rounded-lg p-6 text-center">
          <div className="text-4xl mb-3">📊</div>
          <p className="text-sm text-gray-600">{error || "データがありません"}</p>
        </div>
      </div>
    )
  }

  // 信頼度パーセンテージ
  const confidencePercent = Math.round(data.confidence * 100)

  // 買い推奨
  if (data.recommendation === "buy") {
    return (
      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg shadow-md p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-2xl">💡</span>
            <h3 className="text-base sm:text-lg font-bold text-green-800">今が買い時です！</h3>
          </div>

          <p className="text-sm text-gray-700 mb-4">{data.reason}</p>

          {data.recommendedQuantity && data.recommendedPrice && data.estimatedAmount && (
            <div className="bg-white rounded-lg p-3 sm:p-4 mb-4">
              <p className="text-xs text-gray-600 mb-2">📊 おすすめの買い方</p>
              <ul className="text-xs sm:text-sm text-gray-800 space-y-1">
                <li>• 購入数量: {data.recommendedQuantity}株</li>
                <li>• 目安価格: {data.recommendedPrice.toLocaleString()}円以下</li>
                <li>• 必要金額: 約{data.estimatedAmount.toLocaleString()}円</li>
              </ul>
            </div>
          )}

          <div className="bg-amber-50 border-l-4 border-amber-400 p-3 mb-4">
            <p className="text-xs text-amber-800">⚠️ {data.caution}</p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex-1 bg-gray-200 rounded-full h-2">
              <div
                className="bg-green-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${confidencePercent}%` }}
              />
            </div>
            <span className="text-xs text-gray-600 whitespace-nowrap">信頼度 {confidencePercent}%</span>
          </div>
        </div>
      </div>
    )
  }

  // 様子見
  if (data.recommendation === "hold") {
    return (
      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="bg-gradient-to-br from-blue-50 to-sky-50 rounded-lg shadow-md p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-2xl">⏳</span>
            <h3 className="text-base sm:text-lg font-bold text-blue-800">もう少し様子を見ましょう</h3>
          </div>

          <p className="text-sm text-gray-700 mb-4">{data.reason}</p>

          <div className="bg-blue-50 border-l-4 border-blue-400 p-3 mb-4">
            <p className="text-xs text-blue-800">💡 今は焦らず、タイミングを待ちましょう</p>
          </div>

          <div className="bg-amber-50 border-l-4 border-amber-400 p-3 mb-4">
            <p className="text-xs text-amber-800">⚠️ {data.caution}</p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex-1 bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${confidencePercent}%` }}
              />
            </div>
            <span className="text-xs text-gray-600 whitespace-nowrap">信頼度 {confidencePercent}%</span>
          </div>
        </div>
      </div>
    )
  }

  // 見送り
  return (
    <div className="mt-4 pt-4 border-t border-gray-200">
      <div className="bg-gradient-to-br from-gray-50 to-slate-50 rounded-lg shadow-md p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-2xl">🚫</span>
          <h3 className="text-base sm:text-lg font-bold text-gray-800">今は見送りがおすすめです</h3>
        </div>

        <p className="text-sm text-gray-700 mb-4">{data.reason}</p>

        <div className="bg-gray-100 border-l-4 border-gray-400 p-3 mb-4">
          <p className="text-xs text-gray-700">💡 他の銘柄を検討してみましょう</p>
        </div>

        <div className="bg-amber-50 border-l-4 border-amber-400 p-3 mb-4">
          <p className="text-xs text-amber-800">⚠️ {data.caution}</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex-1 bg-gray-200 rounded-full h-2">
            <div
              className="bg-gray-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${confidencePercent}%` }}
            />
          </div>
          <span className="text-xs text-gray-600 whitespace-nowrap">信頼度 {confidencePercent}%</span>
        </div>
      </div>
    </div>
  )
}
