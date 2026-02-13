"use client"

import { useState, useEffect } from "react"
import AnalysisTimestamp from "./AnalysisTimestamp"
import { UPDATE_SCHEDULES } from "@/lib/constants"

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
  limitPrice: string | null
  stopLossPrice: string | null
  analyzedAt: string
  currentPrice: number | null
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
  // 損切りアラート用
  averagePurchasePrice: number | null
  stopLossRate: number | null
  // ユーザー設定に基づく価格
  targetReturnRate: number | null
  userTargetPrice: number | null
  userStopLossPrice: number | null
}

interface PurchaseRecommendationData {
  idealEntryPrice: number | null
  idealEntryPriceExpiry: string | null
  priceGap: number | null
}

export default function StockAnalysisCard({ stockId }: StockAnalysisCardProps) {
  const [prediction, setPrediction] = useState<PredictionData | null>(null)
  const [portfolioAnalysis, setPortfolioAnalysis] = useState<PortfolioAnalysisData | null>(null)
  const [purchaseRecommendation, setPurchaseRecommendation] = useState<PurchaseRecommendationData | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [noData, setNoData] = useState(false)
  const [error, setError] = useState("")

  async function fetchData() {
    setLoading(true)
    setError("")
    try {
      // 3つのAPIを並列で取得
      const [predictionRes, portfolioRes, purchaseRecRes] = await Promise.all([
        fetch(`/api/stocks/${stockId}/analysis`),
        fetch(`/api/stocks/${stockId}/portfolio-analysis`),
        fetch(`/api/stocks/${stockId}/purchase-recommendation`),
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
        // lastAnalysisがnullの場合はデータがない（生成ボタンを表示）
        if (!data.lastAnalysis) {
          setNoData(true)
        } else {
          setNoData(false)
        }
      } else if (portfolioRes.status === 404) {
        setNoData(true)
      }

      // 購入判断データ（理想の買い値）
      if (purchaseRecRes.ok) {
        const data = await purchaseRecRes.json()
        setPurchaseRecommendation({
          idealEntryPrice: data.idealEntryPrice,
          idealEntryPriceExpiry: data.idealEntryPriceExpiry,
          priceGap: data.priceGap,
        })
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

  // noDataはlastAnalysisがnullの場合にtrueになる
  // predictionがない場合は生成ボタンを表示
  if ((noData || error) && !prediction) {
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

      {/* 損切りアラート */}
      {(() => {
        const currentPrice = prediction?.currentPrice
        const avgPrice = portfolioAnalysis?.averagePurchasePrice
        // デフォルト: -10%
        const stopLossRate = portfolioAnalysis?.stopLossRate ?? -10

        if (!currentPrice || !avgPrice) return null

        const changePercent = ((currentPrice - avgPrice) / avgPrice) * 100
        const isStopLossReached = changePercent <= stopLossRate

        if (!isStopLossReached) return null

        return (
          <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <span className="text-2xl">⚠️</span>
              <div className="flex-1">
                <p className="font-bold text-red-800 mb-2">
                  損切りライン到達（{changePercent.toFixed(1)}%）
                </p>
                <div className="bg-white rounded-lg p-3 mb-3">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-600">買値</span>
                    <span className="font-semibold">{avgPrice.toLocaleString()}円</span>
                  </div>
                  <div className="flex justify-between items-center text-sm mt-1">
                    <span className="text-gray-600">現在価格</span>
                    <span className="font-semibold text-red-600">{currentPrice.toLocaleString()}円</span>
                  </div>
                  <div className="flex justify-between items-center text-sm mt-1">
                    <span className="text-gray-600">設定した損切りライン</span>
                    <span className="font-semibold">{stopLossRate}%</span>
                  </div>
                </div>
                <div className="bg-amber-50 rounded-lg p-3 text-sm">
                  <p className="font-semibold text-amber-800 mb-1">💡 損切りとは？</p>
                  <p className="text-amber-700">
                    損失を限定し、次の投資機会を守る判断です。
                    プロは「損切りルールを守る」ことで資産を守っています。
                  </p>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

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
          {/* 指値・逆指値 */}
          {(prediction.limitPrice || prediction.stopLossPrice) && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-3">
              <p className="text-sm font-semibold text-gray-800 mb-2">🎯 AI推奨価格</p>
              <div className="grid grid-cols-2 gap-3">
                {prediction.limitPrice && (
                  <div>
                    <p className="text-xs text-gray-500">
                      {prediction.recommendation === "buy" ? "買い指値" : "利確目標"}
                    </p>
                    <p className="text-base font-bold text-green-600">
                      {formatPrice(prediction.limitPrice)}円
                    </p>
                  </div>
                )}
                {prediction.stopLossPrice && (
                  <div>
                    <p className="text-xs text-gray-500">逆指値（損切り）</p>
                    <p className="text-base font-bold text-red-600">
                      {formatPrice(prediction.stopLossPrice)}円
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
          {/* ユーザー設定に基づく目標価格 */}
          {(portfolioAnalysis?.userTargetPrice || portfolioAnalysis?.userStopLossPrice) && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
              <p className="text-sm font-semibold text-gray-800 mb-2">📊 あなたの設定に基づく目標</p>
              <div className="grid grid-cols-2 gap-3">
                {portfolioAnalysis.userTargetPrice && portfolioAnalysis.targetReturnRate && (
                  <div>
                    <p className="text-xs text-gray-500">
                      利確目標（+{portfolioAnalysis.targetReturnRate}%）
                    </p>
                    <p className="text-base font-bold text-green-600">
                      {portfolioAnalysis.userTargetPrice.toLocaleString()}円
                    </p>
                  </div>
                )}
                {portfolioAnalysis.userStopLossPrice && portfolioAnalysis.stopLossRate && (
                  <div>
                    <p className="text-xs text-gray-500">
                      損切り（{portfolioAnalysis.stopLossRate}%）
                    </p>
                    <p className="text-base font-bold text-red-600">
                      {portfolioAnalysis.userStopLossPrice.toLocaleString()}円
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
          {/* 買い推奨時に理想の買い値を表示 */}
          {prediction.recommendation === "buy" && purchaseRecommendation?.idealEntryPrice && (
            <div className="bg-green-50 rounded-lg p-3 mb-3">
              <p className="text-sm text-gray-700">
                📊 理想の買い値: <strong className="text-green-700">{purchaseRecommendation.idealEntryPrice.toLocaleString()}円</strong>
                {purchaseRecommendation.idealEntryPriceExpiry && (
                  <span className="text-gray-500 ml-1">
                    （〜{new Date(purchaseRecommendation.idealEntryPriceExpiry).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })}まで）
                  </span>
                )}
              </p>
              {purchaseRecommendation.priceGap != null && (
                <p className={`text-xs mt-1 ${purchaseRecommendation.priceGap < 0 ? "text-green-600" : "text-yellow-600"}`}>
                  現在価格より{Math.abs(purchaseRecommendation.priceGap).toLocaleString()}円{purchaseRecommendation.priceGap < 0 ? "高い → 割安" : "安い → 様子見"}
                </p>
              )}
            </div>
          )}
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

      {/* 分析日時・更新スケジュール */}
      <div className="text-center space-y-1">
        {analysisDate && <AnalysisTimestamp dateString={analysisDate} />}
        <p className="text-xs text-gray-400">
          更新 {UPDATE_SCHEDULES.STOCK_ANALYSIS}（平日）
        </p>
      </div>

      <p className="text-xs text-gray-500 text-center">
        ※ 予測は参考情報です。投資判断はご自身の責任でお願いします。
      </p>
    </div>
  )
}
