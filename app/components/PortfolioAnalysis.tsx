"use client"

import { useEffect, useState } from "react"

interface PortfolioAnalysisProps {
  stockId: string
}

interface AnalysisData {
  shortTerm: string | null
  mediumTerm: string | null
  longTerm: string | null
  lastAnalysis: string | null
  isToday: boolean
}

export default function PortfolioAnalysis({ stockId }: PortfolioAnalysisProps) {
  const [data, setData] = useState<AnalysisData | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchAnalysis = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/stocks/${stockId}/portfolio-analysis`)

      if (!response.ok) {
        throw new Error("分析の取得に失敗しました")
      }

      const result = await response.json()
      setData(result)
      setError(null)
    } catch (err) {
      console.error("Error fetching portfolio analysis:", err)
      setError("分析の取得に失敗しました")
    } finally {
      setLoading(false)
    }
  }

  const handleGenerate = async () => {
    try {
      setGenerating(true)
      const response = await fetch(`/api/stocks/${stockId}/portfolio-analysis`, {
        method: "POST",
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "分析の生成に失敗しました")
      }

      const result = await response.json()
      setData(result)
      setError(null)
    } catch (err) {
      console.error("Error generating portfolio analysis:", err)
      alert(err instanceof Error ? err.message : "分析の生成に失敗しました")
    } finally {
      setGenerating(false)
    }
  }

  useEffect(() => {
    fetchAnalysis()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stockId])

  if (loading) {
    return (
      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="flex items-center justify-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="ml-3 text-sm text-gray-600">読み込み中...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="bg-gray-50 rounded-lg p-6 text-center">
          <div className="text-4xl mb-3">📊</div>
          <p className="text-sm text-gray-600">{error}</p>
        </div>
      </div>
    )
  }

  // データがない、または当日のデータでない場合は生成ボタンを表示
  if (!data || !data.shortTerm || !data.isToday) {
    return (
      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 text-center">
          <div className="text-4xl mb-3">📊</div>
          <p className="text-sm text-amber-800 mb-4">
            {data?.lastAnalysis
              ? "これは昨日の分析です。最新の分析を生成しますか？"
              : "まだAI分析がありません。今すぐ生成しますか？"}
          </p>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="px-4 py-2 bg-amber-600 text-white rounded-lg font-semibold text-sm hover:bg-amber-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {generating ? "生成中..." : "今日の分析を生成"}
          </button>
          {data?.lastAnalysis && (
            <p className="text-xs text-gray-500 mt-3">
              前回の分析: {new Date(data.lastAnalysis).toLocaleDateString("ja-JP", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="mt-4 pt-4 border-t border-gray-200">
      <div className="space-y-4">
        {/* 短期予測（今週） */}
        {data.shortTerm && (
          <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-lg shadow-md p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">📈</span>
              <h4 className="text-sm font-bold text-purple-800">短期予測（今週）</h4>
            </div>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{data.shortTerm}</p>
          </div>
        )}

        {/* 中期予測（今月） */}
        {data.mediumTerm && (
          <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg shadow-md p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">📊</span>
              <h4 className="text-sm font-bold text-blue-800">中期予測（今月）</h4>
            </div>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{data.mediumTerm}</p>
          </div>
        )}

        {/* 長期予測（今後3ヶ月） */}
        {data.longTerm && (
          <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-lg shadow-md p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">🎯</span>
              <h4 className="text-sm font-bold text-emerald-800">長期予測（今後3ヶ月）</h4>
            </div>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{data.longTerm}</p>
          </div>
        )}

        {/* 分析日時 */}
        {data.lastAnalysis && (
          <div className="text-center">
            <p className="text-xs text-gray-500">
              分析日時: {new Date(data.lastAnalysis).toLocaleDateString("ja-JP", {
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
