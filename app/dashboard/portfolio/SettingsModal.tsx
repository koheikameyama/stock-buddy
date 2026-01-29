"use client"

import { useState } from "react"

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  currentPeriod: string
  currentRisk: string
  onSuccess: () => void
}

export default function SettingsModal({
  isOpen,
  onClose,
  currentPeriod,
  currentRisk,
  onSuccess,
}: SettingsModalProps) {
  const [investmentPeriod, setInvestmentPeriod] = useState(currentPeriod)
  const [riskTolerance, setRiskTolerance] = useState(currentRisk)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!investmentPeriod || !riskTolerance) {
      setError("すべての項目を選択してください")
      return
    }

    try {
      setLoading(true)

      // 現在の設定を取得
      const currentSettings = await fetch("/api/settings")
      const { settings: current } = await currentSettings.json()

      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          investmentAmount: current?.investmentAmount || 0,
          monthlyAmount: current?.monthlyAmount || 0,
          investmentPeriod,
          riskTolerance,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "設定の更新に失敗しました")
      }

      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message || "設定の更新に失敗しました")
    } finally {
      setLoading(false)
    }
  }

  const periodOptions = [
    { value: "short", label: "短期（〜3ヶ月）", desc: "短期的な値動きを狙う" },
    { value: "medium", label: "中期（3ヶ月〜1年）", desc: "バランスの取れた運用" },
    { value: "long", label: "長期（1年以上）", desc: "じっくり育てる" },
  ]

  const riskOptions = [
    { value: "low", label: "低リスク", desc: "安定した大型株中心" },
    { value: "medium", label: "中リスク", desc: "成長性と安定性のバランス" },
    { value: "high", label: "高リスク", desc: "成長株・新興市場も含む" },
  ]

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900">
            投資スタイルを変更
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* 投資期間 */}
          <div className="mb-6">
            <h3 className="text-lg font-bold text-gray-900 mb-3">投資期間</h3>
            <div className="grid grid-cols-1 gap-3">
              {periodOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setInvestmentPeriod(option.value)}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    investmentPeriod === option.value
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
          <div className="mb-6">
            <h3 className="text-lg font-bold text-gray-900 mb-3">リスク許容度</h3>
            <div className="grid grid-cols-1 gap-3">
              {riskOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setRiskTolerance(option.value)}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    riskTolerance === option.value
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

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg font-semibold hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {loading ? "保存中..." : "保存"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
