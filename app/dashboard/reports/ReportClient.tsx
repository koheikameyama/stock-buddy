"use client"

import { useState } from "react"

interface KeyIndicator {
  name: string
  value: string
  explanation: string
}

interface Report {
  id: string
  reportDate: string
  action: string
  targetStock: {
    tickerCode: string
    name: string
  } | null
  summary: string
  reasoning: string
  futurePlan: string | null
  keyIndicators: KeyIndicator[]
}

export default function ReportClient({
  report,
}: {
  report: Report | null
  portfolioId: string
}) {
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentReport] = useState(report)

  const handleGenerate = async () => {
    try {
      setGenerating(true)
      setError(null)

      const response = await fetch("/api/reports/generate", {
        method: "POST",
      })

      if (!response.ok) {
        throw new Error("レポートの生成に失敗しました")
      }

      const data = await response.json()

      if (data.report) {
        // ページをリロードして最新のレポートを表示
        window.location.reload()
      }
    } catch (err) {
      console.error(err)
      setError("レポートの生成に失敗しました")
    } finally {
      setGenerating(false)
    }
  }

  const getActionText = (action: string) => {
    switch (action) {
      case "buy":
        return "買い推奨"
      case "sell":
        return "売り推奨"
      case "hold":
        return "様子見推奨"
      default:
        return action
    }
  }

  const getActionColor = (action: string) => {
    switch (action) {
      case "buy":
        return "bg-blue-500 text-white"
      case "sell":
        return "bg-orange-500 text-white"
      case "hold":
        return "bg-gray-500 text-white"
      default:
        return "bg-blue-500 text-white"
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white py-12 px-4">
      <div className="max-w-4xl mx-auto">
        {/* ヘッダー */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            今日のおすすめアクション
          </h1>
          <p className="text-lg text-gray-600">
            ポートフォリオ全体を見て、今日やるべきことを提案します
          </p>
        </div>

        {/* エラー表示 */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-8">
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {/* レポートがない場合 */}
        {!currentReport && !generating && (
          <div className="bg-white rounded-2xl shadow-md p-8 text-center">
            <div className="mb-6">
              <svg
                className="w-24 h-24 mx-auto text-gray-300"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              まだ今日の提案がありません
            </h2>
            <p className="text-gray-600 mb-6">
              ポートフォリオ全体を分析して、今日やるべきアクションを提案します
            </p>
            <button
              onClick={handleGenerate}
              className="px-8 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
            >
              今日の提案を見る
            </button>
          </div>
        )}

        {/* 生成中 */}
        {generating && (
          <div className="bg-white rounded-2xl shadow-md p-8 text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-lg text-gray-700">
              あなたの投資を分析中...
            </p>
            <p className="text-sm text-gray-500 mt-2">
              少しお待ちくださいね（1-2分ほどかかります）
            </p>
          </div>
        )}

        {/* レポート表示 */}
        {currentReport && !generating && (
          <div className="space-y-6">
            {/* 今日の判断 */}
            <div className="bg-white rounded-2xl shadow-md p-8">
              <div className="mb-6">
                <p className="text-sm text-gray-500 mb-1">
                  {new Date(currentReport.reportDate).toLocaleDateString("ja-JP", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
                <h2 className="text-3xl font-bold text-gray-900">今日の判断</h2>
              </div>

              <div
                className={`${getActionColor(
                  currentReport.action
                )} text-white rounded-xl p-6 mb-6`}
              >
                <p className="text-lg mb-2">今日のアクション</p>
                <div className="flex items-center gap-4">
                  <p className="text-5xl font-bold">
                    {getActionText(currentReport.action)}
                  </p>
                  {currentReport.targetStock && (
                    <div className="text-xl">
                      <p className="font-semibold">{currentReport.targetStock.name}</p>
                      <p className="text-sm opacity-90">
                        {currentReport.targetStock.tickerCode}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-blue-50 rounded-lg p-6 mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">
                  📝 今日の提案
                </h3>
                <p className="text-gray-800 text-lg leading-relaxed">
                  {currentReport.summary}
                </p>
              </div>

              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">
                  💡 ポートフォリオ全体から見た判断理由
                </h3>
                <p className="text-gray-700 leading-relaxed whitespace-pre-line">
                  {currentReport.reasoning}
                </p>
              </div>

              {currentReport.keyIndicators &&
                currentReport.keyIndicators.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">
                      📊 見ている重要指標
                    </h3>
                    <div className="space-y-3">
                      {currentReport.keyIndicators.map((indicator, index) => (
                        <div
                          key={index}
                          className="bg-gray-50 rounded-lg p-4 border border-gray-200"
                        >
                          <div className="flex justify-between items-start mb-2">
                            <p className="font-semibold text-gray-900">
                              {indicator.name}
                            </p>
                            <p className="text-lg font-bold text-blue-600">
                              {indicator.value}
                            </p>
                          </div>
                          <p className="text-sm text-gray-600">
                            {indicator.explanation}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              {currentReport.futurePlan && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">
                    🔮 今後の方針
                  </h3>
                  <p className="text-gray-700 leading-relaxed whitespace-pre-line">
                    {currentReport.futurePlan}
                  </p>
                </div>
              )}
            </div>

            {/* ナビゲーション */}
            <div className="flex gap-4">
              <a
                href="/dashboard"
                className="flex-1 px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors text-center"
              >
                ダッシュボードに戻る
              </a>
              <a
                href="/dashboard/portfolio"
                className="flex-1 px-6 py-3 bg-white text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition-colors text-center border border-gray-300"
              >
                保有銘柄を見る
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
