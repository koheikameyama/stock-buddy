"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

interface InvestmentStyleModalProps {
  isOpen: boolean
  onClose: () => void
  defaultPeriod?: string
  defaultRisk?: string
  defaultBudget?: number | null
  defaultTargetReturnRate?: number | null
  defaultStopLossRate?: number | null
}

const budgetOptions = [
  { value: 100000, label: "10万円", description: "少額から" },
  { value: 300000, label: "30万円", description: "手軽に" },
  { value: 500000, label: "50万円", description: "しっかり" },
  { value: 1000000, label: "100万円", description: "本格的に" },
  { value: 0, label: "未定", description: "あとで決める" },
]

const targetReturnOptions = [
  { value: 5, label: "+5%" },
  { value: 10, label: "+10%" },
  { value: 15, label: "+15%" },
  { value: 20, label: "+20%" },
  { value: 30, label: "+30%" },
]

const stopLossOptions = [
  { value: -5, label: "-5%" },
  { value: -10, label: "-10%" },
  { value: -15, label: "-15%" },
  { value: -20, label: "-20%" },
]

export default function InvestmentStyleModal({
  isOpen,
  onClose,
  defaultPeriod = "",
  defaultRisk = "",
  defaultBudget = null,
  defaultTargetReturnRate = null,
  defaultStopLossRate = null,
}: InvestmentStyleModalProps) {
  const router = useRouter()
  const [investmentPeriod, setInvestmentPeriod] = useState<string>(defaultPeriod)
  const [riskTolerance, setRiskTolerance] = useState<string>(defaultRisk)
  const [investmentBudget, setInvestmentBudget] = useState<number | null>(defaultBudget)
  const [targetReturnRate, setTargetReturnRate] = useState<number | null>(defaultTargetReturnRate)
  const [stopLossRate, setStopLossRate] = useState<number | null>(defaultStopLossRate)
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!isOpen) return null

  const handleSubmit = async () => {
    if (!investmentPeriod || !riskTolerance) {
      alert("投資期間とリスク許容度を選択してください")
      return
    }

    setIsSubmitting(true)

    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          investmentPeriod,
          riskTolerance,
          investmentBudget: investmentBudget && investmentBudget > 0 ? investmentBudget : null,
          targetReturnRate,
          stopLossRate,
        }),
      })

      if (!response.ok) {
        throw new Error("設定の保存に失敗しました")
      }

      onClose()
      router.refresh()
    } catch (error) {
      console.error("Error saving settings:", error)
      alert("設定の保存に失敗しました")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-4 sm:p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-1 sm:mb-2">
          投資スタイルを教えてください
        </h2>
        <p className="text-xs sm:text-sm text-gray-600 mb-4 sm:mb-6">
          あなたに合った銘柄をお届けするため、投資スタイルを教えてください。
        </p>

        {/* 投資期間 */}
        <div className="mb-4 sm:mb-6">
          <label className="block text-sm font-semibold text-gray-700 mb-2 sm:mb-3">
            投資期間
          </label>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <button
              onClick={() => setInvestmentPeriod("short")}
              className={`py-2 sm:py-3 px-2 sm:px-4 rounded-lg border-2 transition-all ${
                investmentPeriod === "short"
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-gray-200 hover:border-blue-300"
              }`}
            >
              <div className="text-base sm:text-lg mb-0.5 sm:mb-1">📅</div>
              <div className="text-xs sm:text-sm font-semibold">短期</div>
              <div className="text-[10px] sm:text-xs text-gray-500">〜1年</div>
            </button>
            <button
              onClick={() => setInvestmentPeriod("medium")}
              className={`py-2 sm:py-3 px-2 sm:px-4 rounded-lg border-2 transition-all ${
                investmentPeriod === "medium"
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-gray-200 hover:border-blue-300"
              }`}
            >
              <div className="text-base sm:text-lg mb-0.5 sm:mb-1">📆</div>
              <div className="text-xs sm:text-sm font-semibold">中期</div>
              <div className="text-[10px] sm:text-xs text-gray-500">1〜3年</div>
            </button>
            <button
              onClick={() => setInvestmentPeriod("long")}
              className={`py-2 sm:py-3 px-2 sm:px-4 rounded-lg border-2 transition-all ${
                investmentPeriod === "long"
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-gray-200 hover:border-blue-300"
              }`}
            >
              <div className="text-base sm:text-lg mb-0.5 sm:mb-1">🗓️</div>
              <div className="text-xs sm:text-sm font-semibold">長期</div>
              <div className="text-[10px] sm:text-xs text-gray-500">3年〜</div>
            </button>
          </div>
        </div>

        {/* リスク許容度 */}
        <div className="mb-4 sm:mb-6">
          <label className="block text-sm font-semibold text-gray-700 mb-2 sm:mb-3">
            リスク許容度
          </label>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <button
              onClick={() => setRiskTolerance("low")}
              className={`py-2 sm:py-3 px-2 sm:px-4 rounded-lg border-2 transition-all ${
                riskTolerance === "low"
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-gray-200 hover:border-blue-300"
              }`}
            >
              <div className="text-base sm:text-lg mb-0.5 sm:mb-1">🛡️</div>
              <div className="text-xs sm:text-sm font-semibold">低</div>
              <div className="text-[10px] sm:text-xs text-gray-500">安定重視</div>
            </button>
            <button
              onClick={() => setRiskTolerance("medium")}
              className={`py-2 sm:py-3 px-2 sm:px-4 rounded-lg border-2 transition-all ${
                riskTolerance === "medium"
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-gray-200 hover:border-blue-300"
              }`}
            >
              <div className="text-base sm:text-lg mb-0.5 sm:mb-1">⚖️</div>
              <div className="text-xs sm:text-sm font-semibold">中</div>
              <div className="text-[10px] sm:text-xs text-gray-500">バランス</div>
            </button>
            <button
              onClick={() => setRiskTolerance("high")}
              className={`py-2 sm:py-3 px-2 sm:px-4 rounded-lg border-2 transition-all ${
                riskTolerance === "high"
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-gray-200 hover:border-blue-300"
              }`}
            >
              <div className="text-base sm:text-lg mb-0.5 sm:mb-1">🚀</div>
              <div className="text-xs sm:text-sm font-semibold">高</div>
              <div className="text-[10px] sm:text-xs text-gray-500">成長重視</div>
            </button>
          </div>
        </div>

        {/* 投資資金 */}
        <div className="mb-4 sm:mb-6">
          <label className="block text-sm font-semibold text-gray-700 mb-1">
            投資にまわせる資金
          </label>
          <p className="text-xs text-gray-500 mb-2 sm:mb-3">
            予算に合った銘柄をおすすめします
          </p>
          <div className="grid grid-cols-3 gap-1.5 sm:gap-2 sm:grid-cols-5">
            {budgetOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setInvestmentBudget(option.value)}
                className={`py-2 sm:py-2.5 px-1.5 sm:px-2 rounded-lg border-2 transition-all ${
                  investmentBudget === option.value
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-200 hover:border-blue-300"
                }`}
              >
                <div className="text-xs sm:text-sm font-semibold">{option.label}</div>
                <div className="text-[10px] sm:text-xs text-gray-500">{option.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* 売却目標（利確・損切り） */}
        <div className="mb-4 sm:mb-6 bg-gray-50 rounded-xl p-3 sm:p-4">
          <label className="block text-sm font-semibold text-gray-700 mb-1">
            売却目標
          </label>
          <p className="text-xs text-gray-500 mb-2">
            利確・損切りの目安（あとで変更可能）
          </p>

          <div className="space-y-2">
            {/* 利確ライン */}
            <div className="flex items-center gap-2">
              <span className="text-xs sm:text-sm text-gray-600 w-14 sm:w-16 flex-shrink-0">📈 利確</span>
              <div className="flex flex-wrap gap-1">
                {targetReturnOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setTargetReturnRate(option.value)}
                    className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded text-[10px] sm:text-xs font-semibold transition-all ${
                      targetReturnRate === option.value
                        ? "bg-green-500 text-white"
                        : "bg-white border border-gray-200 text-gray-700 hover:border-green-300"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
                <button
                  onClick={() => setTargetReturnRate(null)}
                  className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded text-[10px] sm:text-xs font-semibold transition-all ${
                    targetReturnRate === null
                      ? "bg-gray-500 text-white"
                      : "bg-white border border-gray-200 text-gray-500 hover:border-gray-300"
                  }`}
                >
                  未定
                </button>
              </div>
            </div>

            {/* 損切りライン */}
            <div className="flex items-center gap-2">
              <span className="text-xs sm:text-sm text-gray-600 w-14 sm:w-16 flex-shrink-0">📉 損切</span>
              <div className="flex flex-wrap gap-1">
                {stopLossOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setStopLossRate(option.value)}
                    className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded text-[10px] sm:text-xs font-semibold transition-all ${
                      stopLossRate === option.value
                        ? "bg-red-500 text-white"
                        : "bg-white border border-gray-200 text-gray-700 hover:border-red-300"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
                <button
                  onClick={() => setStopLossRate(null)}
                  className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded text-[10px] sm:text-xs font-semibold transition-all ${
                    stopLossRate === null
                      ? "bg-gray-500 text-white"
                      : "bg-white border border-gray-200 text-gray-500 hover:border-gray-300"
                  }`}
                >
                  未定
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* アクションボタン */}
        <div className="flex gap-3 sticky bottom-0 bg-white pt-2">
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !investmentPeriod || !riskTolerance}
            className="flex-1 py-2.5 sm:py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "保存中..." : "保存する"}
          </button>
        </div>
      </div>
    </div>
  )
}
