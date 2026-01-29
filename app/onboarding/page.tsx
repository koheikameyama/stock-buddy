"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

type Stock = {
  tickerCode: string
  name: string
  recommendedPrice: number
  quantity: number
  reason: string
}

type Plan = {
  name: string
  description: string
  expectedReturn: string
  riskLevel: string
  strategy: string
  stocks: Stock[]
}

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(1) // 1: ようこそ, 2: 質問, 3: プラン表示
  const [loading, setLoading] = useState(false)
  const [budget, setBudget] = useState("")
  const [period, setPeriod] = useState("")
  const [plan, setPlan] = useState<Plan | null>(null)

  // Step 1: ようこそ画面
  if (step === 1) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full bg-white rounded-2xl shadow-xl p-8 md:p-12">
          <div className="mb-8 text-center">
            <div className="text-6xl mb-4">👋</div>
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              ようこそ、Stock Buddyへ
            </h1>
            <p className="text-xl text-gray-600 mb-2">
              投資、始めたいけど怖い？
            </p>
            <p className="text-lg text-gray-500">
              大丈夫です。一緒に学びながら成長しましょう
            </p>
          </div>

          <div className="bg-blue-50 rounded-xl p-6 mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">
              Stock Buddyでできること
            </h2>
            <div className="text-left space-y-2 text-gray-700">
              <p className="flex items-start gap-2">
                <span className="text-blue-600 font-bold">✓</span>
                <span>あなたにぴったりの銘柄を一緒に探します</span>
              </p>
              <p className="flex items-start gap-2">
                <span className="text-blue-600 font-bold">✓</span>
                <span>毎日の声かけで投資を見守ります</span>
              </p>
              <p className="flex items-start gap-2">
                <span className="text-blue-600 font-bold">✓</span>
                <span>難しい言葉は使いません。初心者でも安心です</span>
              </p>
            </div>
          </div>

          <button
            onClick={() => setStep(2)}
            className="w-full bg-blue-600 text-white py-4 px-8 rounded-xl font-bold text-lg hover:bg-blue-700 transition-colors shadow-lg"
          >
            始める
          </button>

          <p className="text-sm text-gray-500 mt-4">
            所要時間: 約3分
          </p>

          <div className="mt-6 pt-6 border-t border-gray-200">
            <p className="text-sm text-gray-600 mb-3 text-center">
              既に投資をしている方は
            </p>
            <button
              onClick={() => router.push("/dashboard")}
              className="w-full bg-gray-100 text-gray-700 py-3 px-6 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
            >
              スキップしてダッシュボードへ
            </button>
            <p className="text-xs text-gray-500 mt-2 text-center">
              保有銘柄はダッシュボードで登録できます
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Step 2: 簡単な質問
  if (step === 2) {
    const handleGetRecommendation = async () => {
      if (!budget || !period) {
        alert("予算と期間を選択してください")
        return
      }

      setLoading(true)
      try {
        // リスク許容度を期間から自動判断
        let riskTolerance = "medium"
        if (period === "short") riskTolerance = "low"
        if (period === "long") riskTolerance = "high"

        const response = await fetch("/api/onboarding/simple", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            budget: parseInt(budget),
            investmentPeriod: period,
            riskTolerance,
            monthlyAmount: 0, // デフォルト値
          }),
        })

        if (!response.ok) {
          throw new Error("おすすめプランの取得に失敗しました")
        }

        const data = await response.json()
        setPlan(data.plan)
        setStep(3)
      } catch (error) {
        console.error("Error:", error)
        alert("エラーが発生しました。もう一度お試しください。")
      } finally {
        setLoading(false)
      }
    }

    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-4">
        <div className="max-w-xl w-full bg-white rounded-2xl shadow-xl p-8">
          <div className="mb-8">
            <button
              onClick={() => setStep(1)}
              className="text-gray-600 hover:text-gray-900 mb-4"
            >
              ← 戻る
            </button>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              簡単な質問です
            </h1>
            <p className="text-gray-600">
              あなたにぴったりのプランを考えますね
            </p>
          </div>

          {/* 予算選択 */}
          <div className="mb-8">
            <label className="block text-lg font-semibold text-gray-900 mb-4">
              いくらから始めますか？
            </label>
            <div className="grid grid-cols-2 gap-3">
              {[
                { value: "100000", label: "10万円" },
                { value: "300000", label: "30万円" },
                { value: "500000", label: "50万円" },
                { value: "1000000", label: "100万円" },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => setBudget(option.value)}
                  className={`py-4 px-6 rounded-xl font-semibold text-lg transition-all ${
                    budget === option.value
                      ? "bg-blue-600 text-white shadow-lg"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* 期間選択 */}
          <div className="mb-8">
            <label className="block text-lg font-semibold text-gray-900 mb-4">
              どれくらいの期間で考えていますか？
            </label>
            <div className="space-y-3">
              {[
                {
                  value: "short",
                  label: "短期（1年未満）",
                  description: "少し試してみたい",
                },
                {
                  value: "medium",
                  label: "中期（1-3年）",
                  description: "じっくり育てたい",
                },
                {
                  value: "long",
                  label: "長期（3年以上）",
                  description: "将来のために貯めたい",
                },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => setPeriod(option.value)}
                  className={`w-full py-4 px-6 rounded-xl font-semibold text-left transition-all ${
                    period === option.value
                      ? "bg-blue-600 text-white shadow-lg"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="text-lg">{option.label}</div>
                      <div className={`text-sm ${period === option.value ? "text-blue-100" : "text-gray-500"}`}>
                        {option.description}
                      </div>
                    </div>
                    {period === option.value && (
                      <span className="text-2xl">✓</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-700">あなたにぴったりのプランを考えています...</p>
            </div>
          ) : (
            <button
              onClick={handleGetRecommendation}
              disabled={!budget || !period}
              className="w-full bg-blue-600 text-white py-4 px-8 rounded-xl font-bold text-lg hover:bg-blue-700 transition-colors shadow-lg disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              おすすめを見る
            </button>
          )}
        </div>
      </div>
    )
  }

  // Step 3: プラン表示
  if (step === 3 && plan) {
    const totalCost = plan.stocks.reduce(
      (sum, stock) => sum + stock.recommendedPrice * stock.quantity,
      0
    )

    const handleComplete = async () => {
      setLoading(true)
      try {
        // 投資スタイル保存 + ウォッチリスト保存
        const response = await fetch("/api/onboarding/complete", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            budget: parseInt(budget),
            monthlyAmount: 0,
            investmentPeriod: period,
            riskTolerance: period === "short" ? "low" : period === "long" ? "high" : "medium",
            recommendations: plan.stocks.map((stock) => ({
              tickerCode: stock.tickerCode,
              name: stock.name,
              recommendedPrice: stock.recommendedPrice,
              quantity: stock.quantity,
              reason: stock.reason,
            })),
          }),
        })

        if (!response.ok) {
          throw new Error("保存に失敗しました")
        }

        router.push("/dashboard")
      } catch (error) {
        console.error("Error:", error)
        alert("エラーが発生しました。もう一度お試しください。")
      } finally {
        setLoading(false)
      }
    }

    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-4 py-12">
        <div className="max-w-3xl mx-auto">
          <div className="bg-white rounded-2xl shadow-xl p-8 mb-6">
            <button
              onClick={() => setStep(2)}
              className="text-gray-600 hover:text-gray-900 mb-4"
            >
              ← やり直す
            </button>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              あなたにおすすめのプランです
            </h1>
            <p className="text-gray-600 mb-6">
              {plan.description}
            </p>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-blue-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 mb-1">投資額</p>
                <p className="text-xl font-bold text-gray-900">
                  {totalCost.toLocaleString()}円
                </p>
              </div>
              <div className="bg-green-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 mb-1">期待リターン</p>
                <p className="text-xl font-bold text-green-600">
                  {plan.expectedReturn}
                </p>
              </div>
              <div className="bg-purple-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 mb-1">銘柄数</p>
                <p className="text-xl font-bold text-purple-600">
                  {plan.stocks.length}銘柄
                </p>
              </div>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm text-gray-700">
                <span className="font-semibold">戦略:</span> {plan.strategy}
              </p>
            </div>
          </div>

          {/* 銘柄リスト */}
          <div className="space-y-4 mb-8">
            {plan.stocks.map((stock, index) => (
              <div
                key={index}
                className="bg-white rounded-xl shadow-md p-6 hover:shadow-lg transition-shadow"
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">
                      {stock.name}
                    </h3>
                    <p className="text-gray-600">{stock.tickerCode}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600">推奨購入額</p>
                    <p className="text-2xl font-bold text-blue-600">
                      {(stock.recommendedPrice * stock.quantity).toLocaleString()}円
                    </p>
                    <p className="text-sm text-gray-500">
                      {stock.recommendedPrice.toLocaleString()}円 × {stock.quantity}株
                    </p>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm font-semibold text-gray-900 mb-2">
                    なぜおすすめ？
                  </p>
                  <p className="text-sm text-gray-700">{stock.reason}</p>
                </div>
              </div>
            ))}
          </div>

          {/* 完了ボタン */}
          <div className="bg-white rounded-2xl shadow-xl p-6">
            <p className="text-gray-700 mb-4">
              これらの銘柄をウォッチリストに追加します。ダッシュボードで詳しく見ていきましょう。
            </p>
            <button
              onClick={handleComplete}
              disabled={loading}
              className="w-full bg-blue-600 text-white py-4 px-8 rounded-xl font-bold text-lg hover:bg-blue-700 transition-colors shadow-lg disabled:bg-gray-300"
            >
              {loading ? "保存中..." : "始める"}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return null
}
