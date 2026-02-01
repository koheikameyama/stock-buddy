"use client"

import { useEffect, useState } from "react"

interface StockPredictionModalProps {
  isOpen: boolean
  onClose: () => void
  stockId: string
  stockName: string
}

interface PredictionData {
  stockId: string
  stockName: string
  tickerCode: string
  currentPrice: string
  shortTerm: {
    trend: string
    priceLow: string
    priceHigh: string
  }
  midTerm: {
    trend: string
    priceLow: string
    priceHigh: string
  }
  longTerm: {
    trend: string
    priceLow: string
    priceHigh: string
  }
  recommendation: string
  advice: string
  confidence: number
  analyzedAt: string
}

export default function StockPredictionModal({
  isOpen,
  onClose,
  stockId,
  stockName,
}: StockPredictionModalProps) {
  const [prediction, setPrediction] = useState<PredictionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!isOpen) return

    const fetchPrediction = async () => {
      setLoading(true)
      setError("")

      try {
        const response = await fetch(`/api/stocks/${stockId}/analysis`)

        if (!response.ok) {
          if (response.status === 404) {
            setError("予測データがまだありません。明日の朝7時頃に更新されます。")
          } else {
            throw new Error("予測データの取得に失敗しました")
          }
          return
        }

        const data = await response.json()
        setPrediction(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : "エラーが発生しました")
      } finally {
        setLoading(false)
      }
    }

    fetchPrediction()
  }, [isOpen, stockId])

  if (!isOpen) return null

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case "up":
        return "📈"
      case "down":
        return "📉"
      case "neutral":
        return "📊"
      default:
        return "📊"
    }
  }

  const getTrendText = (trend: string) => {
    switch (trend) {
      case "up":
        return "上昇傾向"
      case "down":
        return "下降傾向"
      case "neutral":
        return "横ばい"
      default:
        return "不明"
    }
  }

  const getRecommendationBadge = (recommendation: string) => {
    switch (recommendation) {
      case "buy":
        return (
          <span className="inline-block px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-semibold">
            買い推奨
          </span>
        )
      case "sell":
        return (
          <span className="inline-block px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-semibold">
            売却検討
          </span>
        )
      case "hold":
        return (
          <span className="inline-block px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-semibold">
            保有継続
          </span>
        )
      default:
        return null
    }
  }

  const formatPrice = (price: string) => {
    return parseFloat(price).toLocaleString("ja-JP", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-800">
            🔮 {stockName} の予測
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="p-6">
          {loading && (
            <div className="animate-pulse space-y-4">
              <div className="h-6 bg-gray-200 rounded w-1/3"></div>
              <div className="h-4 bg-gray-200 rounded w-full"></div>
              <div className="h-4 bg-gray-200 rounded w-full"></div>
              <div className="h-4 bg-gray-200 rounded w-2/3"></div>
            </div>
          )}

          {error && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-gray-700 text-center">{error}</p>
            </div>
          )}

          {!loading && !error && prediction && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-xs text-gray-500">
                    {new Date(prediction.analyzedAt).toLocaleDateString(
                      "ja-JP"
                    )}{" "}
                    分析
                  </p>
                </div>
                {getRecommendationBadge(prediction.recommendation)}
              </div>

              {/* 短期予測 */}
              <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-2xl">
                    {getTrendIcon(prediction.shortTerm.trend)}
                  </span>
                  <div>
                    <p className="font-bold text-gray-900 text-lg">
                      短期（1週間）
                    </p>
                    <p className="text-sm text-gray-600">
                      {getTrendText(prediction.shortTerm.trend)}
                    </p>
                  </div>
                </div>
                <p className="text-lg text-gray-800 font-semibold">
                  予想 {formatPrice(prediction.shortTerm.priceLow)}円 〜{" "}
                  {formatPrice(prediction.shortTerm.priceHigh)}円
                </p>
              </div>

              {/* 中期予測 */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-2xl">
                    {getTrendIcon(prediction.midTerm.trend)}
                  </span>
                  <div>
                    <p className="font-bold text-gray-900 text-lg">
                      中期（1ヶ月）
                    </p>
                    <p className="text-sm text-gray-600">
                      {getTrendText(prediction.midTerm.trend)}
                    </p>
                  </div>
                </div>
                <p className="text-lg text-gray-800 font-semibold">
                  予想 {formatPrice(prediction.midTerm.priceLow)}円 〜{" "}
                  {formatPrice(prediction.midTerm.priceHigh)}円
                </p>
              </div>

              {/* 長期予測 */}
              <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-2xl">
                    {getTrendIcon(prediction.longTerm.trend)}
                  </span>
                  <div>
                    <p className="font-bold text-gray-900 text-lg">
                      長期（3ヶ月）
                    </p>
                    <p className="text-sm text-gray-600">
                      {getTrendText(prediction.longTerm.trend)}
                    </p>
                  </div>
                </div>
                <p className="text-lg text-gray-800 font-semibold">
                  予想 {formatPrice(prediction.longTerm.priceLow)}円 〜{" "}
                  {formatPrice(prediction.longTerm.priceHigh)}円
                </p>
              </div>

              {/* AIアドバイス */}
              <div className="bg-white border-2 border-blue-200 rounded-lg p-5">
                <p className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <span>💡</span> AIアドバイス
                </p>
                <p className="text-gray-700 leading-relaxed mb-4">
                  {prediction.advice}
                </p>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-600 flex-shrink-0">
                    信頼度
                  </span>
                  <div className="flex-1 bg-gray-200 rounded-full h-3">
                    <div
                      className="bg-blue-500 h-3 rounded-full transition-all"
                      style={{ width: `${prediction.confidence * 100}%` }}
                    ></div>
                  </div>
                  <span className="text-sm font-semibold text-gray-700 flex-shrink-0">
                    {Math.round(prediction.confidence * 100)}%
                  </span>
                </div>
              </div>

              <p className="text-xs text-gray-500 text-center pt-4 border-t">
                ※
                予測は参考情報です。投資判断はご自身の責任でお願いします。
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
