"use client"

import { useState, useEffect } from "react"
import AnalysisTimestamp from "./AnalysisTimestamp"
import { UPDATE_SCHEDULES, PORTFOLIO_STATUS_CONFIG } from "@/lib/constants"

interface StockAnalysisCardProps {
  stockId: string
  quantity?: number // 保有数量（売却提案で使用）
  // 買いアラート関連（ウォッチリスト用）
  onBuyAlertClick?: (limitPrice: number | null) => void
  currentTargetBuyPrice?: number | null
  embedded?: boolean
}

interface PredictionData {
  shortTerm: {
    trend: string
    priceLow: string
    priceHigh: string
    text?: string | null
  }
  midTerm: {
    trend: string
    priceLow: string
    priceHigh: string
    text?: string | null
  }
  longTerm: {
    trend: string
    priceLow: string
    priceHigh: string
    text?: string | null
  }
  recommendation: string
  advice: string
  confidence: number
  limitPrice: string | null
  stopLossPrice: string | null
  analyzedAt: string
  currentPrice: number | null
  simpleStatus?: string | null
  statusType?: string | null
  sellCondition?: string | null
}

interface PortfolioAnalysisData {
  lastAnalysis: string | null
  simpleStatus: string | null
  statusType: string | null
  marketSignal: string | null
  suggestedSellPrice: number | null
  suggestedSellPercent: number | null
  sellReason: string | null
  sellCondition: string | null
  recommendation: string | null
  // 損切りアラート用
  averagePurchasePrice: number | null
  stopLossRate: number | null
  // ユーザー設定に基づく価格
  targetReturnRate: number | null
  userTargetPrice: number | null
  userStopLossPrice: number | null
}

export default function StockAnalysisCard({ stockId, quantity, onBuyAlertClick, currentTargetBuyPrice, embedded = false }: StockAnalysisCardProps) {
  const [prediction, setPrediction] = useState<PredictionData | null>(null)
  const [portfolioAnalysis, setPortfolioAnalysis] = useState<PortfolioAnalysisData | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [noData, setNoData] = useState(false)
  const [error, setError] = useState("")

  // ポーリングロジック（共通化）
  async function pollJob(jobId: string): Promise<void> {
    const pollInterval = 1500 // 1.5秒間隔
    const maxAttempts = 40 // 最大60秒
    let attempts = 0

    const poll = async (): Promise<void> => {
      attempts++
      const statusResponse = await fetch(`/api/analysis-jobs/${jobId}`)
      if (!statusResponse.ok) {
        throw new Error("ジョブの状態取得に失敗しました")
      }

      const job = await statusResponse.json()

      if (job.status === "completed") {
        setPortfolioAnalysis(job.result)
        setNoData(false)
        setGenerating(false)
        return
      }

      if (job.status === "failed") {
        throw new Error(job.error || "分析の生成に失敗しました")
      }

      if (attempts >= maxAttempts) {
        throw new Error("分析がタイムアウトしました。しばらく待ってから再度お試しください。")
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval))
      return poll()
    }

    await poll()
  }

  async function fetchData() {
    setLoading(true)
    setError("")
    try {
      // 処理中のジョブがあるかチェック
      const pendingJobRes = await fetch(`/api/analysis-jobs?type=portfolio-analysis&targetId=${stockId}`)
      if (pendingJobRes.ok) {
        const { job: pendingJob } = await pendingJobRes.json()
        if (pendingJob) {
          // 処理中のジョブがある場合、ポーリングを再開
          setGenerating(true)
          setLoading(false)
          try {
            await pollJob(pendingJob.jobId)
          } catch (err) {
            console.error("Error polling job:", err)
            setError(err instanceof Error ? err.message : "分析の取得に失敗しました")
            setGenerating(false)
          }
          return
        }
      }

      // 2つのAPIを並列で取得
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
        // lastAnalysisがnullの場合はデータがない（生成ボタンを表示）
        if (!data.lastAnalysis) {
          setNoData(true)
        } else {
          setNoData(false)
        }
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
      // ポートフォリオ用かウォッチリスト用かで分岐
      const analysisType = quantity ? "portfolio-analysis" : "purchase-recommendation"

      // ジョブを作成
      const createResponse = await fetch("/api/analysis-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: analysisType,
          targetId: stockId,
        }),
      })

      if (!createResponse.ok) {
        const errData = await createResponse.json()
        throw new Error(errData.error || "分析の開始に失敗しました")
      }

      const { jobId } = await createResponse.json()

      // ポーリングで結果を取得
      await pollJob(jobId)
    } catch (err) {
      console.error("Error generating analysis:", err)
      setError(err instanceof Error ? err.message : "分析の生成に失敗しました")
      setGenerating(false)
    }
  }

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const getStatusBadge = (statusType: string | null | undefined) => {
    if (!statusType) return null
    const config = PORTFOLIO_STATUS_CONFIG[statusType]
    if (!config) return null

    return (
      <span className={`inline-block px-3 py-1 ${config.bg} ${config.color} rounded-full text-sm font-semibold`}>
        {config.text}
      </span>
    )
  }

  const getMarketSignalBadge = (signal: string | null | undefined) => {
    if (!signal) return null

    const signalMap: Record<string, { text: string; bgColor: string; textColor: string; icon: string }> = {
      bullish: { text: "上昇優勢", bgColor: "bg-green-100", textColor: "text-green-700", icon: "↑" },
      neutral: { text: "横ばい", bgColor: "bg-gray-100", textColor: "text-gray-600", icon: "→" },
      bearish: { text: "下落優勢", bgColor: "bg-red-100", textColor: "text-red-700", icon: "↓" },
    }

    const badge = signalMap[signal]
    if (!badge) return null

    return (
      <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 ${badge.bgColor} ${badge.textColor} rounded-full text-xs font-medium`}>
        <span>{badge.icon}</span>
        <span>{badge.text}</span>
      </span>
    )
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

  // 分析中の場合
  if (generating) {
    return (
      <div className="bg-gray-50 rounded-lg p-6 text-center">
        <div className="text-4xl mb-3">📊</div>
        <p className="text-sm text-gray-600 mb-4">AIが分析中です...</p>
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-400 text-white text-sm font-medium rounded-lg cursor-not-allowed">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
          分析中...
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
          {error || "分析データはまだ生成されていません"}
        </p>
        <button
          onClick={generateAnalysis}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          今すぐ分析する
        </button>
      </div>
    )
  }

  // 分析日時（より新しい方を表示）
  const analysisDate = prediction?.analyzedAt || portfolioAnalysis?.lastAnalysis

  return (
    <div className="space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center justify-between -mt-2 mb-2">
        <h3 className="text-base font-bold text-gray-800">
          {quantity ? "AI売買判断" : "AI価格予測"}
        </h3>
        <button
          onClick={generateAnalysis}
          disabled={generating}
          className="text-sm text-blue-600 hover:text-blue-800 disabled:text-gray-400 disabled:cursor-not-allowed flex items-center gap-1"
        >
          {generating ? (
            <>
              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600"></div>
              分析中...
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              再分析する
            </>
          )}
        </button>
      </div>

      {/* 損切りアラート（ユーザーが損切りラインを設定している場合のみ表示） */}
      {(() => {
        const currentPrice = prediction?.currentPrice
        const avgPrice = portfolioAnalysis?.averagePurchasePrice
        const stopLossRate = portfolioAnalysis?.stopLossRate

        // 損切りラインが未設定の場合は表示しない
        if (!currentPrice || !avgPrice || stopLossRate === null || stopLossRate === undefined) return null

        const changePercent = ((currentPrice - avgPrice) / avgPrice) * 100
        const isStopLossReached = changePercent <= stopLossRate

        if (!isStopLossReached) return null

        return (
          <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-2xl">⚠️</span>
              <p className="font-bold text-red-800">
                損切りライン到達（{changePercent.toFixed(1)}%）
              </p>
            </div>
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
        )
      })()}

      {/* AIアドバイス */}
      {prediction && (
        <div className="bg-white rounded-lg shadow-md p-4 border-l-4 border-blue-500">
          <div className="mb-2">
            <p className="font-semibold text-gray-800 mb-1.5">💡 AIアドバイス</p>
            <div className="flex items-center gap-2">
              {getStatusBadge(prediction?.statusType || portfolioAnalysis?.statusType)}
              {getMarketSignalBadge(portfolioAnalysis?.marketSignal)}
            </div>
          </div>
          <p className="text-sm text-gray-700 leading-relaxed mb-3">
            {prediction.advice}
          </p>
          {/* 指値・逆指値（推奨に応じて表示を切り替え） */}
          {(() => {
            // sell推奨時は「AI推奨価格」セクションを非表示（「売却検討」セクションに統合）
            if (prediction.recommendation === "sell") return null

            // buy → 指値 + 逆指値、hold → 利確目標 + 逆指値
            const showLimitPrice = prediction.recommendation === "buy" || prediction.recommendation === "hold"
            const showStopLossPrice = true // buy/holdで逆指値を表示
            const hasPrice = (showLimitPrice && prediction.limitPrice) || (showStopLossPrice && prediction.stopLossPrice)

            if (!hasPrice) return null

            return (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-3">
                <p className="text-sm font-semibold text-gray-800 mb-2">🎯 AI推奨価格</p>
                <div className="grid grid-cols-2 gap-3">
                  {showLimitPrice && prediction.limitPrice && (
                    <div>
                      {(() => {
                        const limitPriceNum = parseFloat(prediction.limitPrice)
                        const currentPrice = prediction.currentPrice
                        const isBuy = prediction.recommendation === "buy"

                        if (isBuy) {
                          // buy推奨時: 現在価格と比較
                          const isNowBuyTime = currentPrice && Math.abs(limitPriceNum - currentPrice) / currentPrice < 0.01 // 1%以内なら「今が買い時」
                          const priceDiff = currentPrice ? limitPriceNum - currentPrice : 0
                          const priceDiffPercent = currentPrice ? ((priceDiff / currentPrice) * 100).toFixed(1) : "0"
                          return (
                            <>
                              <p className="text-xs text-gray-500">
                                {isNowBuyTime ? "今が買い時" : "指値（買い）"}
                              </p>
                              <p className="text-base font-bold text-green-600">
                                {isNowBuyTime ? "成行で購入OK" : `${formatPrice(prediction.limitPrice)}円`}
                              </p>
                              {!isNowBuyTime && currentPrice && priceDiff < 0 && (
                                <p className="text-xs text-yellow-600">
                                  あと{Math.abs(priceDiff).toLocaleString()}円 / {Math.abs(Number(priceDiffPercent))}%下落で到達
                                </p>
                              )}
                            </>
                          )
                        } else {
                          // hold推奨時: 利確目標
                          // 含み損がある場合は「成行で売却OK」を表示しない（利確は含み益があってこそ意味がある）
                          const avgPrice = portfolioAnalysis?.averagePurchasePrice
                          const hasLoss = avgPrice && currentPrice && currentPrice < avgPrice
                          const isNowSellTime = !hasLoss && currentPrice && Math.abs(limitPriceNum - currentPrice) / currentPrice < 0.01
                          const priceDiff = currentPrice ? limitPriceNum - currentPrice : 0
                          const priceDiffPercent = currentPrice ? ((priceDiff / currentPrice) * 100).toFixed(1) : "0"
                          return (
                            <>
                              <p className="text-xs text-gray-500">
                                {isNowSellTime ? "今が売り時" : "利確目標"}
                              </p>
                              <p className="text-base font-bold text-green-600">
                                {isNowSellTime ? "成行で売却OK" : `${formatPrice(prediction.limitPrice)}円`}
                              </p>
                              {!isNowSellTime && currentPrice && priceDiff > 0 && (
                                <p className="text-xs text-green-600">
                                  あと+{priceDiff.toLocaleString()}円 / +{priceDiffPercent}%で到達
                                </p>
                              )}
                            </>
                          )
                        }
                      })()}
                    </div>
                  )}
                  {showStopLossPrice && prediction.stopLossPrice && (
                    <div>
                      {(() => {
                        const stopLossPriceNum = parseFloat(prediction.stopLossPrice)
                        const currentPrice = prediction.currentPrice
                        const priceDiff = currentPrice ? stopLossPriceNum - currentPrice : 0
                        const priceDiffPercent = currentPrice ? ((priceDiff / currentPrice) * 100).toFixed(1) : "0"
                        const isNearStopLoss = currentPrice && Math.abs(priceDiff / currentPrice) < 0.03 // 3%以内なら注意

                        return (
                          <>
                            <p className="text-xs text-gray-500">逆指値（損切り）</p>
                            <p className="text-base font-bold text-red-600">
                              {formatPrice(prediction.stopLossPrice)}円
                            </p>
                            {currentPrice && priceDiff < 0 && (
                              <p className={`text-xs ${isNearStopLoss ? "text-red-600 font-semibold" : "text-gray-500"}`}>
                                {isNearStopLoss ? "⚠️ " : ""}あと{Math.abs(priceDiff).toLocaleString()}円 / {Math.abs(Number(priceDiffPercent))}%下落で発動
                              </p>
                            )}
                          </>
                        )
                      })()}
                    </div>
                  )}
                </div>
              </div>
            )
          })()}
          {/* 買増検討（好調時） */}
          {portfolioAnalysis?.statusType === "good" && prediction.recommendation === "buy" && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-3">
              <p className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-1">
                📈 買増検討
              </p>
              <p className="text-sm text-gray-700">
                好調な状態が続いています。買増を検討しても良いタイミングです。
              </p>
            </div>
          )}
          {/* 様子見（neutral時） */}
          {portfolioAnalysis?.statusType === "neutral" && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
              <p className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-1">
                👀 様子見
              </p>
              <p className="text-sm text-gray-700">
                現在は大きな動きがありません。しばらく様子を見ましょう。
              </p>
            </div>
          )}
          {/* AIによる売却提案（warning時） */}
          {portfolioAnalysis?.statusType === "warning" && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
              <p className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-1">
                ⚠️ 売却推奨
              </p>
              <div className="space-y-2">
                {portfolioAnalysis.suggestedSellPercent && (
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">推奨売却:</span>
                      <span className={`font-bold ${
                        portfolioAnalysis.suggestedSellPercent === 100 ? "text-red-600" : "text-amber-600"
                      }`}>
                        {portfolioAnalysis.suggestedSellPercent}%
                      </span>
                    </div>
                    {quantity && quantity > 0 && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        {quantity}株中 {Math.round(quantity * portfolioAnalysis.suggestedSellPercent / 100)}株
                      </p>
                    )}
                  </div>
                )}
                {prediction.recommendation === "sell" ? (
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">売却方法:</span>
                      <span className="font-bold text-red-600">
                        成行で今すぐ売却検討
                      </span>
                    </div>
                    {prediction.currentPrice && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        現在価格: {prediction.currentPrice.toLocaleString()}円
                      </p>
                    )}
                  </div>
                ) : portfolioAnalysis.suggestedSellPrice && (
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">売却価格:</span>
                      <span className="font-bold text-gray-800">
                        {portfolioAnalysis.suggestedSellPrice.toLocaleString()}円
                      </span>
                    </div>
                    {prediction.currentPrice && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        現在価格: {prediction.currentPrice.toLocaleString()}円
                      </p>
                    )}
                  </div>
                )}
                {portfolioAnalysis.sellReason && (
                  <div className="mt-2 p-2 bg-white rounded border border-gray-100">
                    <p className="text-xs text-gray-500 mb-1">理由:</p>
                    <p className="text-sm text-gray-700">{portfolioAnalysis.sellReason}</p>
                  </div>
                )}
                {portfolioAnalysis.sellCondition && (
                  <div className="text-xs text-gray-500 mt-1">
                    💡 {portfolioAnalysis.sellCondition}
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

      {/* 価格帯予測 */}
      {prediction && (
        <>
          {/* 短期予測 */}
          <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-lg shadow-md p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">
                {getTrendIcon(prediction.shortTerm.trend)}
              </span>
              <div className="flex-1">
                <h4 className="text-sm font-bold text-purple-800">短期予測（今週）</h4>
                <p className="text-xs text-purple-600">
                  {getTrendText(prediction.shortTerm.trend)} ¥{formatPrice(prediction.shortTerm.priceLow)}〜¥{formatPrice(prediction.shortTerm.priceHigh)}
                </p>
              </div>
            </div>
            {prediction.shortTerm.text && (
              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                {prediction.shortTerm.text}
              </p>
            )}
          </div>

          {/* 中期予測 */}
          <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg shadow-md p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">
                {getTrendIcon(prediction.midTerm.trend)}
              </span>
              <div className="flex-1">
                <h4 className="text-sm font-bold text-blue-800">中期予測（今月）</h4>
                <p className="text-xs text-blue-600">
                  {getTrendText(prediction.midTerm.trend)} ¥{formatPrice(prediction.midTerm.priceLow)}〜¥{formatPrice(prediction.midTerm.priceHigh)}
                </p>
              </div>
            </div>
            {prediction.midTerm.text && (
              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                {prediction.midTerm.text}
              </p>
            )}
          </div>

          {/* 長期予測 */}
          <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-lg shadow-md p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">
                {getTrendIcon(prediction.longTerm.trend)}
              </span>
              <div className="flex-1">
                <h4 className="text-sm font-bold text-emerald-800">長期予測（今後3ヶ月）</h4>
                <p className="text-xs text-emerald-600">
                  {getTrendText(prediction.longTerm.trend)} ¥{formatPrice(prediction.longTerm.priceLow)}〜¥{formatPrice(prediction.longTerm.priceHigh)}
                </p>
              </div>
            </div>
            {prediction.longTerm.text && (
              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                {prediction.longTerm.text}
              </p>
            )}
          </div>
        </>
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
