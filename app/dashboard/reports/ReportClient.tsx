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
  portfolioId,
}: {
  report: Report | null
  portfolioId: string
}) {
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentReport, setCurrentReport] = useState(report)

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
        return "買う"
      case "sell":
        return "売る"
      case "hold":
        return "何もしない"
      default:
        return action
    }
  }

  const getActionColor = (action: string) => {
    switch (action) {
      case "buy":
        return "bg-green-600"
      case "sell":
        return "bg-red-600"
      case "hold":
        return "bg-gray-600"
      default:
        return "bg-blue-600"
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white py-12 px-4">
      <div className="max-w-4xl mx-auto">
        {/* ヘッダー */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            今日のBuddyレポート
          </h1>
          <p className="text-lg text-gray-600">AIがあなたの投資をサポート</p>
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
              まだレポートがありません
            </h2>
            <p className="text-gray-600 mb-6">
              AIがあなたのポートフォリオを分析して、今日の投資判断を提案します
            </p>
            <button
              onClick={handleGenerate}
              className="px-8 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
            >
              レポートを生成する
            </button>
          </div>
        )}

        {/* 生成中 */}
        {generating && (
          <div className="bg-white rounded-2xl shadow-md p-8 text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-lg text-gray-700">
              AIがポートフォリオを分析中...
            </p>
            <p className="text-sm text-gray-500 mt-2">
              株価データの取得と分析には1-2分かかる場合があります
            </p>
          </div>
        )}

        {/* レポート表示 */}
        {currentReport && !generating && (
          <div className="space-y-6">
            {/* 今日の判断 */}
            <div className="bg-white rounded-2xl shadow-md p-8">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <p className="text-sm text-gray-500 mb-1">
                    {new Date(currentReport.reportDate).toLocaleDateString("ja-JP", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </p>
                  <h2 className="text-3xl font-bold text-gray-900">今日の判断</h2>
                </div>
                <button
                  onClick={handleGenerate}
                  className="px-4 py-2 bg-gray-100 text-gray-700 font-semibold rounded-lg hover:bg-gray-200 transition-colors text-sm"
                >
                  再生成
                </button>
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
                  📝 結論
                </h3>
                <p className="text-gray-800 text-lg leading-relaxed">
                  {currentReport.summary}
                </p>
              </div>

              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">
                  💡 なぜこの判断？
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
                href="/dashboard/portfolio"
                className="flex-1 px-6 py-3 bg-white text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition-colors text-center border border-gray-300"
              >
                ポートフォリオを見る
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
