"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

type Recommendation = {
  tickerCode: string
  name: string
  recommendedPrice: number
  quantity: number
  reason: string
}

export default function OnboardingPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState(0) // 0: 初期選択, 1: 予算, 2: 期間, 3: リスク, 4: 提案表示, 5: 保有銘柄入力
  const [showCustomBudget, setShowCustomBudget] = useState(false)
  const [customBudgetValue, setCustomBudgetValue] = useState("")
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [isSkipped, setIsSkipped] = useState(false) // スキップフラグ
  const [formData, setFormData] = useState({
    budget: "",
    investmentPeriod: "",
    riskTolerance: "",
  })

  const handleSkip = () => {
    // スキップフラグを立てて投資スタイル入力へ
    setIsSkipped(true)
    setStep(1)
  }

  const handleStart = () => {
    setStep(1) // 予算選択へ
  }

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

    if (isSkipped) {
      // スキップの場合は投資スタイルのみ保存して保有銘柄入力へ
      setLoading(true)
      try {
        const response = await fetch("/api/onboarding/settings", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(formData),
        })

        if (!response.ok) {
          throw new Error("Failed to save settings")
        }

        setStep(5) // 保有銘柄入力へ
      } catch (error) {
        console.error("Error:", error)
        alert("エラーが発生しました。もう一度お試しください。")
      } finally {
        setLoading(false)
      }
      return
    }

    // 通常のオンボーディングフロー
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
      setRecommendations(data.recommendations)
      setStep(4) // 提案表示へ
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

  const budgetOptions = [
    { value: "30000", label: "3万円", desc: "まずは少額から" },
    { value: "50000", label: "5万円", desc: "少しずつ増やす" },
    { value: "100000", label: "10万円", desc: "おすすめ", badge: true },
    { value: "300000", label: "30万円", desc: "本格的に始める" },
    { value: "500000", label: "50万円", desc: "分散投資" },
    { value: "1000000", label: "100万円", desc: "しっかり運用" },
    { value: "custom", label: "その他の金額", desc: "自由に入力" },
  ]

  const periodOptions = [
    { value: "short", label: "短期（〜1年）", desc: "短期的な値動きを狙う" },
    { value: "medium", label: "中期（1〜3年）", desc: "バランスの取れた運用" },
    { value: "long", label: "長期（3年〜）", desc: "じっくり育てる" },
  ]

  const riskOptions = [
    { value: "low", label: "低リスク", desc: "安定した大型株中心" },
    { value: "medium", label: "中リスク", desc: "成長性と安定性のバランス" },
    { value: "high", label: "高リスク", desc: "成長株・新興市場も含む" },
  ]

  // 初期選択画面
  if (step === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Stock Buddyへようこそ</h1>
            <p className="text-gray-600">
              あなたの投資スタイルに合わせた銘柄を提案します
            </p>
          </div>

          <div className="space-y-4">
            <button
              onClick={handleStart}
              className="w-full bg-blue-600 text-white py-4 px-6 rounded-xl font-semibold hover:bg-blue-700 transition-colors shadow-lg hover:shadow-xl"
            >
              銘柄提案を受ける
            </button>

            <button
              onClick={handleSkip}
              className="w-full bg-white text-gray-700 py-4 px-6 rounded-xl font-semibold hover:bg-gray-50 transition-colors border-2 border-gray-200"
            >
              スキップして始める
            </button>
          </div>

          <p className="text-sm text-gray-500 text-center mt-6">
            すでに投資をしている方は、スキップして直接ポートフォリオに銘柄を追加できます
          </p>
        </div>
      </div>
    )
  }

  // 保有銘柄入力画面（スキップ時）
  if (step === 5) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-4">
        <div className="max-w-2xl mx-auto py-8">
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">保有銘柄を入力</h1>
            <p className="text-gray-600 mb-8">
              現在保有している銘柄を入力してください。正確な分析のために、購入価格と株数を記録しましょう。
            </p>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-blue-800 font-semibold mb-2">
                💡 ヒント
              </p>
              <p className="text-sm text-blue-700">
                まだ保有銘柄がない場合は、「後で追加する」をクリックしてダッシュボードへ進めます。
                ダッシュボードからいつでも追加できます。
              </p>
            </div>

            <div className="text-center py-12">
              <p className="text-gray-500 mb-6">
                銘柄入力機能は次のアップデートで実装予定です
              </p>
              <button
                onClick={() => router.push("/dashboard/portfolio")}
                className="bg-blue-600 text-white px-8 py-3 rounded-xl font-semibold hover:bg-blue-700 transition-colors"
              >
                後で追加する
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // 提案表示画面
  if (step === 4) {
    const totalCost = recommendations.reduce(
      (sum, rec) => sum + rec.recommendedPrice * rec.quantity,
      0
    )

    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-4">
        <div className="max-w-4xl mx-auto py-8">
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">おすすめ銘柄</h1>
            <p className="text-gray-600 mb-8">
              以下は参考情報です。実際に購入した銘柄は、ダッシュボードから手動で追加してください。
            </p>

            <div className="mb-6 p-4 bg-blue-50 rounded-lg">
              <div className="flex justify-between items-center">
                <span className="text-gray-700 font-semibold">推定投資総額</span>
                <span className="text-2xl font-bold text-blue-600">
                  {totalCost.toLocaleString()}円
                </span>
              </div>
              <p className="text-sm text-gray-600 mt-2">
                予算: {parseInt(formData.budget).toLocaleString()}円 の{" "}
                {Math.round((totalCost / parseInt(formData.budget)) * 100)}%
              </p>
            </div>

            <div className="space-y-4 mb-8">
              {recommendations.map((rec, index) => (
                <div key={index} className="border rounded-xl p-6 hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-xl font-bold text-gray-900">{rec.name}</h3>
                      <p className="text-gray-600">{rec.tickerCode}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-600">推奨購入額</p>
                      <p className="text-2xl font-bold text-blue-600">
                        {(rec.recommendedPrice * rec.quantity).toLocaleString()}円
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                    <div>
                      <p className="text-gray-600">株価</p>
                      <p className="font-semibold">{rec.recommendedPrice.toLocaleString()}円</p>
                    </div>
                    <div>
                      <p className="text-gray-600">推奨株数</p>
                      <p className="font-semibold">{rec.quantity}株</p>
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-sm text-gray-700 font-semibold mb-1">推奨理由</p>
                    <p className="text-sm text-gray-600">{rec.reason}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-yellow-800 font-semibold mb-2">
                ⚠️ この提案は参考情報です
              </p>
              <p className="text-sm text-yellow-700">
                実際に購入した銘柄は、ダッシュボードのポートフォリオから手動で追加してください。
                購入日、購入価格、株数を正確に入力することで、正確な分析が可能になります。
              </p>
            </div>

            <button
              onClick={() => router.push("/dashboard/portfolio")}
              className="w-full bg-blue-600 text-white py-4 px-6 rounded-xl font-semibold hover:bg-blue-700 transition-colors"
            >
              ダッシュボードへ
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ステップ表示（予算・期間・リスク）
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xl p-8">
          <div className="flex items-center mb-6">
            {[1, 2, 3].map((s, index) => (
              <div
                key={s}
                className="flex items-center"
                style={{ flex: index < 2 ? "1" : "0 0 auto" }}
              >
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all ${
                    s === step
                      ? "bg-blue-600 text-white scale-110"
                      : s < step
                        ? "bg-blue-600 text-white"
                        : "bg-gray-200 text-gray-500"
                  }`}
                >
                  {s < step ? "✓" : s}
                </div>
                {s < 3 && (
                  <div
                    className={`h-1 flex-1 mx-2 transition-colors ${s < step ? "bg-blue-600" : "bg-gray-200"}`}
                  />
                )}
              </div>
            ))}
          </div>

          {step === 1 && (
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">投資予算を選んでください</h2>
              <p className="text-gray-600 mb-6 text-sm">月々の投資に回せる金額はどのくらいですか？</p>

              <div className="space-y-2">
                {budgetOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleBudgetSelect(option.value)}
                    className={`w-full p-4 rounded-xl border-2 transition-all text-left ${
                      formData.budget === option.value ||
                      (option.value === "custom" && showCustomBudget)
                        ? "border-blue-600 bg-blue-50"
                        : "border-gray-200 hover:border-blue-300"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="font-semibold text-gray-900">{option.label}</p>
                        <p className="text-sm text-gray-600">{option.desc}</p>
                      </div>
                      {option.badge && (
                        <span className="bg-blue-600 text-white text-xs px-2 py-1 rounded">
                          おすすめ
                        </span>
                      )}
                    </div>
                  </button>
                ))}

                {showCustomBudget && (
                  <input
                    type="number"
                    min="10000"
                    value={customBudgetValue}
                    onChange={(e) => {
                      setCustomBudgetValue(e.target.value)
                      setFormData({ ...formData, budget: e.target.value })
                    }}
                    placeholder="10,000円以上"
                    className="w-full p-4 border-2 border-blue-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                )}
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">投資期間を選んでください</h2>
              <p className="text-gray-600 mb-6 text-sm">どのくらいの期間で運用しますか？</p>

              <div className="space-y-2">
                {periodOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, investmentPeriod: option.value })}
                    className={`w-full p-4 rounded-xl border-2 transition-all text-left ${
                      formData.investmentPeriod === option.value
                        ? "border-blue-600 bg-blue-50"
                        : "border-gray-200 hover:border-blue-300"
                    }`}
                  >
                    <p className="font-semibold text-gray-900">{option.label}</p>
                    <p className="text-sm text-gray-600">{option.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                リスク許容度を選んでください
              </h2>
              <p className="text-gray-600 mb-6 text-sm">
                どのくらいのリスクを取れますか？
              </p>

              <div className="space-y-2">
                {riskOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, riskTolerance: option.value })}
                    className={`w-full p-4 rounded-xl border-2 transition-all text-left ${
                      formData.riskTolerance === option.value
                        ? "border-blue-600 bg-blue-50"
                        : "border-gray-200 hover:border-blue-300"
                    }`}
                  >
                    <p className="font-semibold text-gray-900">{option.label}</p>
                    <p className="text-sm text-gray-600">{option.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-8 flex gap-4">
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                className="flex-1 bg-gray-200 text-gray-700 py-3 px-6 rounded-xl font-semibold hover:bg-gray-300 transition-colors"
              >
                戻る
              </button>
            )}

            {step < 3 ? (
              <button
                type="button"
                onClick={handleNext}
                disabled={!canProceed()}
                className="flex-1 bg-blue-600 text-white py-3 px-6 rounded-xl font-semibold hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                次へ
              </button>
            ) : (
              <button
                type="submit"
                disabled={!canProceed() || loading}
                className="flex-1 bg-blue-600 text-white py-3 px-6 rounded-xl font-semibold hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {loading ? "提案を生成中..." : "銘柄を提案してもらう"}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
