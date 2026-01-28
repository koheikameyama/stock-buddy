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
  const [step, setStep] = useState(1) // 1: 初期投資, 2: 月々積立, 3: 期間, 4: リスク, 4.5: 保有銘柄確認, 5: 提案表示, 6: 保有銘柄入力
  const [hasExistingHoldings, setHasExistingHoldings] = useState<boolean | null>(null)
  const [showCustomBudget, setShowCustomBudget] = useState(false)
  const [customBudgetValue, setCustomBudgetValue] = useState("")
  const [showCustomMonthly, setShowCustomMonthly] = useState(false)
  const [customMonthlyValue, setCustomMonthlyValue] = useState("")
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [selectedStocks, setSelectedStocks] = useState<Set<number>>(new Set()) // 購入した銘柄のインデックス
  const [formData, setFormData] = useState({
    budget: "",
    monthlyAmount: "",
    investmentPeriod: "",
    riskTolerance: "",
  })

  // 保有銘柄入力用のstate
  const [holdings, setHoldings] = useState<Array<{
    tickerCode: string
    quantity: string
    averagePrice: string
    purchaseDate: string
  }>>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<Array<{ tickerCode: string; name: string }>>([])
  const [isSearching, setIsSearching] = useState(false)
  const [currentHolding, setCurrentHolding] = useState({
    tickerCode: "",
    name: "",
    quantity: "",
    averagePrice: "",
    purchaseDate: new Date().toISOString().split("T")[0],
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

  const handleMonthlySelect = (value: string) => {
    if (value === "custom") {
      setShowCustomMonthly(true)
      setFormData({ ...formData, monthlyAmount: customMonthlyValue || "0" })
    } else {
      setShowCustomMonthly(false)
      setFormData({ ...formData, monthlyAmount: value })
    }
  }

  const handleNext = () => {
    if (step < 4) {
      setStep(step + 1)
    } else if (step === 4) {
      // step 4 (リスク許容度) の後は保有銘柄確認へ
      setStep(4.5)
    }
  }

  const handleGetRecommendations = async () => {
    setLoading(true)
    try {
      console.log("Sending formData:", formData)
      const response = await fetch("/api/onboarding", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      })

      if (!response.ok) {
        const errorData = await response.json()
        console.error("API Error:", errorData)
        throw new Error(errorData.error || "Failed to generate recommendations")
      }

      const data = await response.json()
      setRecommendations(data.recommendations)
      setStep(5) // 提案表示へ
    } catch (error) {
      console.error("Error:", error)
      alert(`エラーが発生しました: ${error instanceof Error ? error.message : "もう一度お試しください"}`)
    } finally {
      setLoading(false)
    }
  }

  const handleGoToHoldingsInput = async () => {
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

      setStep(6) // 保有銘柄入力へ
    } catch (error) {
      console.error("Error:", error)
      alert("エラーが発生しました。もう一度お試しください。")
    } finally {
      setLoading(false)
    }
  }

  const canProceed = () => {
    if (step === 1) return formData.budget
    if (step === 2) return formData.monthlyAmount
    if (step === 3) return formData.investmentPeriod
    if (step === 4) return formData.riskTolerance
    return false
  }

  // 投資金額オプション
  const budgetOptions = [
    { value: "0", label: "0円", desc: "新規の投資はしない" },
    { value: "30000", label: "3万円", desc: "まずは少額から" },
    { value: "50000", label: "5万円", desc: "少しずつ増やす" },
    { value: "100000", label: "10万円", desc: "バランスの取れた金額", badge: true },
    { value: "300000", label: "30万円", desc: "本格的に始める" },
    { value: "500000", label: "50万円", desc: "分散投資" },
    { value: "1000000", label: "100万円", desc: "しっかり運用" },
    { value: "custom", label: "その他の金額", desc: "自由に入力" },
  ]

  const monthlyOptions = [
    { value: "0", label: "積立なし・決まっていない", desc: "今回のみの投資" },
    { value: "10000", label: "1万円", desc: "無理なく続ける" },
    { value: "30000", label: "3万円", desc: "バランス型" },
    { value: "50000", label: "5万円", desc: "継続しやすい金額", badge: true },
    { value: "100000", label: "10万円", desc: "積極的に運用" },
    { value: "custom", label: "その他の金額", desc: "自由に入力" },
  ]

  const periodOptions = [
    { value: "short", label: "短期（〜1年）", desc: "短期的な値動きを狙う" },
    { value: "medium", label: "中期（1〜3年）", desc: "バランスの取れた運用", badge: true },
    { value: "long", label: "長期（3年〜）", desc: "じっくり育てる" },
  ]

  const riskOptions = [
    { value: "low", label: "低リスク", desc: "安定した大型株中心" },
    { value: "medium", label: "中リスク", desc: "成長性と安定性のバランス", badge: true },
    { value: "high", label: "高リスク", desc: "成長株・新興市場も含む" },
  ]

  // 保有銘柄確認画面（step 4.5）
  if (step === 4.5) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              現在、保有している銘柄はありますか？
            </h2>
            <p className="text-gray-600">
              保有銘柄がある場合は登録すると、より適切な提案ができます
            </p>
          </div>

          <div className="space-y-4">
            <button
              onClick={async () => {
                setHasExistingHoldings(true)
                await handleGoToHoldingsInput()
              }}
              className="w-full bg-blue-600 text-white py-4 px-6 rounded-xl font-semibold hover:bg-blue-700 transition-colors shadow-lg hover:shadow-xl"
            >
              はい（保有銘柄を登録する）
            </button>

            <button
              onClick={async () => {
                setHasExistingHoldings(false)

                // 投資金額が0円の場合はシミュレーション案内
                if (formData.budget === "0") {
                  const confirmed = window.confirm(
                    "投資金額が0円、かつ保有銘柄もない場合、実際の資産運用はできませんが、\n" +
                    "シミュレーションモードとして銘柄提案やポートフォリオ管理を体験できます。\n\n" +
                    "このまま進みますか？"
                  )
                  if (!confirmed) return
                }

                await handleGetRecommendations()
              }}
              className="w-full bg-white text-gray-700 py-4 px-6 rounded-xl font-semibold border-2 border-gray-300 hover:bg-gray-50 transition-colors"
            >
              いいえ（銘柄提案に進む）
            </button>
          </div>
        </div>
      </div>
    )
  }

  // 保有銘柄入力画面
  if (step === 6) {
    const handleSearch = async (query: string) => {
      setSearchQuery(query)
      if (query.length < 2) {
        setSearchResults([])
        return
      }

      setIsSearching(true)
      try {
        const response = await fetch(`/api/stocks/search?q=${encodeURIComponent(query)}`)
        if (response.ok) {
          const data = await response.json()
          setSearchResults(data.stocks || [])
        }
      } catch (error) {
        console.error("Search error:", error)
      } finally {
        setIsSearching(false)
      }
    }

    const handleSelectStock = (stock: { tickerCode: string; name: string }) => {
      setCurrentHolding({ ...currentHolding, tickerCode: stock.tickerCode, name: stock.name })
      setSearchQuery("")
      setSearchResults([])
    }

    const handleAddHolding = () => {
      if (currentHolding.tickerCode && currentHolding.quantity && currentHolding.averagePrice) {
        setHoldings([...holdings, {
          tickerCode: currentHolding.tickerCode,
          quantity: currentHolding.quantity,
          averagePrice: currentHolding.averagePrice,
          purchaseDate: currentHolding.purchaseDate,
        }])
        setCurrentHolding({
          tickerCode: "",
          name: "",
          quantity: "",
          averagePrice: "",
          purchaseDate: new Date().toISOString().split("T")[0],
        })
      }
    }

    const handleRemoveHolding = (index: number) => {
      setHoldings(holdings.filter((_, i) => i !== index))
    }

    const handleComplete = async () => {
      if (holdings.length === 0) {
        alert("少なくとも1つの保有銘柄を登録してください")
        return
      }

      setLoading(true)
      try {
        // 保有銘柄を登録
        const response = await fetch("/api/onboarding/add-holdings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ holdings }),
        })

        if (!response.ok) {
          throw new Error("Failed to add holdings")
        }

        // 保有銘柄を考慮した銘柄提案へ
        await handleGetRecommendations()
      } catch (error) {
        console.error("Error:", error)
        alert("銘柄の追加に失敗しました。もう一度お試しください。")
        setLoading(false)
      }
    }

    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-4">
        <div className="max-w-2xl mx-auto py-8">
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">保有銘柄を入力</h1>
            <p className="text-gray-600 mb-8">
              現在保有している銘柄を入力してください。正確な分析のために、購入価格と株数を記録しましょう。
            </p>

            {/* 銘柄検索 */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                銘柄を検索
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder="銘柄コードまたは企業名を入力"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {isSearching && (
                  <div className="absolute right-3 top-3">
                    <div className="animate-spin h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                  </div>
                )}
                {searchResults.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {searchResults.map((stock) => (
                      <button
                        key={stock.tickerCode}
                        onClick={() => handleSelectStock(stock)}
                        className="w-full px-4 py-2 text-left hover:bg-blue-50 transition-colors"
                      >
                        <span className="font-semibold">{stock.tickerCode}</span>
                        <span className="text-gray-600 ml-2">{stock.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {currentHolding.name && (
                <p className="mt-2 text-sm text-blue-600">
                  選択中: {currentHolding.tickerCode} - {currentHolding.name}
                </p>
              )}
            </div>

            {/* 購入情報入力 */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  購入株数
                </label>
                <input
                  type="number"
                  value={currentHolding.quantity}
                  onChange={(e) => setCurrentHolding({ ...currentHolding, quantity: e.target.value })}
                  min="1"
                  placeholder="100"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  平均購入単価（円）
                </label>
                <input
                  type="number"
                  value={currentHolding.averagePrice}
                  onChange={(e) => setCurrentHolding({ ...currentHolding, averagePrice: e.target.value })}
                  min="0"
                  step="0.01"
                  placeholder="1000"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                購入日
              </label>
              <input
                type="date"
                value={currentHolding.purchaseDate}
                onChange={(e) => setCurrentHolding({ ...currentHolding, purchaseDate: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              />
            </div>

            <button
              onClick={handleAddHolding}
              disabled={!currentHolding.tickerCode || !currentHolding.quantity || !currentHolding.averagePrice}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed mb-6"
            >
              銘柄を追加
            </button>

            {/* 追加済み銘柄リスト */}
            {holdings.length > 0 && (
              <div className="mb-6">
                <h3 className="font-semibold text-gray-900 mb-3">追加済み銘柄（{holdings.length}件）</h3>
                <div className="space-y-2">
                  {holdings.map((holding, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex-1">
                        <p className="font-semibold">{holding.tickerCode}</p>
                        <p className="text-sm text-gray-600">
                          {holding.quantity}株 × {parseFloat(holding.averagePrice).toLocaleString()}円
                          = {(parseInt(holding.quantity) * parseFloat(holding.averagePrice)).toLocaleString()}円
                        </p>
                      </div>
                      <button
                        onClick={() => handleRemoveHolding(index)}
                        className="text-red-600 hover:text-red-700 px-3 py-1"
                      >
                        削除
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-blue-800 font-semibold mb-2">💡 ヒント</p>
              <p className="text-sm text-blue-700">
                まだ保有銘柄がない場合は、「完了」をクリックしてダッシュボードへ進めます。
                ダッシュボードからいつでも追加できます。
              </p>
            </div>

            <button
              onClick={handleComplete}
              disabled={loading || holdings.length === 0}
              className="w-full bg-blue-600 text-white py-3 px-6 rounded-xl font-semibold hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {loading ? "保存中..." : `次へ（${holdings.length}銘柄登録済み）`}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // 提案表示画面
  if (step === 5) {
    const totalCost = recommendations.reduce(
      (sum, rec) => sum + rec.recommendedPrice * rec.quantity,
      0
    )

    const toggleStockSelection = (index: number) => {
      const newSelected = new Set(selectedStocks)
      if (newSelected.has(index)) {
        newSelected.delete(index)
      } else {
        newSelected.add(index)
      }
      setSelectedStocks(newSelected)
    }

    const handleCompleteOnboarding = async () => {
      setLoading(true)
      try {
        // 推奨銘柄をウォッチリストに保存
        const response = await fetch("/api/onboarding/complete", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            recommendations,
            purchasedIndices: Array.from(selectedStocks),
          }),
        })

        if (!response.ok) {
          throw new Error("Failed to complete onboarding")
        }

        router.push("/dashboard/portfolio")
      } catch (error) {
        console.error("Error:", error)
        alert("エラーが発生しました。もう一度お試しください。")
      } finally {
        setLoading(false)
      }
    }

    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-4">
        <div className="max-w-4xl mx-auto py-8">
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">おすすめ銘柄</h1>
            <p className="text-gray-600 mb-8">
              実際に購入した銘柄にチェックを入れてください。購入詳細は後ほどダッシュボードで入力できます。
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
                <div
                  key={index}
                  className={`border-2 rounded-xl p-6 transition-all cursor-pointer ${
                    selectedStocks.has(index)
                      ? "border-blue-600 bg-blue-50"
                      : "border-gray-200 hover:border-blue-300"
                  }`}
                  onClick={() => toggleStockSelection(index)}
                >
                  <div className="flex items-start gap-4">
                    <input
                      type="checkbox"
                      checked={selectedStocks.has(index)}
                      onChange={() => toggleStockSelection(index)}
                      className="mt-1 w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                      onClick={(e) => e.stopPropagation()}
                    />

                    <div className="flex-1">
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
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-blue-800 font-semibold mb-2">
                💡 購入した銘柄を選択
              </p>
              <p className="text-sm text-blue-700">
                実際に購入した銘柄にチェックを入れてください。選択した銘柄はポートフォリオに追加され、
                選択しなかった銘柄はウォッチリストに保存されます。
                購入価格や株数の詳細は、ダッシュボードで入力できます。
              </p>
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => {
                  setSelectedStocks(new Set())
                  router.push("/dashboard/portfolio")
                }}
                className="flex-1 bg-gray-200 text-gray-700 py-4 px-6 rounded-xl font-semibold hover:bg-gray-300 transition-colors"
              >
                スキップ（ウォッチリストのみ）
              </button>
              <button
                onClick={handleCompleteOnboarding}
                disabled={loading}
                className="flex-1 bg-blue-600 text-white py-4 px-6 rounded-xl font-semibold hover:bg-blue-700 transition-colors disabled:bg-gray-300"
              >
                {loading ? "保存中..." : `完了 (${selectedStocks.size}銘柄購入済み)`}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ステップ表示（予算・期間・リスク）
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="flex items-center mb-6">
            {[1, 2, 3, 4].map((s, index) => (
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
                {s < 4 && (
                  <div
                    className={`h-1 flex-1 mx-2 transition-colors ${s < step ? "bg-blue-600" : "bg-gray-200"}`}
                  />
                )}
              </div>
            ))}
          </div>

          {step === 1 && (
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                投資金額を選んでください
              </h2>
              <p className="text-gray-600 mb-6 text-sm">
                新たに投資する予定の金額はどのくらいですか？（0円=保有銘柄のみ）
              </p>

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
              <h2 className="text-2xl font-bold text-gray-900 mb-2">月々の積立金額を選んでください</h2>
              <p className="text-gray-600 mb-6 text-sm">毎月積み立てる予定の金額はどのくらいですか？</p>

              <div className="space-y-2">
                {monthlyOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleMonthlySelect(option.value)}
                    className={`w-full p-4 rounded-xl border-2 transition-all text-left ${
                      formData.monthlyAmount === option.value ||
                      (option.value === "custom" && showCustomMonthly)
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

                {showCustomMonthly && (
                  <input
                    type="number"
                    min="0"
                    value={customMonthlyValue}
                    onChange={(e) => {
                      setCustomMonthlyValue(e.target.value)
                      setFormData({ ...formData, monthlyAmount: e.target.value })
                    }}
                    placeholder="0円以上"
                    className="w-full p-4 border-2 border-blue-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                )}
              </div>
            </div>
          )}

          {step === 3 && (
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

          {step === 4 && (
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

          <div className="mt-8">
            <div className="flex gap-4">
              {step > 1 && (
                <button
                  type="button"
                  onClick={() => setStep(step - 1)}
                  className="flex-1 bg-gray-200 text-gray-700 py-3 px-6 rounded-xl font-semibold hover:bg-gray-300 transition-colors"
                >
                  戻る
                </button>
              )}
              <button
                type="button"
                onClick={handleNext}
                disabled={!canProceed()}
                className="flex-1 bg-blue-600 text-white py-3 px-6 rounded-xl font-semibold hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                次へ
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
