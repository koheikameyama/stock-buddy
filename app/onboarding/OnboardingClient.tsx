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

export default function OnboardingClient({ isExistingInvestor }: { isExistingInvestor: boolean }) {
  const router = useRouter()
  const [step, setStep] = useState(1) // 常にステップ1から開始（既存投資家も質問から）
  const [loading, setLoading] = useState(false)
  const [budget, setBudget] = useState("")
  const [period, setPeriod] = useState("")
  const [plan, setPlan] = useState<Plan | null>(null)

  // Step 1: ようこそ画面
  if (step === 1) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full bg-white rounded-2xl shadow-xl p-6 sm:p-8 md:p-12">
          <div className="mb-6 sm:mb-8 text-center">
            <div className="text-5xl sm:text-6xl mb-4">{isExistingInvestor ? '📊' : '👋'}</div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              {isExistingInvestor ? 'まずは投資スタイルを教えてください' : 'ようこそ、Stock Buddyへ'}
            </h1>
            {!isExistingInvestor && (
              <>
                <p className="text-lg sm:text-xl text-gray-600 mb-2">
                  投資、始めたいけど怖い？
                </p>
                <p className="text-base sm:text-lg text-gray-500">
                  大丈夫です。一緒に学びながら成長しましょう
                </p>
              </>
            )}
            {isExistingInvestor && (
              <p className="text-base sm:text-lg text-gray-600">
                あなたの投資スタイルを知ることで、より良いアドバイスができます
              </p>
            )}
          </div>

          {!isExistingInvestor && (
            <div className="bg-blue-50 rounded-xl p-5 sm:p-6 mb-6 sm:mb-8">
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3">
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
          )}

          <button
            onClick={() => setStep(2)}
            className="w-full bg-blue-600 text-white py-4 px-8 rounded-xl font-bold text-lg hover:bg-blue-700 transition-colors shadow-lg"
          >
            {isExistingInvestor ? '次へ' : '始める'}
          </button>

          <p className="text-sm text-gray-500 mt-4 text-center">
            所要時間: 約{isExistingInvestor ? '1' : '3'}分
          </p>
        </div>
      </div>
    )
  }

  // Step 2: 簡単な質問
  if (step === 2) {
    const handleGetRecommendation = async () => {
      // 既存投資家の場合は期間のみ必須
      if (isExistingInvestor) {
        if (!period) {
          alert("投資期間を選択してください")
          return
        }
      } else {
        if (!budget || !period) {
          alert("予算と期間を選択してください")
          return
        }
      }

      setLoading(true)
      try {
        // リスク許容度を期間から自動判断
        let riskTolerance = "medium"
        if (period === "short") riskTolerance = "low"
        if (period === "long") riskTolerance = "high"

        // 既存投資家の場合は投資スタイルだけ保存してポートフォリオへ
        if (isExistingInvestor) {
          const response = await fetch("/api/onboarding/settings", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              investmentPeriod: period,
              riskTolerance,
              isExistingInvestor: true,
            }),
          })

          if (!response.ok) {
            throw new Error("設定の保存に失敗しました")
          }

          // ポートフォリオページへ遷移
          router.push("/dashboard/portfolio")
          return
        }

        // 新規ユーザーの場合はAI推奨を取得
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
              {isExistingInvestor ? "投資スタイルを教えてください" : "簡単な質問です"}
            </h1>
            <p className="text-gray-600">
              {isExistingInvestor
                ? "投資期間を教えてください"
                : "あなたにぴったりのプランを考えますね"}
            </p>
          </div>

          {/* 予算選択（新規ユーザーのみ） */}
          {!isExistingInvestor && (
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
          )}

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
              <p className="text-gray-700">{isExistingInvestor ? '設定を保存しています...' : 'あなたにぴったりのプランを考えています...'}</p>
            </div>
          ) : (
            <button
              onClick={handleGetRecommendation}
              disabled={isExistingInvestor ? !period : (!budget || !period)}
              className="w-full bg-blue-600 text-white py-4 px-8 rounded-xl font-bold text-lg hover:bg-blue-700 transition-colors shadow-lg disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {isExistingInvestor ? '設定を保存して銘柄を見る' : 'おすすめを見る'}
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

    const handleComplete = async (addToPortfolio: boolean, isSimulation?: boolean) => {
      setLoading(true)
      try {
        if (isExistingInvestor) {
          if (addToPortfolio) {
            // 既存ユーザー: ポートフォリオに追加
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
                addToPortfolio: true,
                isSimulation: isSimulation ?? false,
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

            router.push("/dashboard/portfolio")
          } else {
            // 既存ユーザー: ウォッチリストに追加のみ
            const response = await fetch("/api/onboarding/add-to-watchlist", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
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

            router.push("/dashboard/portfolio")
          }
        } else {
          // 新規ユーザー: 投資スタイル保存 + 追加
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
              addToPortfolio,
              isSimulation: isSimulation ?? false,
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
        }
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
            <h3 className="text-lg font-bold text-gray-900 mb-3">
              どのように登録しますか？
            </h3>
            <div className="space-y-3 mb-4">
              <button
                onClick={() => handleComplete(true, true)}
                disabled={loading}
                className="w-full px-4 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-semibold hover:from-blue-700 hover:to-indigo-700 transition-all shadow-md hover:shadow-lg disabled:from-gray-400 disabled:to-gray-400"
              >
                <div className="flex items-center justify-between">
                  <div className="text-left">
                    <div className="text-lg font-bold">🎮 シミュレーションで登録</div>
                    <div className="text-sm text-blue-100 mt-1">
                      実際に購入したら、今持ってる銘柄から更新してください
                    </div>
                  </div>
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
              <button
                onClick={() => handleComplete(false)}
                disabled={loading}
                className="w-full px-4 py-4 bg-white border-2 border-gray-300 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 hover:border-gray-400 transition-all disabled:border-gray-200 disabled:text-gray-400"
              >
                <div className="flex items-center justify-between">
                  <div className="text-left">
                    <div className="text-lg font-bold">👀 気になるリストに追加</div>
                    <div className="text-sm text-gray-500 mt-1">
                      まずは様子を見る
                    </div>
                  </div>
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            </div>
            {loading && (
              <div className="text-center py-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                <p className="text-sm text-gray-600">保存中...</p>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return null
}
