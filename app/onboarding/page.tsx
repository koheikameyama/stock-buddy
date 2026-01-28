"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export default function OnboardingPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [showCustomBudget, setShowCustomBudget] = useState(false)
  const [customBudgetValue, setCustomBudgetValue] = useState("")
  const [formData, setFormData] = useState({
    budget: "100000", // デフォルト値を設定
    investmentPeriod: "medium", // short, medium, long
    riskTolerance: "medium", // low, medium, high
  })

  const handleBudgetSelect = (value: string) => {
    if (value === "custom") {
      setShowCustomBudget(true)
      setFormData({ ...formData, budget: customBudgetValue || "10000" })
    } else {
      setShowCustomBudget(false)
      setFormData({ ...formData, budget: value })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const response = await fetch("/api/onboarding", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      })

      if (!response.ok) {
        throw new Error("Failed to generate recommendations")
      }

      const data = await response.json()

      // ポートフォリオページにリダイレクト
      router.push("/dashboard/portfolio")
    } catch (error) {
      console.error("Error:", error)
      alert("エラーが発生しました。もう一度お試しください。")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            投資スタイルを設定
          </h1>
          <p className="text-lg text-gray-600">
            あなたに合った銘柄をAIが提案します
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-md p-8 space-y-6">
          {/* 予算 */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              投資予算
            </label>
            <div className="grid grid-cols-2 gap-3">
              {[
                { value: "30000", label: "3万円", desc: "まずは少額から" },
                { value: "50000", label: "5万円", desc: "お試しで始める" },
                { value: "100000", label: "10万円", desc: "おすすめ" },
                { value: "300000", label: "30万円", desc: "本格的に運用" },
                { value: "500000", label: "50万円", desc: "分散投資向け" },
                { value: "1000000", label: "100万円", desc: "しっかり運用" },
                { value: "custom", label: "その他", desc: "金額を入力する" },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleBudgetSelect(option.value)}
                  className={`p-4 border-2 rounded-lg transition-all ${
                    option.value === "custom"
                      ? showCustomBudget
                        ? "border-blue-600 bg-blue-50"
                        : "border-gray-200 hover:border-gray-300"
                      : formData.budget === option.value && !showCustomBudget
                      ? "border-blue-600 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="font-semibold text-gray-900">{option.label}</div>
                  <div className="text-sm text-gray-500">{option.desc}</div>
                </button>
              ))}
            </div>

            {/* カスタム金額入力 */}
            {showCustomBudget && (
              <div className="mt-4 p-4 bg-blue-50 rounded-lg border-2 border-blue-200">
                <label htmlFor="customBudget" className="block text-sm font-semibold text-gray-700 mb-2">
                  金額を入力してください（円）
                </label>
                <input
                  type="number"
                  id="customBudget"
                  min="10000"
                  step="10000"
                  value={customBudgetValue}
                  onChange={(e) => {
                    setCustomBudgetValue(e.target.value)
                    setFormData({ ...formData, budget: e.target.value })
                  }}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="例: 150000"
                  autoFocus
                />
                <p className="mt-2 text-sm text-gray-600">
                  ※ 最低 1万円から始められます
                </p>
              </div>
            )}

            <p className="mt-3 text-sm text-gray-500">
              ※ 後から変更できます
            </p>
          </div>

          {/* 投資期間 */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              投資期間
            </label>
            <div className="grid grid-cols-3 gap-3">
              {[
                { value: "short", label: "短期", desc: "〜3ヶ月" },
                { value: "medium", label: "中期", desc: "3ヶ月〜1年" },
                { value: "long", label: "長期", desc: "1年以上" },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFormData({ ...formData, investmentPeriod: option.value })}
                  className={`p-4 border-2 rounded-lg transition-all ${
                    formData.investmentPeriod === option.value
                      ? "border-blue-600 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="font-semibold text-gray-900">{option.label}</div>
                  <div className="text-sm text-gray-500">{option.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* リスク許容度 */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              リスク許容度
            </label>
            <div className="grid grid-cols-3 gap-3">
              {[
                { value: "low", label: "低", desc: "安定重視" },
                { value: "medium", label: "中", desc: "バランス型" },
                { value: "high", label: "高", desc: "成長重視" },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFormData({ ...formData, riskTolerance: option.value })}
                  className={`p-4 border-2 rounded-lg transition-all ${
                    formData.riskTolerance === option.value
                      ? "border-blue-600 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="font-semibold text-gray-900">{option.label}</div>
                  <div className="text-sm text-gray-500">{option.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 送信ボタン */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-8 rounded-lg text-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "分析中..." : "AIに銘柄を提案してもらう"}
          </button>
        </form>
      </div>
    </div>
  )
}
