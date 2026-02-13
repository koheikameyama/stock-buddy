"use client"

import { useEffect, useState } from "react"
import AnalysisTimestamp from "./AnalysisTimestamp"
import { UPDATE_SCHEDULES } from "@/lib/constants"

// Inline SVG icons
const ChevronDownIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
)

const ChevronUpIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
  </svg>
)

interface PurchaseRecommendationProps {
  stockId: string
}

interface RecommendationData {
  stockId: string
  stockName: string
  tickerCode: string
  currentPrice: number | null
  recommendation: "buy" | "stay"
  confidence: number
  reason: string
  caution: string
  // A. 買い時判断
  shouldBuyToday?: boolean | null
  idealEntryPrice?: number | null
  idealEntryPriceExpiry?: string | null
  priceGap?: number | null
  buyTimingExplanation?: string | null
  // B. 深掘り評価
  positives?: string | null
  concerns?: string | null
  suitableFor?: string | null
  // D. パーソナライズ
  userFitScore?: number | null
  budgetFit?: boolean | null
  periodFit?: boolean | null
  riskFit?: boolean | null
  personalizedReason?: string | null
  analyzedAt: string
}

export default function PurchaseRecommendation({ stockId }: PurchaseRecommendationProps) {
  const [data, setData] = useState<RecommendationData | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [noData, setNoData] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDetails, setShowDetails] = useState(false)

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

  // 買い時判断セクション（A）
  const BuyTimingSection = () => {
    if (!data?.buyTimingExplanation) return null
    return (
      <div className="bg-white rounded-lg p-3 sm:p-4 mb-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">⏰</span>
          <span className="text-sm font-semibold text-gray-800">買い時判断</span>
          {data.shouldBuyToday !== null && (
            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
              data.shouldBuyToday
                ? "bg-green-100 text-green-800"
                : "bg-yellow-100 text-yellow-800"
            }`}>
              {data.shouldBuyToday ? "買い推奨" : "タイミング待ち"}
            </span>
          )}
        </div>
        <p className="text-sm text-gray-700">{data.buyTimingExplanation}</p>
        {/* 理想の買い値を表示 */}
        {data.idealEntryPrice && (
          <div className="mt-2 text-xs text-gray-600">
            <p>
              📊 理想の買い値: <strong className="text-gray-900">{data.idealEntryPrice.toLocaleString()}円</strong>
              {data.idealEntryPriceExpiry && (
                <span className="text-gray-500 ml-1">
                  （〜{new Date(data.idealEntryPriceExpiry).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })}まで）
                </span>
              )}
              {data.priceGap != null && (
                <span className={data.priceGap < 0 ? "text-green-600 ml-2" : "text-yellow-600 ml-2"}>
                  （現在価格より{Math.abs(data.priceGap).toLocaleString()}円{data.priceGap < 0 ? "高い → 割安" : "安い → 様子見"}）
                </span>
              )}
            </p>
          </div>
        )}
      </div>
    )
  }

  // 深掘り評価セクション（B）
  const DeepEvaluationSection = () => {
    if (!data?.positives && !data?.concerns && !data?.suitableFor) return null
    return (
      <div className="mb-4">
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="w-full flex items-center justify-between bg-white rounded-lg p-3 hover:bg-gray-50 transition-colors"
        >
          <span className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <span className="text-lg">🔍</span>
            この銘柄の詳細評価
          </span>
          {showDetails ? (
            <ChevronUpIcon className="w-5 h-5 text-gray-500" />
          ) : (
            <ChevronDownIcon className="w-5 h-5 text-gray-500" />
          )}
        </button>

        {showDetails && (
          <div className="mt-2 space-y-3">
            {/* 良いところ */}
            {data.positives && (
              <div className="bg-green-50 rounded-lg p-3">
                <p className="text-xs font-semibold text-green-700 mb-2">良いところ</p>
                <div className="text-sm text-green-800 whitespace-pre-line">{data.positives}</div>
              </div>
            )}

            {/* 不安な点 */}
            {data.concerns && (
              <div className="bg-yellow-50 rounded-lg p-3">
                <p className="text-xs font-semibold text-yellow-700 mb-2">不安な点</p>
                <div className="text-sm text-yellow-800 whitespace-pre-line">{data.concerns}</div>
              </div>
            )}

            {/* こんな人向け */}
            {data.suitableFor && (
              <div className="bg-blue-50 rounded-lg p-3">
                <p className="text-xs font-semibold text-blue-700 mb-2">こんな人におすすめ</p>
                <p className="text-sm text-blue-800">{data.suitableFor}</p>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // パーソナライズセクション（D）
  const PersonalizedSection = () => {
    if (data?.userFitScore == null && !data?.personalizedReason) return null
    return (
      <div className="bg-purple-50 rounded-lg p-3 sm:p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-purple-800 flex items-center gap-2">
            <span className="text-lg">🎯</span>
            あなたへのおすすめ度
          </span>
          {data?.userFitScore != null && (
            <span className={`px-3 py-1 rounded-full text-sm font-bold ${
              data.userFitScore >= 70
                ? "bg-green-100 text-green-800"
                : data.userFitScore >= 40
                ? "bg-yellow-100 text-yellow-800"
                : "bg-gray-100 text-gray-800"
            }`}>
              {data.userFitScore}点
            </span>
          )}
        </div>

        {/* マッチ状態 */}
        <div className="flex gap-2 mb-2">
          {data.budgetFit !== null && (
            <span className={`px-2 py-0.5 rounded text-xs ${
              data.budgetFit ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
            }`}>
              {data.budgetFit ? "予算内" : "予算オーバー"}
            </span>
          )}
          {data.periodFit !== null && (
            <span className={`px-2 py-0.5 rounded text-xs ${
              data.periodFit ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
            }`}>
              {data.periodFit ? "期間マッチ" : "期間ミスマッチ"}
            </span>
          )}
          {data.riskFit !== null && (
            <span className={`px-2 py-0.5 rounded text-xs ${
              data.riskFit ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
            }`}>
              {data.riskFit ? "リスク適合" : "リスク注意"}
            </span>
          )}
        </div>

        <p className="text-sm text-purple-700">{data.personalizedReason}</p>
      </div>
    )
  }

  // 買い推奨
  if (data.recommendation === "buy") {
    return (
      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg shadow-md p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-2xl">💡</span>
            <h3 className="text-base sm:text-lg font-bold text-green-800">購入を検討できるタイミングです</h3>
          </div>

          <p className="text-sm text-gray-700 mb-4">{data.reason}</p>

          {/* A. 買い時判断 */}
          <BuyTimingSection />

          {/* D. パーソナライズ */}
          <PersonalizedSection />

          {/* B. 深掘り評価 */}
          <DeepEvaluationSection />

          <div className="bg-amber-50 border-l-4 border-amber-400 p-3 mb-4">
            <p className="text-xs text-amber-800">⚠️ {data.caution}</p>
          </div>

          <div className="flex items-center gap-2 mb-3">
            <div className="flex-1 bg-gray-200 rounded-full h-2">
              <div
                className="bg-green-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${confidencePercent}%` }}
              />
            </div>
            <span className="text-xs text-gray-600 whitespace-nowrap">信頼度 {confidencePercent}%</span>
          </div>

          <div className="text-center space-y-1">
            <AnalysisTimestamp dateString={data.analyzedAt} />
            <p className="text-xs text-gray-400">
              更新 {UPDATE_SCHEDULES.STOCK_ANALYSIS}（平日）
            </p>
          </div>
        </div>
      </div>
    )
  }

  // 様子見（stayまたはそれ以外のフォールバック）
  return (
    <div className="mt-4 pt-4 border-t border-gray-200">
      <div className="bg-gradient-to-br from-blue-50 to-sky-50 rounded-lg shadow-md p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-2xl">⏳</span>
          <h3 className="text-base sm:text-lg font-bold text-blue-800">もう少し様子を見ましょう</h3>
        </div>

        <p className="text-sm text-gray-700 mb-4">{data.reason}</p>

        {/* A. 買い時判断 */}
        <BuyTimingSection />

        {/* D. パーソナライズ */}
        <PersonalizedSection />

        <div className="bg-blue-50 border-l-4 border-blue-400 p-3 mb-4">
          <p className="text-xs text-blue-800">💡 今は焦らず、タイミングを待ちましょう</p>
        </div>

        {/* B. 深掘り評価 */}
        <DeepEvaluationSection />

        <div className="bg-amber-50 border-l-4 border-amber-400 p-3 mb-4">
          <p className="text-xs text-amber-800">⚠️ {data.caution}</p>
        </div>

        <div className="flex items-center gap-2 mb-3">
          <div className="flex-1 bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${confidencePercent}%` }}
            />
          </div>
          <span className="text-xs text-gray-600 whitespace-nowrap">信頼度 {confidencePercent}%</span>
        </div>

        <div className="text-center space-y-1">
          <AnalysisTimestamp dateString={data.analyzedAt} />
          <p className="text-xs text-gray-400">
            更新 {UPDATE_SCHEDULES.STOCK_ANALYSIS}（平日）
          </p>
        </div>
      </div>
    </div>
  )
}
