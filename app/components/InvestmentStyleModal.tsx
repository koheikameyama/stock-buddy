"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

interface InvestmentStyleModalProps {
  isOpen: boolean
  onClose: () => void
  defaultPeriod?: string
  defaultRisk?: string
  defaultBudget?: number | null
}

const budgetOptions = [
  { value: 100000, label: "10万円", description: "少額から" },
  { value: 300000, label: "30万円", description: "手軽に" },
  { value: 500000, label: "50万円", description: "しっかり" },
  { value: 1000000, label: "100万円", description: "本格的に" },
  { value: 0, label: "未定", description: "あとで決める" },
]

export default function InvestmentStyleModal({
  isOpen,
  onClose,
  defaultPeriod = "",
  defaultRisk = "",
  defaultBudget = null,
}: InvestmentStyleModalProps) {
  const router = useRouter()
  const [investmentPeriod, setInvestmentPeriod] = useState<string>(defaultPeriod)
  const [riskTolerance, setRiskTolerance] = useState<string>(defaultRisk)
  const [investmentBudget, setInvestmentBudget] = useState<number | null>(defaultBudget)
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 sm:p-8 shadow-2xl">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          投資スタイルを教えてください
        </h2>
        <p className="text-sm text-gray-600 mb-6">
          あなたに合った銘柄をお届けするため、投資スタイルを教えてください。
        </p>

        {/* 投資期間 */}
        <div className="mb-6">
          <label className="block text-sm font-semibold text-gray-700 mb-3">
            投資期間
          </label>
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => setInvestmentPeriod("short")}
              className={`py-3 px-4 rounded-lg border-2 transition-all ${
                investmentPeriod === "short"
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-gray-200 hover:border-blue-300"
              }`}
            >
              <div className="text-lg mb-1">📅</div>
              <div className="text-sm font-semibold">短期</div>
              <div className="text-xs text-gray-500">〜1年</div>
            </button>
            <button
              onClick={() => setInvestmentPeriod("medium")}
              className={`py-3 px-4 rounded-lg border-2 transition-all ${
                investmentPeriod === "medium"
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-gray-200 hover:border-blue-300"
              }`}
            >
              <div className="text-lg mb-1">📆</div>
              <div className="text-sm font-semibold">中期</div>
              <div className="text-xs text-gray-500">1〜3年</div>
            </button>
            <button
              onClick={() => setInvestmentPeriod("long")}
              className={`py-3 px-4 rounded-lg border-2 transition-all ${
                investmentPeriod === "long"
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-gray-200 hover:border-blue-300"
              }`}
            >
              <div className="text-lg mb-1">🗓️</div>
              <div className="text-sm font-semibold">長期</div>
              <div className="text-xs text-gray-500">3年〜</div>
            </button>
          </div>
        </div>

        {/* リスク許容度 */}
        <div className="mb-8">
          <label className="block text-sm font-semibold text-gray-700 mb-3">
            リスク許容度
          </label>
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => setRiskTolerance("low")}
              className={`py-3 px-4 rounded-lg border-2 transition-all ${
                riskTolerance === "low"
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-gray-200 hover:border-blue-300"
              }`}
            >
              <div className="text-lg mb-1">🛡️</div>
              <div className="text-sm font-semibold">低</div>
              <div className="text-xs text-gray-500">安定重視</div>
            </button>
            <button
              onClick={() => setRiskTolerance("medium")}
              className={`py-3 px-4 rounded-lg border-2 transition-all ${
                riskTolerance === "medium"
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-gray-200 hover:border-blue-300"
              }`}
            >
              <div className="text-lg mb-1">⚖️</div>
              <div className="text-sm font-semibold">中</div>
              <div className="text-xs text-gray-500">バランス</div>
            </button>
            <button
              onClick={() => setRiskTolerance("high")}
              className={`py-3 px-4 rounded-lg border-2 transition-all ${
                riskTolerance === "high"
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-gray-200 hover:border-blue-300"
              }`}
            >
              <div className="text-lg mb-1">🚀</div>
              <div className="text-sm font-semibold">高</div>
              <div className="text-xs text-gray-500">成長重視</div>
            </button>
          </div>
        </div>

        {/* 投資資金 */}
        <div className="mb-8">
          <label className="block text-sm font-semibold text-gray-700 mb-1">
            投資にまわせる資金
          </label>
          <p className="text-xs text-gray-500 mb-3">
            予算に合った銘柄をおすすめします
          </p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {budgetOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setInvestmentBudget(option.value)}
                className={`py-2.5 px-2 rounded-lg border-2 transition-all ${
                  investmentBudget === option.value
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-200 hover:border-blue-300"
                }`}
              >
                <div className="text-sm font-semibold">{option.label}</div>
                <div className="text-xs text-gray-500">{option.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* アクションボタン */}
        <div className="flex gap-3">
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !investmentPeriod || !riskTolerance}
            className="flex-1 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "保存中..." : "保存する"}
          </button>
        </div>
      </div>
    </div>
  )
}
