"use client"

import { useState, useEffect } from "react"

interface ConfidenceData {
  bucket: string
  count: number
  successRate: number
  avgReturn: number
}

interface SectorData {
  sector: string
  count: number
  successRate: number
  avgReturn: number
  excessReturn: number | null
}

interface PredictionData {
  prediction: string
  count: number
  successRate: number
  avgReturn: number
}

interface TimeHorizonData {
  horizon: string
  count: number
  successRate: number | null
  avgReturn: number | null
}

interface BenchmarkData {
  period: string
  aiReturn: number | null
  benchmarkReturn: number | null
  excess: number | null
}

interface AnalysisResponse {
  byConfidence: ConfidenceData[]
  bySector: SectorData[]
  byPrediction: PredictionData[]
  byTimeHorizon: TimeHorizonData[]
  benchmark: BenchmarkData[]
  message?: string
}

function formatPercent(value: number | null): string {
  if (value === null) return "---"
  const sign = value >= 0 ? "+" : ""
  return `${sign}${value.toFixed(1)}%`
}

function formatPrediction(prediction: string): string {
  const labels: Record<string, string> = {
    buy: "買い",
    stay: "様子見",
    remove: "見送り",
    up: "上昇",
    down: "下落",
    neutral: "横ばい",
  }
  return labels[prediction] || prediction
}

export default function AnalysisTab() {
  const [data, setData] = useState<AnalysisResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch("/api/reports/recommendation-outcomes/analysis?days=30")
        if (!response.ok) throw new Error("データの取得に失敗しました")
        const result = await response.json()
        setData(result)
      } catch (err) {
        console.error("Error fetching analysis:", err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="space-y-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-40 bg-gray-100 rounded-lg animate-pulse" />
        ))}
      </div>
    )
  }

  if (!data || data.message) {
    return (
      <div className="text-center py-12 text-gray-500">
        <span className="text-4xl mb-4 block">📈</span>
        <p>{data?.message || "まだ分析データがありません"}</p>
        <p className="text-sm mt-2">データが2週間程度溜まると分析が表示されます</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 信頼度キャリブレーション */}
      {data.byConfidence.length > 0 && (
        <div className="bg-white rounded-xl p-5 shadow-sm">
          <h3 className="text-lg font-bold text-gray-900 mb-4">信頼度キャリブレーション</h3>
          <p className="text-sm text-gray-500 mb-4">
            AIが自信を持っている時ほど本当に当たっているか？
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-2 text-gray-600">信頼度</th>
                  <th className="text-right py-2 px-2 text-gray-600">件数</th>
                  <th className="text-right py-2 px-2 text-gray-600">成功率（7日後）</th>
                  <th className="text-right py-2 px-2 text-gray-600">平均リターン</th>
                </tr>
              </thead>
              <tbody>
                {data.byConfidence.map((row) => (
                  <tr key={row.bucket} className="border-b border-gray-100">
                    <td className="py-2 px-2 text-gray-900 font-medium">{row.bucket}</td>
                    <td className="py-2 px-2 text-right text-gray-700">{row.count}</td>
                    <td className="py-2 px-2 text-right">
                      <span className={`font-medium ${row.successRate >= 70 ? "text-green-600" : row.successRate >= 50 ? "text-yellow-600" : "text-red-600"}`}>
                        {row.successRate}%
                      </span>
                    </td>
                    <td className={`py-2 px-2 text-right font-medium ${row.avgReturn >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {formatPercent(row.avgReturn)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* セクター別 */}
      {data.bySector.length > 0 && (
        <div className="bg-white rounded-xl p-5 shadow-sm">
          <h3 className="text-lg font-bold text-gray-900 mb-4">セクター別パフォーマンス</h3>
          <p className="text-sm text-gray-500 mb-4">
            得意/不得意なセクターはあるか？
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-2 text-gray-600">セクター</th>
                  <th className="text-right py-2 px-2 text-gray-600">件数</th>
                  <th className="text-right py-2 px-2 text-gray-600">成功率（7日後）</th>
                  <th className="text-right py-2 px-2 text-gray-600">平均リターン</th>
                  <th className="text-right py-2 px-2 text-gray-600">vs日経</th>
                </tr>
              </thead>
              <tbody>
                {data.bySector.slice(0, 10).map((row) => (
                  <tr key={row.sector} className="border-b border-gray-100">
                    <td className="py-2 px-2 text-gray-900">{row.sector}</td>
                    <td className="py-2 px-2 text-right text-gray-700">{row.count}</td>
                    <td className="py-2 px-2 text-right">
                      <span className={`font-medium ${row.successRate >= 70 ? "text-green-600" : row.successRate >= 50 ? "text-yellow-600" : "text-red-600"}`}>
                        {row.successRate}%
                      </span>
                    </td>
                    <td className={`py-2 px-2 text-right font-medium ${row.avgReturn >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {formatPercent(row.avgReturn)}
                    </td>
                    <td className={`py-2 px-2 text-right font-medium ${
                      row.excessReturn !== null
                        ? row.excessReturn >= 0 ? "text-green-600" : "text-red-600"
                        : "text-gray-400"
                    }`}>
                      {formatPercent(row.excessReturn)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 予測種類別 */}
      {data.byPrediction.length > 0 && (
        <div className="bg-white rounded-xl p-5 shadow-sm">
          <h3 className="text-lg font-bold text-gray-900 mb-4">予測種類別パフォーマンス</h3>
          <p className="text-sm text-gray-500 mb-4">
            どの判断が当たりやすいか？
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-2 text-gray-600">予測</th>
                  <th className="text-right py-2 px-2 text-gray-600">件数</th>
                  <th className="text-right py-2 px-2 text-gray-600">成功率（7日後）</th>
                  <th className="text-right py-2 px-2 text-gray-600">平均リターン</th>
                </tr>
              </thead>
              <tbody>
                {data.byPrediction.map((row) => (
                  <tr key={row.prediction} className="border-b border-gray-100">
                    <td className="py-2 px-2 text-gray-900 font-medium">{formatPrediction(row.prediction)}</td>
                    <td className="py-2 px-2 text-right text-gray-700">{row.count}</td>
                    <td className="py-2 px-2 text-right">
                      <span className={`font-medium ${row.successRate >= 70 ? "text-green-600" : row.successRate >= 50 ? "text-yellow-600" : "text-red-600"}`}>
                        {row.successRate}%
                      </span>
                    </td>
                    <td className={`py-2 px-2 text-right font-medium ${row.avgReturn >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {formatPercent(row.avgReturn)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 時間枠別 */}
      {data.byTimeHorizon.length > 0 && (
        <div className="bg-white rounded-xl p-5 shadow-sm">
          <h3 className="text-lg font-bold text-gray-900 mb-4">時間枠別パフォーマンス</h3>
          <p className="text-sm text-gray-500 mb-4">
            短期と中期どちらの精度が高いか？
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-2 text-gray-600">時間枠</th>
                  <th className="text-right py-2 px-2 text-gray-600">評価済み件数</th>
                  <th className="text-right py-2 px-2 text-gray-600">成功率</th>
                  <th className="text-right py-2 px-2 text-gray-600">平均リターン</th>
                </tr>
              </thead>
              <tbody>
                {data.byTimeHorizon.map((row) => (
                  <tr key={row.horizon} className="border-b border-gray-100">
                    <td className="py-2 px-2 text-gray-900 font-medium">{row.horizon}</td>
                    <td className="py-2 px-2 text-right text-gray-700">{row.count}</td>
                    <td className="py-2 px-2 text-right">
                      {row.successRate !== null ? (
                        <span className={`font-medium ${row.successRate >= 70 ? "text-green-600" : row.successRate >= 50 ? "text-yellow-600" : "text-red-600"}`}>
                          {row.successRate}%
                        </span>
                      ) : "---"}
                    </td>
                    <td className={`py-2 px-2 text-right font-medium ${
                      row.avgReturn !== null
                        ? row.avgReturn >= 0 ? "text-green-600" : "text-red-600"
                        : "text-gray-400"
                    }`}>
                      {formatPercent(row.avgReturn)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ベンチマーク比較 */}
      {data.benchmark.length > 0 && data.benchmark.some(b => b.aiReturn !== null) && (
        <div className="bg-white rounded-xl p-5 shadow-sm">
          <h3 className="text-lg font-bold text-gray-900 mb-4">ベンチマーク比較</h3>
          <p className="text-sm text-gray-500 mb-4">
            AI推薦は市場平均（日経225）に勝っているか？
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-2 text-gray-600">期間</th>
                  <th className="text-right py-2 px-2 text-gray-600">AI推薦平均</th>
                  <th className="text-right py-2 px-2 text-gray-600">日経225</th>
                  <th className="text-right py-2 px-2 text-gray-600">超過リターン</th>
                </tr>
              </thead>
              <tbody>
                {data.benchmark.map((row) => (
                  <tr key={row.period} className="border-b border-gray-100">
                    <td className="py-2 px-2 text-gray-900 font-medium">{row.period}</td>
                    <td className={`py-2 px-2 text-right font-medium ${
                      row.aiReturn !== null
                        ? row.aiReturn >= 0 ? "text-green-600" : "text-red-600"
                        : "text-gray-400"
                    }`}>
                      {formatPercent(row.aiReturn)}
                    </td>
                    <td className={`py-2 px-2 text-right font-medium ${
                      row.benchmarkReturn !== null
                        ? row.benchmarkReturn >= 0 ? "text-green-600" : "text-red-600"
                        : "text-gray-400"
                    }`}>
                      {formatPercent(row.benchmarkReturn)}
                    </td>
                    <td className={`py-2 px-2 text-right font-bold ${
                      row.excess !== null
                        ? row.excess >= 0 ? "text-green-600" : "text-red-600"
                        : "text-gray-400"
                    }`}>
                      {formatPercent(row.excess)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
