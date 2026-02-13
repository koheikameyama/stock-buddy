"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import type {
  MetricsAnalysis,
  ActionSuggestion,
  WatchlistSimulation,
} from "@/lib/portfolio-overall-analysis"

interface OverallAnalysisData {
  hasAnalysis: boolean
  reason?: "not_enough_stocks"
  analyzedAt?: string
  isToday?: boolean
  portfolioCount?: number
  watchlistCount?: number
  metrics?: {
    sectorConcentration: number | null
    sectorCount: number | null
    totalValue: number
    totalCost: number
    unrealizedGain: number
    unrealizedGainPercent: number
    portfolioVolatility: number | null
  }
  overallSummary?: string
  overallStatus?: string
  overallStatusType?: string
  metricsAnalysis?: MetricsAnalysis
  actionSuggestions?: ActionSuggestion[]
  watchlistSimulation?: WatchlistSimulation | null
}

interface Props {
  portfolioCount: number
  watchlistCount: number
}

function getStatusBadgeStyle(statusType: string | undefined) {
  switch (statusType) {
    case "excellent":
      return "bg-green-100 text-green-800"
    case "good":
      return "bg-blue-100 text-blue-800"
    case "neutral":
      return "bg-gray-100 text-gray-800"
    case "caution":
      return "bg-yellow-100 text-yellow-800"
    case "warning":
      return "bg-red-100 text-red-800"
    default:
      return "bg-gray-100 text-gray-800"
  }
}

function getEvaluationBadgeStyle(evaluationType: string | undefined) {
  switch (evaluationType) {
    case "good":
      return "bg-green-100 text-green-700"
    case "neutral":
      return "bg-gray-100 text-gray-700"
    case "warning":
      return "bg-yellow-100 text-yellow-700"
    default:
      return "bg-gray-100 text-gray-700"
  }
}

function MetricCard({
  title,
  icon,
  analysis,
}: {
  title: string
  icon: string
  analysis: {
    value: string
    explanation: string
    evaluation: string
    evaluationType: string
    action: string
  }
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3 sm:p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <span className="text-sm font-semibold text-gray-900">{title}</span>
        </div>
        <span
          className={`px-2 py-0.5 rounded-full text-xs font-medium ${getEvaluationBadgeStyle(
            analysis.evaluationType
          )}`}
        >
          {analysis.evaluation}
        </span>
      </div>
      <div className="text-base sm:text-lg font-bold text-gray-900 mb-2">
        {analysis.value}
      </div>
      <p className="text-xs text-gray-600 mb-2">{analysis.explanation}</p>
      <div className="flex items-start gap-1.5 text-xs text-blue-700 bg-blue-50 rounded p-2">
        <span className="shrink-0">→</span>
        <span>{analysis.action}</span>
      </div>
    </div>
  )
}

function WatchlistSimulationCard({
  simulation,
}: {
  simulation: WatchlistSimulation
}) {
  if (!simulation.stocks || simulation.stocks.length === 0) {
    return null
  }

  return (
    <div className="mt-4 bg-gradient-to-br from-purple-50 to-indigo-50 rounded-lg p-3 sm:p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">🔮</span>
        <span className="text-sm font-semibold text-gray-900">
          ウォッチリスト追加シミュレーション
        </span>
      </div>
      <div className="space-y-3">
        {simulation.stocks.map((stock) => (
          <div
            key={stock.stockId}
            className="bg-white/80 rounded-lg p-3 border border-purple-100"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="font-medium text-sm text-gray-900">
                {stock.stockName}
              </span>
              <span className="text-xs text-gray-500">({stock.tickerCode})</span>
              <span className="text-xs text-gray-500">{stock.sector}</span>
            </div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-gray-600">セクター集中度:</span>
              <span
                className={`text-xs font-medium ${
                  stock.predictedImpact.sectorConcentrationChange < 0
                    ? "text-green-600"
                    : stock.predictedImpact.sectorConcentrationChange > 0
                    ? "text-red-600"
                    : "text-gray-600"
                }`}
              >
                {stock.predictedImpact.sectorConcentrationChange > 0 ? "+" : ""}
                {stock.predictedImpact.sectorConcentrationChange}%
              </span>
              <span
                className={`px-1.5 py-0.5 rounded text-xs ${
                  stock.predictedImpact.diversificationScore === "改善"
                    ? "bg-green-100 text-green-700"
                    : stock.predictedImpact.diversificationScore === "悪化"
                    ? "bg-red-100 text-red-700"
                    : "bg-gray-100 text-gray-700"
                }`}
              >
                {stock.predictedImpact.diversificationScore}
              </span>
            </div>
            <p className="text-xs text-gray-600">
              {stock.predictedImpact.recommendation}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function PortfolioOverallAnalysis({
  portfolioCount,
  watchlistCount,
}: Props) {
  const [data, setData] = useState<OverallAnalysisData | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)

  const totalCount = portfolioCount + watchlistCount

  useEffect(() => {
    if (totalCount < 3) {
      setLoading(false)
      return
    }

    const fetchData = async () => {
      try {
        const res = await fetch("/api/portfolio/overall-analysis")
        const result = await res.json()
        setData(result)
      } catch (error) {
        console.error("Error fetching overall analysis:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [totalCount])

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const res = await fetch("/api/portfolio/overall-analysis", {
        method: "POST",
      })
      const result = await res.json()
      setData(result)
    } catch (error) {
      console.error("Error generating overall analysis:", error)
    } finally {
      setGenerating(false)
    }
  }

  // 銘柄数不足の場合
  if (totalCount < 3) {
    const remaining = 3 - totalCount
    return (
      <div className="mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
            <span className="text-xl">📊</span>
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-gray-900 mb-1">
              ポートフォリオ総評分析
            </div>
            <p className="text-xs text-gray-600 mb-2">
              あと{remaining}銘柄追加すると、ポートフォリオ全体の分析が見られます
            </p>
            <Link
              href="/stocks"
              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              銘柄を探す
              <svg
                className="w-3 h-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // ローディング中
  if (loading) {
    return (
      <div className="mb-6 bg-white rounded-xl p-4 shadow-sm border border-gray-200">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center">
            <span className="text-lg">📊</span>
          </div>
          <span className="text-sm font-semibold text-gray-900">
            ポートフォリオ総評
          </span>
        </div>
        <div className="space-y-3">
          <div className="h-16 bg-gray-200 rounded-lg animate-pulse"></div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="h-32 bg-gray-200 rounded-lg animate-pulse"></div>
            <div className="h-32 bg-gray-200 rounded-lg animate-pulse"></div>
            <div className="h-32 bg-gray-200 rounded-lg animate-pulse"></div>
          </div>
        </div>
      </div>
    )
  }

  // 分析がない場合（生成ボタンを表示）
  if (!data?.hasAnalysis) {
    return (
      <div className="mb-6 bg-gradient-to-r from-amber-50 to-yellow-50 rounded-xl p-4 border border-amber-200">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
            <span className="text-xl">📊</span>
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-gray-900 mb-1">
              ポートフォリオ総評分析
            </div>
            <p className="text-xs text-gray-600 mb-3">
              ポートフォリオ全体の分析を生成して、セクター分散度やボラティリティなどの指標を確認しましょう
            </p>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {generating ? (
                <>
                  <svg
                    className="w-4 h-4 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  分析中...
                </>
              ) : (
                <>
                  <span>✨</span>
                  今すぐ分析する
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // 分析結果を表示
  return (
    <div className="mb-6 bg-white rounded-xl p-4 shadow-sm border border-gray-200">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center">
            <span className="text-lg">📊</span>
          </div>
          <span className="text-sm font-semibold text-gray-900">
            ポートフォリオ総評
          </span>
        </div>
        {data.overallStatus && (
          <span
            className={`px-2.5 py-1 rounded-full text-xs font-semibold ${getStatusBadgeStyle(
              data.overallStatusType
            )}`}
          >
            {data.overallStatus}
          </span>
        )}
      </div>

      {/* 総評サマリー */}
      {data.overallSummary && (
        <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-lg p-3 sm:p-4 mb-4">
          <p className="text-sm text-gray-700 whitespace-pre-wrap">
            {data.overallSummary}
          </p>
        </div>
      )}

      {/* 指標カード */}
      {data.metricsAnalysis && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <MetricCard
            title="セクター分散度"
            icon="🏢"
            analysis={data.metricsAnalysis.sectorDiversification}
          />
          <MetricCard
            title="損益状況"
            icon="💰"
            analysis={data.metricsAnalysis.profitLoss}
          />
          <MetricCard
            title="ボラティリティ"
            icon="📈"
            analysis={data.metricsAnalysis.volatility}
          />
        </div>
      )}

      {/* ウォッチリストシミュレーション */}
      {data.watchlistSimulation && (
        <WatchlistSimulationCard simulation={data.watchlistSimulation} />
      )}

      {/* 分析日時と更新ボタン */}
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
        <div className="text-xs text-gray-500">
          {data.analyzedAt && (
            <>
              分析日時:{" "}
              {new Date(data.analyzedAt).toLocaleString("ja-JP", {
                month: "numeric",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </>
          )}
        </div>
        {!data.isToday && (
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 disabled:opacity-50"
          >
            {generating ? (
              <>
                <svg
                  className="w-3 h-3 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                更新中...
              </>
            ) : (
              <>
                <svg
                  className="w-3 h-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                今日の分析を生成
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}
