"use client"

import { useState, useEffect } from "react"

interface StockPredictionProps {
  stockId: string
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

export default function StockPrediction({ stockId }: StockPredictionProps) {
  const [prediction, setPrediction] = useState<PredictionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    const fetchPrediction = async () => {
      try {
        const response = await fetch(`/api/stocks/${stockId}/analysis`)

        if (!response.ok) {
          if (response.status === 404) {
            setError("予測データがまだありません")
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
  }, [stockId])

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

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-2/3"></div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <p className="text-gray-500 text-center">{error}</p>
      </div>
    )
  }

  if (!prediction) {
    return null
  }

  const formatPrice = (price: string) => {
    return parseFloat(price).toLocaleString("ja-JP", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })
  }

  return (
    <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-lg shadow-md p-6 space-y-4">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            🔮 今後の予測
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            {new Date(prediction.analyzedAt).toLocaleDateString("ja-JP")} 分析
          </p>
        </div>
        {getRecommendationBadge(prediction.recommendation)}
      </div>

      <div className="space-y-3">
        {/* 短期予測 */}
        <div className="bg-white rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">
              {getTrendIcon(prediction.shortTerm.trend)}
            </span>
            <div>
              <p className="font-semibold text-gray-800">短期（1週間）</p>
              <p className="text-sm text-gray-600">
                {getTrendText(prediction.shortTerm.trend)}
              </p>
            </div>
          </div>
          <p className="text-sm text-gray-700">
            予想 {formatPrice(prediction.shortTerm.priceLow)}円〜
            {formatPrice(prediction.shortTerm.priceHigh)}円
          </p>
        </div>

        {/* 中期予測 */}
        <div className="bg-white rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">
              {getTrendIcon(prediction.midTerm.trend)}
            </span>
            <div>
              <p className="font-semibold text-gray-800">中期（1ヶ月）</p>
              <p className="text-sm text-gray-600">
                {getTrendText(prediction.midTerm.trend)}
              </p>
            </div>
          </div>
          <p className="text-sm text-gray-700">
            予想 {formatPrice(prediction.midTerm.priceLow)}円〜
            {formatPrice(prediction.midTerm.priceHigh)}円
          </p>
        </div>

        {/* 長期予測 */}
        <div className="bg-white rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">
              {getTrendIcon(prediction.longTerm.trend)}
            </span>
            <div>
              <p className="font-semibold text-gray-800">長期（3ヶ月）</p>
              <p className="text-sm text-gray-600">
                {getTrendText(prediction.longTerm.trend)}
              </p>
            </div>
          </div>
          <p className="text-sm text-gray-700">
            予想 {formatPrice(prediction.longTerm.priceLow)}円〜
            {formatPrice(prediction.longTerm.priceHigh)}円
          </p>
        </div>
      </div>

      {/* AIアドバイス */}
      <div className="bg-white rounded-lg p-4 border-l-4 border-blue-500">
        <p className="font-semibold text-gray-800 mb-2">💡 AIアドバイス</p>
        <p className="text-sm text-gray-700 leading-relaxed">
          {prediction.advice}
        </p>
        <div className="mt-3 flex items-center gap-2">
          <div className="flex-1 bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all"
              style={{ width: `${prediction.confidence * 100}%` }}
            ></div>
          </div>
          <span className="text-xs text-gray-600">
            信頼度 {Math.round(prediction.confidence * 100)}%
          </span>
        </div>
      </div>

      <p className="text-xs text-gray-500 text-center">
        ※ 予測は参考情報です。投資判断はご自身の責任でお願いします。
      </p>
    </div>
  )
}
