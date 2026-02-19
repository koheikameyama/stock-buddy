"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"
import { useMarkPageSeen } from "@/app/hooks/useMarkPageSeen"
import OutcomesTab from "./components/OutcomesTab"
import AnalysisTab from "./components/AnalysisTab"

type TabType = "overview" | "outcomes" | "analysis"

interface ImprovementData {
  target: string
  action: string
  reason: string
}

interface CategoryData {
  count: number | null
  avgReturn: number | null
  plusRate?: number | null
  successRate: number | null
  improvement?: string | ImprovementData | null
}

interface DetailData {
  daily: {
    best: { name: string; tickerCode: string; performance: number }[]
    worst: { name: string; tickerCode: string; performance: number }[]
    topSectors: { sector: string; avgReturn: number; count: number }[]
    bottomSectors: { sector: string; avgReturn: number; count: number }[]
  }
  purchase: {
    byRecommendation: Record<string, { count: number; successRate: number }>
    topSectors: { sector: string; successRate: number; count: number }[]
    bottomSectors: { sector: string; successRate: number; count: number }[]
  }
  analysis: {
    byTrend: Record<string, { count: number; successRate: number }>
    topSectors: { sector: string; successRate: number; count: number }[]
    bottomSectors: { sector: string; successRate: number; count: number }[]
  }
}

interface LatestReport {
  date: string
  daily: CategoryData
  purchase: CategoryData
  analysis: CategoryData
  details: DetailData | null
}

interface ChartDataPoint {
  date: string
  daily: { count: number | null; avgReturn: number | null; successRate: number | null }
  purchase: { count: number | null; avgReturn: number | null; successRate: number | null }
  analysis: { count: number | null; avgReturn: number | null; successRate: number | null }
}

interface AIAccuracyData {
  latest: LatestReport | null
  chartData: ChartDataPoint[]
  totalDays: number
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return `${date.getMonth() + 1}/${date.getDate()}`
}

function formatPercent(value: number | null): string {
  if (value === null) return "-"
  const sign = value >= 0 ? "+" : ""
  return `${sign}${value.toFixed(1)}%`
}

function renderImprovement(improvement: string | ImprovementData | null | undefined): string {
  if (!improvement) return ""
  if (typeof improvement === "string") {
    // 旧形式（文字列）または新形式のJSON文字列をパース
    try {
      const parsed = JSON.parse(improvement) as ImprovementData
      return `${parsed.target}を${parsed.action}します（${parsed.reason}）`
    } catch {
      return improvement
    }
  }
  // 新形式（オブジェクト）
  return `${improvement.target}を${improvement.action}します（${improvement.reason}）`
}

export default function AIReportClient() {
  // ページ訪問時に閲覧済みをマーク
  useMarkPageSeen("ai-report")

  const [activeTab, setActiveTab] = useState<TabType>("overview")
  const [data, setData] = useState<AIAccuracyData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch("/api/reports/ai-accuracy?limit=30")
        if (!response.ok) {
          throw new Error("データの取得に失敗しました")
        }
        const result = await response.json()
        setData(result)
      } catch (err) {
        console.error("Error fetching AI accuracy report:", err)
        setError(err instanceof Error ? err.message : "エラーが発生しました")
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">AI精度レポート</h1>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-md">
          <div className="animate-pulse space-y-4">
            <div className="h-6 w-40 bg-gray-200 rounded" />
            <div className="grid grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-24 bg-gray-100 rounded-lg" />
              ))}
            </div>
            <div className="h-48 bg-gray-100 rounded-lg" />
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">AI精度レポート</h1>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-md text-center text-gray-500">
          <p>AI精度レポートの取得に失敗しました</p>
        </div>
      </div>
    )
  }

  if (!data || !data.latest) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">AI精度レポート</h1>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-md text-center text-gray-500 py-12">
          <span className="text-4xl mb-4 block">🤖</span>
          <p>まだレポートデータがありません</p>
          <p className="text-sm mt-2">日次レポートが生成されると表示されます</p>
        </div>
      </div>
    )
  }

  const { latest, chartData } = data
  const details = latest.details as DetailData | null

  // グラフ用データの変換
  const graphData = chartData.map((d) => ({
    date: formatDate(d.date),
    おすすめ: d.daily.successRate,
    購入判断: d.purchase.successRate,
    銘柄分析: d.analysis.successRate,
  }))

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard"
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">AI精度レポート</h1>
          <p className="text-sm text-gray-500">
            {activeTab === "overview"
              ? `${formatDate(latest.date)} 時点（7日前の推奨を評価）`
              : "推薦精度の詳細分析"}
          </p>
        </div>
      </div>

      {/* タブバー */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
        {[
          { id: "overview" as TabType, label: "概要" },
          { id: "outcomes" as TabType, label: "個別結果" },
          { id: "analysis" as TabType, label: "条件別分析" },
        ].map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex-1 py-2 px-4 text-sm font-medium rounded-md transition-colors ${
              activeTab === id
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* タブコンテンツ */}
      {activeTab === "outcomes" && <OutcomesTab />}
      {activeTab === "analysis" && <AnalysisTab />}

      {activeTab === "overview" && (
        <>
      {/* サマリーカード */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* おすすめ銘柄 */}
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-5 shadow-sm">
          <div className="text-sm text-blue-700 font-medium mb-2">おすすめ銘柄</div>
          <div className="flex items-center gap-1 mb-1">
            <span className="text-xs text-blue-500">平均リターン</span>
            <div className="group relative">
              <svg className="w-3.5 h-3.5 text-blue-400 cursor-help" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="invisible group-hover:visible absolute z-10 w-48 p-2 bg-gray-800 text-white text-xs rounded-lg -top-2 left-6 shadow-lg">
                AIが推奨した銘柄の株価変動率の平均値
              </div>
            </div>
          </div>
          <div className="text-3xl font-bold text-blue-900 mb-2">
            {formatPercent(latest.daily.avgReturn)}
          </div>
          <div className="text-sm text-blue-600">
            成功率 {latest.daily.successRate?.toFixed(0) ?? "-"}%
            <span className="text-blue-500 ml-2">({latest.daily.count ?? 0}件)</span>
          </div>
        </div>

        {/* 購入判断 */}
        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-5 shadow-sm">
          <div className="text-sm text-green-700 font-medium mb-2">購入判断</div>
          <div className="flex items-center gap-1 mb-1">
            <span className="text-xs text-green-500">平均リターン</span>
            <div className="group relative">
              <svg className="w-3.5 h-3.5 text-green-400 cursor-help" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="invisible group-hover:visible absolute z-10 w-48 p-2 bg-gray-800 text-white text-xs rounded-lg -top-2 left-6 shadow-lg">
                「買い」判断した銘柄の株価変動率の平均値
              </div>
            </div>
          </div>
          <div className="text-3xl font-bold text-green-900 mb-2">
            {formatPercent(latest.purchase.avgReturn)}
          </div>
          <div className="text-sm text-green-600">
            成功率 {latest.purchase.successRate?.toFixed(0) ?? "-"}%
            <span className="text-green-500 ml-2">({latest.purchase.count ?? 0}件)</span>
          </div>
        </div>

        {/* 銘柄分析 */}
        <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-5 shadow-sm">
          <div className="text-sm text-purple-700 font-medium mb-2">銘柄分析</div>
          <div className="flex items-center gap-1 mb-1">
            <span className="text-xs text-purple-500">平均リターン</span>
            <div className="group relative">
              <svg className="w-3.5 h-3.5 text-purple-400 cursor-help" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="invisible group-hover:visible absolute z-10 w-48 p-2 bg-gray-800 text-white text-xs rounded-lg -top-2 left-6 shadow-lg">
                分析した銘柄の株価変動率の平均値
              </div>
            </div>
          </div>
          <div className="text-3xl font-bold text-purple-900 mb-2">
            {formatPercent(latest.analysis.avgReturn)}
          </div>
          <div className="text-sm text-purple-600">
            成功率 {latest.analysis.successRate?.toFixed(0) ?? "-"}%
            <span className="text-purple-500 ml-2">({latest.analysis.count ?? 0}件)</span>
          </div>
        </div>
      </div>

      {/* 精度推移グラフ */}
      {graphData.length > 1 && (
        <div className="bg-white rounded-xl p-5 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900 mb-4">成功率の推移</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={graphData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 12 }}
                  stroke="#9ca3af"
                  tickFormatter={(value) => `${value}%`}
                />
                <Tooltip
                  formatter={(value) => [`${(value as number)?.toFixed(1)}%`, ""]}
                  labelFormatter={(label) => `${label}`}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="おすすめ"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="購入判断"
                  stroke="#22c55e"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="銘柄分析"
                  stroke="#a855f7"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* 詳細データ */}
      {details && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* ベスト/ワーストパフォーマー */}
          {(details.daily.best.length > 0 || details.daily.worst.length > 0) && (
            <div className="bg-white rounded-xl p-5 shadow-sm">
              <h2 className="text-lg font-bold text-gray-900 mb-4">おすすめ銘柄のパフォーマンス</h2>
              <div className="space-y-4">
                {details.daily.best.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-green-700 mb-2">ベストパフォーマー</h3>
                    <div className="space-y-2">
                      {details.daily.best.map((stock, i) => (
                        <div key={i} className="flex justify-between items-center text-sm">
                          <span className="text-gray-700">{stock.name}</span>
                          <span className="font-medium text-green-600">
                            {formatPercent(stock.performance)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {details.daily.worst.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-red-700 mb-2">ワーストパフォーマー</h3>
                    <div className="space-y-2">
                      {details.daily.worst.map((stock, i) => (
                        <div key={i} className="flex justify-between items-center text-sm">
                          <span className="text-gray-700">{stock.name}</span>
                          <span className="font-medium text-red-600">
                            {formatPercent(stock.performance)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* セクター別分析 */}
          {(details.daily.topSectors.length > 0 || details.daily.bottomSectors.length > 0) && (
            <div className="bg-white rounded-xl p-5 shadow-sm">
              <h2 className="text-lg font-bold text-gray-900 mb-4">セクター別パフォーマンス</h2>
              <div className="space-y-4">
                {details.daily.topSectors.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-green-700 mb-2">好調セクター</h3>
                    <div className="space-y-2">
                      {details.daily.topSectors.map((sector, i) => (
                        <div key={i} className="flex justify-between items-center text-sm">
                          <span className="text-gray-700">{sector.sector}</span>
                          <span className="font-medium text-green-600">
                            {formatPercent(sector.avgReturn)} ({sector.count}件)
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {details.daily.bottomSectors.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-red-700 mb-2">不調セクター</h3>
                    <div className="space-y-2">
                      {details.daily.bottomSectors.map((sector, i) => (
                        <div key={i} className="flex justify-between items-center text-sm">
                          <span className="text-gray-700">{sector.sector}</span>
                          <span className="font-medium text-red-600">
                            {formatPercent(sector.avgReturn)} ({sector.count}件)
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 改善ポイント */}
      {(latest.daily.improvement || latest.purchase.improvement || latest.analysis.improvement) && (
        <div className="bg-amber-50 rounded-xl p-5 shadow-sm">
          <h2 className="text-lg font-bold text-amber-800 mb-2 flex items-center gap-2">
            <span>🔧</span>
            今後の改善予定
          </h2>
          <p className="text-sm text-amber-600 mb-4">AIのパフォーマンス向上のため、以下の改善を行います</p>
          <div className="space-y-3">
            {latest.daily.improvement && (
              <div className="text-sm text-amber-700">
                <span className="font-medium">おすすめ銘柄:</span>{" "}
                <span>{renderImprovement(latest.daily.improvement)}</span>
              </div>
            )}
            {latest.purchase.improvement && (
              <div className="text-sm text-amber-700">
                <span className="font-medium">購入判断:</span>{" "}
                <span>{renderImprovement(latest.purchase.improvement)}</span>
              </div>
            )}
            {latest.analysis.improvement && (
              <div className="text-sm text-amber-700">
                <span className="font-medium">銘柄分析:</span>{" "}
                <span>{renderImprovement(latest.analysis.improvement)}</span>
              </div>
            )}
          </div>
        </div>
      )}
        </>
      )}
    </div>
  )
}
