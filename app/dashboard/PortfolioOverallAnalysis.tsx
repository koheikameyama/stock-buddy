"use client"

import { useState, useEffect } from "react"
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

  // 銘柄数不足の場合
  if (totalCount < 3) {
    return (
      <div className="mb-6 bg-gradient-to-r from-gray-50 to-slate-50 rounded-xl p-4 border border-gray-200">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
            <span className="text-xl">📊</span>
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-gray-900 mb-1">
              ポートフォリオ総評
            </div>
            <p className="text-xs text-gray-600">
              保有銘柄、気になる銘柄を合計3銘柄以上登録すると分析が開始されます
            </p>
            <p className="text-[10px] text-gray-400 mt-1">
              毎日15:30頃に自動生成
            </p>
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

  // 分析がない場合
  if (!data?.hasAnalysis) {
    return (
      <div className="mb-6 bg-gradient-to-r from-gray-50 to-slate-50 rounded-xl p-4 border border-gray-200">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
            <span className="text-xl">📊</span>
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-gray-900 mb-1">
              ポートフォリオ総評
            </div>
            <p className="text-xs text-gray-600">
              総評はまだ生成されていません
            </p>
            <p className="text-[10px] text-gray-400 mt-1">
              毎日15:30頃に自動生成
            </p>
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

      {/* 分析日時 */}
      {data.analyzedAt && (
        <div className="mt-4 pt-3 border-t border-gray-100">
          <div className="text-xs text-gray-500">
            分析日時:{" "}
            {new Date(data.analyzedAt).toLocaleString("ja-JP", {
              month: "numeric",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        </div>
      )}
    </div>
  )
}
