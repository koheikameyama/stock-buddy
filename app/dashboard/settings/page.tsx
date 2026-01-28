"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

type Settings = {
  investmentAmount: number
  monthlyAmount: number
  investmentPeriod: string
  riskTolerance: string
}

export default function SettingsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [formData, setFormData] = useState({
    investmentAmount: "",
    monthlyAmount: "",
    investmentPeriod: "",
    riskTolerance: "",
  })
  const [showCustomInvestment, setShowCustomInvestment] = useState(false)
  const [customInvestmentValue, setCustomInvestmentValue] = useState("")
  const [showCustomMonthly, setShowCustomMonthly] = useState(false)
  const [customMonthlyValue, setCustomMonthlyValue] = useState("")

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/settings")
      if (!res.ok) throw new Error("Failed to fetch settings")

      const data = await res.json()
      if (data.settings) {
        setSettings(data.settings)
        setFormData({
          investmentAmount: String(data.settings.investmentAmount),
          monthlyAmount: String(data.settings.monthlyAmount),
          investmentPeriod: data.settings.investmentPeriod,
          riskTolerance: data.settings.riskTolerance,
        })
      }
    } catch (error) {
      console.error("Error fetching settings:", error)
      alert("設定の取得に失敗しました")
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    try {
      setSaving(true)

      // カスタム金額の処理
      let investmentAmount = formData.investmentAmount
      if (showCustomInvestment && customInvestmentValue) {
        investmentAmount = customInvestmentValue
      }

      let monthlyAmount = formData.monthlyAmount
      if (showCustomMonthly && customMonthlyValue) {
        monthlyAmount = customMonthlyValue
      }

      if (!investmentAmount || !monthlyAmount || !formData.investmentPeriod || !formData.riskTolerance) {
        alert("すべての項目を入力してください")
        return
      }

      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          investmentAmount,
          monthlyAmount,
          investmentPeriod: formData.investmentPeriod,
          riskTolerance: formData.riskTolerance,
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to update settings")
      }

      const data = await res.json()
      setSettings(data.settings)
      alert("投資スタイルを更新しました")
      router.push("/dashboard")
    } catch (error) {
      console.error("Error updating settings:", error)
      alert("設定の更新に失敗しました")
    } finally {
      setSaving(false)
    }
  }

  const investmentOptions = [
    { value: "0", label: "新規投資なし", desc: "保有銘柄のみ管理" },
    { value: "30000", label: "3万円", desc: "まずは少額から" },
    { value: "50000", label: "5万円", desc: "少しずつ増やす" },
    { value: "100000", label: "10万円", desc: "バランスの取れた金額" },
    { value: "300000", label: "30万円", desc: "本格的に始める" },
    { value: "500000", label: "50万円", desc: "分散投資" },
    { value: "1000000", label: "100万円", desc: "しっかり運用" },
    { value: "custom", label: "その他の金額", desc: "自由に入力" },
  ]

  const monthlyOptions = [
    { value: "0", label: "積立なし・決まっていない", desc: "積立の予定なし" },
    { value: "10000", label: "1万円", desc: "無理なく続ける" },
    { value: "30000", label: "3万円", desc: "バランス型" },
    { value: "50000", label: "5万円", desc: "継続しやすい金額" },
    { value: "100000", label: "10万円", desc: "積極的に運用" },
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">読み込み中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-3xl mx-auto px-4">
        <div className="mb-8">
          <button
            onClick={() => router.back()}
            className="text-blue-600 hover:text-blue-700 mb-4"
          >
            ← 戻る
          </button>
          <h1 className="text-3xl font-bold text-gray-900">投資スタイル設定</h1>
          <p className="text-gray-600 mt-2">
            投資スタイルを変更すると、今後のレポートに反映されます
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-8 space-y-8">
          {/* 追加投資金額 */}
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              追加投資予定金額
            </h2>
            <p className="text-sm text-gray-600 mb-3">
              今後新たに投資する予定の金額（既に保有している銘柄は含みません）
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {investmentOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => {
                    if (option.value === "custom") {
                      setShowCustomInvestment(true)
                      setFormData({ ...formData, investmentAmount: "" })
                    } else {
                      setShowCustomInvestment(false)
                      setFormData({ ...formData, investmentAmount: option.value })
                    }
                  }}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    (option.value === "custom" && showCustomInvestment) ||
                    formData.investmentAmount === option.value
                      ? "border-blue-600 bg-blue-50"
                      : "border-gray-200 hover:border-blue-300"
                  }`}
                >
                  <div className="font-semibold text-gray-900">{option.label}</div>
                  <div className="text-sm text-gray-600">{option.desc}</div>
                </button>
              ))}
            </div>
            {showCustomInvestment && (
              <div className="mt-4">
                <input
                  type="number"
                  value={customInvestmentValue}
                  onChange={(e) => setCustomInvestmentValue(e.target.value)}
                  placeholder="金額を入力（円）"
                  className="w-full px-4 py-3 border-2 border-blue-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
          </div>

          {/* 月々の積立金額 */}
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              月々の積立金額
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {monthlyOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => {
                    if (option.value === "custom") {
                      setShowCustomMonthly(true)
                      setFormData({ ...formData, monthlyAmount: "" })
                    } else {
                      setShowCustomMonthly(false)
                      setFormData({ ...formData, monthlyAmount: option.value })
                    }
                  }}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    (option.value === "custom" && showCustomMonthly) ||
                    formData.monthlyAmount === option.value
                      ? "border-blue-600 bg-blue-50"
                      : "border-gray-200 hover:border-blue-300"
                  }`}
                >
                  <div className="font-semibold text-gray-900">{option.label}</div>
                  <div className="text-sm text-gray-600">{option.desc}</div>
                </button>
              ))}
            </div>
            {showCustomMonthly && (
              <div className="mt-4">
                <input
                  type="number"
                  value={customMonthlyValue}
                  onChange={(e) => setCustomMonthlyValue(e.target.value)}
                  placeholder="金額を入力（円）"
                  className="w-full px-4 py-3 border-2 border-blue-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
          </div>

          {/* 投資期間 */}
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-4">投資期間</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {periodOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() =>
                    setFormData({ ...formData, investmentPeriod: option.value })
                  }
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    formData.investmentPeriod === option.value
                      ? "border-blue-600 bg-blue-50"
                      : "border-gray-200 hover:border-blue-300"
                  }`}
                >
                  <div className="font-semibold text-gray-900">{option.label}</div>
                  <div className="text-sm text-gray-600">{option.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* リスク許容度 */}
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              リスク許容度
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {riskOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() =>
                    setFormData({ ...formData, riskTolerance: option.value })
                  }
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    formData.riskTolerance === option.value
                      ? "border-blue-600 bg-blue-50"
                      : "border-gray-200 hover:border-blue-300"
                  }`}
                >
                  <div className="font-semibold text-gray-900">{option.label}</div>
                  <div className="text-sm text-gray-600">{option.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 保存ボタン */}
          <div className="flex gap-4 pt-6">
            <button
              onClick={() => router.back()}
              className="flex-1 py-3 px-6 border-2 border-gray-300 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 transition-colors"
            >
              キャンセル
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-3 px-6 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {saving ? "保存中..." : "保存する"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
