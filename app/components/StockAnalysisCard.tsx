"use client"

import { useState, useEffect } from "react"

interface StockAnalysisCardProps {
  stockId: string
}

interface PredictionData {
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

interface PortfolioAnalysisData {
  shortTerm: string | null
  mediumTerm: string | null
  longTerm: string | null
  lastAnalysis: string | null
  // 新しいフィールド
  emotionalCoaching: string | null
  simpleStatus: string | null
  statusType: string | null
  suggestedSellPrice: number | null
  sellCondition: string | null
}

export default function StockAnalysisCard({ stockId }: StockAnalysisCardProps) {
  const [prediction, setPrediction] = useState<PredictionData | null>(null)
  const [portfolioAnalysis, setPortfolioAnalysis] = useState<PortfolioAnalysisData | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [noData, setNoData] = useState(false)
  const [error, setError] = useState("")

  async function fetchData() {
    setLoading(true)
    setError("")
    try {
      // 両方のAPIを並列で取得
      const [predictionRes, portfolioRes] = await Promise.all([
        fetch(`/api/stocks/${stockId}/analysis`),
        fetch(`/api/stocks/${stockId}/portfolio-analysis`),
      ])

      // 価格帯予測データ
      if (predictionRes.ok) {
        const data = await predictionRes.json()
        setPrediction(data)
      }

      // テキスト分析データ
      if (portfolioRes.ok) {
        const data = await portfolioRes.json()
        setPortfolioAnalysis(data)
        setNoData(false)
      } else if (portfolioRes.status === 404) {
        setNoData(true)
      }

      // 両方とも取得できなかった場合
      if (!predictionRes.ok && !portfolioRes.ok) {
        setNoData(true)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました")
    } finally {
      setLoading(false)
    }
  }

  async function generateAnalysis() {
    setGenerating(true)
    setError("")
    try {
      const response = await fetch(`/api/stocks/${stockId}/portfolio-analysis`, {
        method: "POST",
      })

      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData.error || "分析の生成に失敗しました")
      }

      const result = await response.json()
      setPortfolioAnalysis(result)
      setNoData(false)
    } catch (err) {
      console.error("Error generating portfolio analysis:", err)
      setError(err instanceof Error ? err.message : "分析の生成に失敗しました")
    } finally {
      setGenerating(false)
    }
  }

  useEffect(() => {
    fetchData()
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

  const formatPrice = (price: string) => {
    return parseFloat(price).toLocaleString("ja-JP", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
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

  if ((noData || error) && !prediction && !portfolioAnalysis) {
    return (
      <div className="bg-gray-50 rounded-lg p-6 text-center">
        <div className="text-4xl mb-3">📊</div>
        <p className="text-sm text-gray-600 mb-4">
          {error || "売買分析はまだ生成されていません"}
        </p>
        <button
          onClick={generateAnalysis}
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
    )
  }

  // 分析日時（より新しい方を表示）
  const analysisDate = prediction?.analyzedAt || portfolioAnalysis?.lastAnalysis

  return (
    <div className="space-y-4">
      {/* 短期予測 */}
      <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-lg shadow-md p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xl">
            {prediction ? getTrendIcon(prediction.shortTerm.trend) : "📈"}
          </span>
          <div className="flex-1">
            <h4 className="text-sm font-bold text-purple-800">短期予測（今週）</h4>
            {prediction && (
              <p className="text-xs text-purple-600">
                {getTrendText(prediction.shortTerm.trend)} ¥{formatPrice(prediction.shortTerm.priceLow)}〜¥{formatPrice(prediction.shortTerm.priceHigh)}
              </p>
            )}
          </div>
        </div>
        {portfolioAnalysis?.shortTerm && (
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{portfolioAnalysis.shortTerm}</p>
        )}
        {!portfolioAnalysis?.shortTerm && !prediction && (
          <p className="text-sm text-gray-500">データがありません</p>
        )}
      </div>

      {/* 中期予測 */}
      <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg shadow-md p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xl">
            {prediction ? getTrendIcon(prediction.midTerm.trend) : "📊"}
          </span>
          <div className="flex-1">
            <h4 className="text-sm font-bold text-blue-800">中期予測（今月）</h4>
            {prediction && (
              <p className="text-xs text-blue-600">
                {getTrendText(prediction.midTerm.trend)} ¥{formatPrice(prediction.midTerm.priceLow)}〜¥{formatPrice(prediction.midTerm.priceHigh)}
              </p>
            )}
          </div>
        </div>
        {portfolioAnalysis?.mediumTerm && (
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{portfolioAnalysis.mediumTerm}</p>
        )}
        {!portfolioAnalysis?.mediumTerm && !prediction && (
          <p className="text-sm text-gray-500">データがありません</p>
        )}
      </div>

      {/* 長期予測 */}
      <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-lg shadow-md p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xl">
            {prediction ? getTrendIcon(prediction.longTerm.trend) : "🎯"}
          </span>
          <div className="flex-1">
            <h4 className="text-sm font-bold text-emerald-800">長期予測（今後3ヶ月）</h4>
            {prediction && (
              <p className="text-xs text-emerald-600">
                {getTrendText(prediction.longTerm.trend)} ¥{formatPrice(prediction.longTerm.priceLow)}〜¥{formatPrice(prediction.longTerm.priceHigh)}
              </p>
            )}
          </div>
        </div>
        {portfolioAnalysis?.longTerm && (
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{portfolioAnalysis.longTerm}</p>
        )}
        {!portfolioAnalysis?.longTerm && !prediction && (
          <p className="text-sm text-gray-500">データがありません</p>
        )}
      </div>

      {/* AIアドバイス */}
      {prediction && (
        <div className="bg-white rounded-lg shadow-md p-4 border-l-4 border-blue-500">
          <div className="flex justify-between items-start mb-2">
            <p className="font-semibold text-gray-800">💡 AIアドバイス</p>
            {getRecommendationBadge(prediction.recommendation)}
          </div>
          <p className="text-sm text-gray-700 leading-relaxed mb-3">
            {prediction.advice}
          </p>
          <div className="flex items-center gap-2">
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
      )}

      {/* 分析日時 */}
      {analysisDate && (
        <p className="text-xs text-gray-500 text-center">
          分析日時: {new Date(analysisDate).toLocaleDateString("ja-JP", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      )}

      <p className="text-xs text-gray-500 text-center">
        ※ 予測は参考情報です。投資判断はご自身の責任でお願いします。
      </p>
    </div>
  )
}
