"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export default function OnboardingPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState(1) // 1: 予算, 2: 期間, 3: リスク
  const [showCustomBudget, setShowCustomBudget] = useState(false)
  const [customBudgetValue, setCustomBudgetValue] = useState("")
  const [formData, setFormData] = useState({
    budget: "",
    investmentPeriod: "",
    riskTolerance: "",
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

  const handleNext = () => {
    if (step < 3) {
      setStep(step + 1)
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
      router.push("/dashboard/portfolio")
    } catch (error) {
      console.error("Error:", error)
      alert("エラーが発生しました。もう一度お試しください。")
    } finally {
      setLoading(false)
    }
  }

  const canProceed = () => {
    if (step === 1) return formData.budget
    if (step === 2) return formData.investmentPeriod
    if (step === 3) return formData.riskTolerance
    return false
  }

  const renderOption = (option: any, selectedValue: string, onChange: (value: string) => void) => {
    const isSelected = selectedValue === option.value

    return (
      <button
        key={option.value}
        type="button"
        onClick={() => onChange(option.value)}
        className={`w-full flex items-center justify-between p-4 rounded-xl transition-all ${
          isSelected
            ? "bg-blue-600 text-white shadow-lg scale-[1.02]"
            : "bg-white border-2 border-gray-200 hover:border-blue-300 active:scale-[0.98]"
        }`}
      >
        <div className="flex items-center gap-3">
          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
            isSelected ? "border-white" : "border-gray-300"
          }`}>
            {isSelected && (
              <div className="w-3 h-3 rounded-full bg-white"></div>
            )}
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg">{option.label}</span>
              {option.badge && !isSelected && (
                <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full font-semibold">
                  おすすめ
                </span>
              )}
            </div>
            <div className={`text-sm ${isSelected ? "text-blue-100" : "text-gray-500"}`}>
              {option.desc}
            </div>
          </div>
        </div>
        {isSelected && (
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        )}
      </button>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white py-8 px-4">
      <div className="max-w-lg mx-auto">
        {/* プログレスバー */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center flex-1">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all ${
                    s < step
                      ? "bg-blue-600 text-white"
                      : s === step
                      ? "bg-blue-600 text-white scale-110"
                      : "bg-gray-200 text-gray-400"
                  }`}
                >
                  {s < step ? "✓" : s}
                </div>
                {s < 3 && (
                  <div
                    className={`h-1 flex-1 mx-2 transition-all ${
                      s < step ? "bg-blue-600" : "bg-gray-200"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="text-center">
            <p className="text-sm text-gray-600">
              ステップ {step} / 3
            </p>
          </div>
        </div>

        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {step === 1 && "投資予算"}
            {step === 2 && "投資期間"}
            {step === 3 && "リスク許容度"}
          </h1>
          <p className="text-gray-600">
            {step === 1 && "どのくらいの金額で投資を始めますか？"}
            {step === 2 && "どのくらいの期間で運用しますか？"}
            {step === 3 && "どのくらいのリスクを取れますか？"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* ステップ1: 予算 */}
          {step === 1 && (
            <div className="space-y-2">
              {[
                { value: "30000", label: "3万円", desc: "まずは少額から" },
                { value: "50000", label: "5万円", desc: "お試しで始める" },
                { value: "100000", label: "10万円", desc: "おすすめ", badge: true },
                { value: "300000", label: "30万円", desc: "本格的に運用" },
                { value: "500000", label: "50万円", desc: "分散投資向け" },
                { value: "1000000", label: "100万円", desc: "しっかり運用" },
                { value: "custom", label: "その他の金額", desc: "自由に入力" },
              ].map((option) =>
                option.value === "custom" ? (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleBudgetSelect(option.value)}
                    className={`w-full flex items-center justify-between p-4 rounded-xl transition-all ${
                      showCustomBudget
                        ? "bg-blue-600 text-white shadow-lg scale-[1.02]"
                        : "bg-white border-2 border-gray-200 hover:border-blue-300 active:scale-[0.98]"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        showCustomBudget ? "border-white" : "border-gray-300"
                      }`}>
                        {showCustomBudget && (
                          <div className="w-3 h-3 rounded-full bg-white"></div>
                        )}
                      </div>
                      <div className="text-left">
                        <span className="font-bold text-lg">{option.label}</span>
                        <div className={`text-sm ${showCustomBudget ? "text-blue-100" : "text-gray-500"}`}>
                          {option.desc}
                        </div>
                      </div>
                    </div>
                  </button>
                ) : (
                  renderOption(option, formData.budget, (value) => handleBudgetSelect(value))
                )
              )}

              {/* カスタム金額入力 */}
              {showCustomBudget && (
                <div className="mt-3 p-4 bg-blue-50 rounded-xl border-2 border-blue-200">
                  <label htmlFor="customBudget" className="block text-sm font-semibold text-gray-700 mb-2">
                    金額を入力
                  </label>
                  <div className="relative">
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
                      className="w-full px-4 py-3 pr-12 text-lg border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="100000"
                      autoFocus
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 font-medium">
                      円
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-gray-600">
                    最低 1万円から始められます
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ステップ2: 投資期間 */}
          {step === 2 && (
            <div className="space-y-2">
              {[
                { value: "short", label: "短期", desc: "〜3ヶ月" },
                { value: "medium", label: "中期", desc: "3ヶ月〜1年", badge: true },
                { value: "long", label: "長期", desc: "1年以上" },
              ].map((option) =>
                renderOption(option, formData.investmentPeriod, (value) =>
                  setFormData({ ...formData, investmentPeriod: value })
                )
              )}
            </div>
          )}

          {/* ステップ3: リスク許容度 */}
          {step === 3 && (
            <div className="space-y-2">
              {[
                { value: "low", label: "低", desc: "安定重視" },
                { value: "medium", label: "中", desc: "バランス型", badge: true },
                { value: "high", label: "高", desc: "成長重視" },
              ].map((option) =>
                renderOption(option, formData.riskTolerance, (value) =>
                  setFormData({ ...formData, riskTolerance: value })
                )
              )}
            </div>
          )}

          {/* ナビゲーションボタン */}
          <div className="flex gap-3 pt-4">
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                className="flex-1 bg-white border-2 border-gray-300 text-gray-700 font-semibold py-4 px-6 rounded-xl transition-all hover:border-gray-400 active:scale-[0.98]"
              >
                戻る
              </button>
            )}

            {step < 3 ? (
              <button
                type="button"
                onClick={handleNext}
                disabled={!canProceed()}
                className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold py-4 px-6 rounded-xl transition-all shadow-lg hover:shadow-xl active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:from-blue-600 disabled:hover:to-blue-700"
              >
                次へ
              </button>
            ) : (
              <button
                type="submit"
                disabled={loading || !canProceed()}
                className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold py-4 px-6 rounded-xl transition-all shadow-lg hover:shadow-xl active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:from-blue-600 disabled:hover:to-blue-700"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    分析中...
                  </span>
                ) : (
                  "銘柄を提案してもらう"
                )}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
