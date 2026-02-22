"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"

interface OutcomeData {
  id: string
  type: string
  stockId: string
  stockName: string
  tickerCode: string
  sector: string | null
  recommendedAt: string
  priceAtRec: number
  prediction: string
  confidence: number | null
  returnAfter1Day: number | null
  returnAfter3Days: number | null
  returnAfter7Days: number | null
  returnAfter14Days: number | null
  benchmarkReturn7Days: number | null
  isSuccess7Days: boolean | null
}

interface OutcomesSummary {
  totalCount: number
  evaluatedCount: number
  successRate7Days: number | null
  avgReturn7Days: number | null
  benchmarkAvgReturn7Days: number | null
}

interface OutcomesResponse {
  outcomes: OutcomeData[]
  summary: OutcomesSummary
}

function formatPercent(value: number | null): string {
  if (value === null) return "---"
  const sign = value >= 0 ? "+" : ""
  return `${sign}${value.toFixed(1)}%`
}

export default function OutcomesTab() {
  const t = useTranslations('analysis.outcomesTab')
  const tPredictions = useTranslations('analysis.outcomesTab.predictions')
  const tFilters = useTranslations('analysis.outcomesTab.filters')
  const tSummary = useTranslations('analysis.outcomesTab.summary')
  const tTable = useTranslations('analysis.outcomesTab.table')
  const tErrors = useTranslations('analysis.aiReport')
  const [data, setData] = useState<OutcomesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState<string>("all")

  const formatPrediction = (prediction: string): string => {
    const labels: Record<string, string> = {
      buy: tPredictions('buy'),
      stay: tPredictions('stay'),
      remove: tPredictions('remove'),
      up: tPredictions('up'),
      down: tPredictions('down'),
      neutral: tPredictions('neutral'),
    }
    return labels[prediction] || prediction
  }

  const formatType = (type: string): string => {
    const labels: Record<string, string> = {
      daily: tFilters('recommendations'),
      purchase: tFilters('purchases'),
      analysis: tFilters('analysis'),
    }
    return labels[type] || type
  }

  useEffect(() => {
    const fetchData = async () => {
      try {
        const params = new URLSearchParams({
          days: "30",
          limit: "100",
        })
        if (typeFilter !== "all") {
          params.set("type", typeFilter)
        }

        const response = await fetch(`/api/reports/recommendation-outcomes?${params}`)
        if (!response.ok) throw new Error(tErrors('fetchError'))
        const result = await response.json()
        setData(result)
      } catch (err) {
        console.error("Error fetching outcomes:", err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [typeFilter, tErrors])

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (!data || data.outcomes.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <span className="text-4xl mb-4 block">📊</span>
        <p>{t('noData')}</p>
        <p className="text-sm mt-2">{t('noDataDescription')}</p>
      </div>
    )
  }

  const { outcomes, summary } = data

  return (
    <div className="space-y-6">
      {/* サマリー */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="text-xs text-gray-500 mb-1">{tSummary('count')}</div>
          <div className="text-2xl font-bold text-gray-900">
            {summary.evaluatedCount}<span className="text-sm text-gray-500">/{summary.totalCount}</span>
          </div>
          <div className="text-xs text-gray-500">{tSummary('evaluated')}</div>
        </div>
        <div className="bg-blue-50 rounded-lg p-4">
          <div className="text-xs text-blue-600 mb-1">{tSummary('successRate7Days')}</div>
          <div className="text-2xl font-bold text-blue-900">
            {summary.successRate7Days !== null ? `${summary.successRate7Days}%` : "---"}
          </div>
        </div>
        <div className="bg-green-50 rounded-lg p-4">
          <div className="text-xs text-green-600 mb-1">{tSummary('avgReturn7Days')}</div>
          <div className="text-2xl font-bold text-green-900">
            {formatPercent(summary.avgReturn7Days)}
          </div>
        </div>
        <div className="bg-purple-50 rounded-lg p-4">
          <div className="text-xs text-purple-600 mb-1">{tSummary('vsNikkei')}</div>
          <div className="text-2xl font-bold text-purple-900">
            {summary.avgReturn7Days !== null && summary.benchmarkAvgReturn7Days !== null
              ? formatPercent(summary.avgReturn7Days - summary.benchmarkAvgReturn7Days)
              : "---"}
          </div>
        </div>
      </div>

      {/* フィルター */}
      <div className="flex gap-2 flex-wrap">
        {[
          { value: "all", label: tFilters('all') },
          { value: "daily", label: tFilters('recommendations') },
          { value: "purchase", label: tFilters('purchases') },
          { value: "analysis", label: tFilters('analysis') },
        ].map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setTypeFilter(value)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              typeFilter === value
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* テーブル */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-3 px-2 text-gray-600 font-medium">{tTable('stock')}</th>
              <th className="text-left py-3 px-2 text-gray-600 font-medium">{tTable('type')}</th>
              <th className="text-left py-3 px-2 text-gray-600 font-medium">{tTable('prediction')}</th>
              <th className="text-right py-3 px-2 text-gray-600 font-medium">{tTable('confidence')}</th>
              <th className="text-right py-3 px-2 text-gray-600 font-medium">{tTable('after1Day')}</th>
              <th className="text-right py-3 px-2 text-gray-600 font-medium">{tTable('after7Days')}</th>
              <th className="text-right py-3 px-2 text-gray-600 font-medium">{tTable('after14Days')}</th>
              <th className="text-right py-3 px-2 text-gray-600 font-medium">{tTable('vsNikkei')}</th>
            </tr>
          </thead>
          <tbody>
            {outcomes.map((outcome) => {
              const excessReturn = outcome.returnAfter7Days !== null && outcome.benchmarkReturn7Days !== null
                ? outcome.returnAfter7Days - outcome.benchmarkReturn7Days
                : null

              return (
                <tr
                  key={outcome.id}
                  className={`border-b border-gray-100 hover:bg-gray-50 ${
                    outcome.isSuccess7Days === false ? "bg-red-50" : ""
                  }`}
                >
                  <td className="py-3 px-2">
                    <Link
                      href={`/stocks/${outcome.stockId}`}
                      className="text-blue-600 hover:underline"
                    >
                      {outcome.stockName}
                    </Link>
                    <div className="text-xs text-gray-500">{outcome.tickerCode}</div>
                  </td>
                  <td className="py-3 px-2">
                    <span className="text-xs text-gray-600">{formatType(outcome.type)}</span>
                  </td>
                  <td className="py-3 px-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      outcome.prediction === "buy" || outcome.prediction === "up"
                        ? "bg-green-100 text-green-800"
                        : outcome.prediction === "remove" || outcome.prediction === "down"
                        ? "bg-red-100 text-red-800"
                        : "bg-gray-100 text-gray-800"
                    }`}>
                      {formatPrediction(outcome.prediction)}
                    </span>
                  </td>
                  <td className="py-3 px-2 text-right text-gray-700">
                    {outcome.confidence !== null ? outcome.confidence.toFixed(2) : "---"}
                  </td>
                  <td className={`py-3 px-2 text-right font-medium ${
                    outcome.returnAfter1Day !== null
                      ? outcome.returnAfter1Day >= 0 ? "text-green-600" : "text-red-600"
                      : "text-gray-400"
                  }`}>
                    {formatPercent(outcome.returnAfter1Day)}
                  </td>
                  <td className={`py-3 px-2 text-right font-medium ${
                    outcome.returnAfter7Days !== null
                      ? outcome.returnAfter7Days >= 0 ? "text-green-600" : "text-red-600"
                      : "text-gray-400"
                  }`}>
                    {formatPercent(outcome.returnAfter7Days)}
                  </td>
                  <td className={`py-3 px-2 text-right font-medium ${
                    outcome.returnAfter14Days !== null
                      ? outcome.returnAfter14Days >= 0 ? "text-green-600" : "text-red-600"
                      : "text-gray-400"
                  }`}>
                    {formatPercent(outcome.returnAfter14Days)}
                  </td>
                  <td className={`py-3 px-2 text-right font-medium ${
                    excessReturn !== null
                      ? excessReturn >= 0 ? "text-green-600" : "text-red-600"
                      : "text-gray-400"
                  }`}>
                    {formatPercent(excessReturn)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
