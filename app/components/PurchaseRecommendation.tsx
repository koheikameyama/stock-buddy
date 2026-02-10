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
  const [generating, setGenerating] = useState(false)
  const [noData, setNoData] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function fetchRecommendation() {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/stocks/${stockId}/purchase-recommendation`)

      if (response.status === 404) {
        setNoData(true)
        return
      }

      if (!response.ok) {
        throw new Error("購入判断の取得に失敗しました")
      }

      const result = await response.json()
      setData(result)
      setNoData(false)
    } catch (err) {
      console.error("Error fetching purchase recommendation:", err)
      setError("購入判断の取得に失敗しました")
    } finally {
      setLoading(false)
    }
  }

  async function generateRecommendation() {
    setGenerating(true)
    setError(null)
    try {
      const response = await fetch(`/api/stocks/${stockId}/purchase-recommendation`, {
        method: "POST",
      })

      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData.error || "分析に失敗しました")
      }

      const result = await response.json()
      setData(result)
      setNoData(false)
    } catch (err) {
      console.error("Error generating purchase recommendation:", err)
      setError(err instanceof Error ? err.message : "分析に失敗しました")
    } finally {
      setGenerating(false)
    }
  }

  useEffect(() => {
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

  if (noData && !data) {
    return (
      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="bg-gray-50 rounded-lg p-6 text-center">
          <div className="text-4xl mb-3">📊</div>
          <p className="text-sm text-gray-600 mb-4">
            購入判断はまだ生成されていません
          </p>
          <button
            onClick={generateRecommendation}
            disabled={generating}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed transition-colors"
          >
            {generating ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                分析中...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                今すぐ分析する
              </>
            )}
          </button>
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
