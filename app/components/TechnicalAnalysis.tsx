"use client"

import { useEffect, useState } from "react"
import type {
  TechnicalIndicators,
  CandlestickPatternData,
  ChartPatternData,
  SignalType,
} from "@/lib/stock-analysis-data"

interface TechnicalAnalysisData {
  technicalIndicators: TechnicalIndicators
  candlestickPattern: CandlestickPatternData | null
  chartPatterns: ChartPatternData[]
  weekChange: {
    rate: number
    label: string
    isWarning: boolean
  } | null
}

interface Props {
  stockId: string
  embedded?: boolean
}

function SignalBadge({ signal, size = "sm" }: { signal: SignalType; size?: "sm" | "md" }) {
  const colors = {
    buy: "bg-green-100 text-green-700",
    sell: "bg-red-100 text-red-700",
    neutral: "bg-gray-100 text-gray-700",
  }
  const labels = {
    buy: "買い",
    sell: "売り",
    neutral: "中立",
  }
  const sizeClass = size === "md" ? "px-2.5 py-1 text-sm" : "px-2 py-0.5 text-xs"

  return (
    <span className={`${colors[signal]} ${sizeClass} font-semibold rounded-full`}>
      {labels[signal]}
    </span>
  )
}

function StrengthBar({ value, max = 100 }: { value: number; max?: number }) {
  const percent = Math.min((value / max) * 100, 100)
  const color =
    percent >= 70 ? "bg-green-500" :
    percent >= 40 ? "bg-yellow-500" :
    "bg-gray-400"

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} transition-all duration-300`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-xs text-gray-500 w-10 text-right">{value}%</span>
    </div>
  )
}

export default function TechnicalAnalysis({ stockId, embedded = false }: Props) {
  const [data, setData] = useState<TechnicalAnalysisData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        const response = await fetch(`/api/stocks/${stockId}/historical-prices?period=3m`)
        if (!response.ok) {
          throw new Error("データの取得に失敗しました")
        }
        const result = await response.json()
        setData(result.technicalAnalysis)
      } catch (err) {
        setError(err instanceof Error ? err.message : "エラーが発生しました")
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [stockId])

  if (loading) {
    return (
      <div className={embedded ? "" : "bg-white rounded-xl shadow-md p-4 sm:p-6"}>
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/3" />
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 rounded w-full" />
            <div className="h-4 bg-gray-200 rounded w-3/4" />
            <div className="h-4 bg-gray-200 rounded w-1/2" />
          </div>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className={embedded ? "" : "bg-white rounded-xl shadow-md p-4 sm:p-6"}>
        <p className="text-sm text-gray-500">テクニカル分析データを取得できませんでした</p>
      </div>
    )
  }

  const { technicalIndicators, candlestickPattern, chartPatterns, weekChange } = data

  return (
    <div className={embedded ? "" : "bg-white rounded-xl shadow-md p-4 sm:p-6"}>
      {!embedded && (
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg">📊</span>
          <h2 className="text-lg sm:text-xl font-bold text-gray-900">テクニカル分析</h2>
        </div>
      )}

      <div className="space-y-5">
        {/* RSI */}
        {technicalIndicators.rsi && (
          <div className="border-b border-gray-100 pb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-900">RSI</span>
                <span className="text-xs text-gray-500">(相対力指数)</span>
              </div>
              <SignalBadge signal={technicalIndicators.rsi.signal} />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-2xl font-bold text-gray-900">
                {technicalIndicators.rsi.value.toFixed(1)}
              </span>
              <div className="flex-1">
                <p className="text-sm text-gray-600">{technicalIndicators.rsi.label}</p>
                <p className="text-xs text-gray-500">{technicalIndicators.rsi.description}</p>
              </div>
            </div>
            {/* RSI ゲージ */}
            <div className="mt-2">
              <div className="relative h-2 bg-gradient-to-r from-green-400 via-gray-300 to-red-400 rounded-full">
                <div
                  className="absolute w-3 h-3 bg-gray-800 rounded-full -top-0.5 transform -translate-x-1/2 border-2 border-white shadow"
                  style={{ left: `${technicalIndicators.rsi.value}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>売られすぎ</span>
                <span>買われすぎ</span>
              </div>
            </div>
          </div>
        )}

        {/* MACD */}
        {technicalIndicators.macd && (
          <div className="border-b border-gray-100 pb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-900">MACD</span>
                <span className="text-xs text-gray-500">(トレンド指標)</span>
              </div>
              <span
                className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                  technicalIndicators.macd.trend === "bullish"
                    ? "bg-green-100 text-green-700"
                    : technicalIndicators.macd.trend === "bearish"
                    ? "bg-red-100 text-red-700"
                    : "bg-gray-100 text-gray-700"
                }`}
              >
                {technicalIndicators.macd.trend === "bullish" ? "上昇" : technicalIndicators.macd.trend === "bearish" ? "下落" : "横ばい"}
              </span>
            </div>
            <p className="text-sm text-gray-600">{technicalIndicators.macd.label}</p>
            {technicalIndicators.macd.histogram !== null && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-gray-500">ヒストグラム:</span>
                <span
                  className={`text-sm font-semibold ${
                    technicalIndicators.macd.histogram > 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {technicalIndicators.macd.histogram > 0 ? "+" : ""}
                  {technicalIndicators.macd.histogram.toFixed(2)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* ローソク足パターン */}
        {candlestickPattern && (
          <div className="border-b border-gray-100 pb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-900">ローソク足パターン</span>
              </div>
              <SignalBadge signal={candlestickPattern.signal} />
            </div>
            <p className="text-sm text-gray-700 mb-2">{candlestickPattern.description}</p>
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span>信頼度:</span>
              <div className="flex-1 max-w-32">
                <StrengthBar value={candlestickPattern.strength} />
              </div>
            </div>
            <div className="flex gap-4 mt-2 text-xs">
              <span className="text-green-600">
                直近5日の買いシグナル: {candlestickPattern.recentBuySignals}回
              </span>
              <span className="text-red-600">
                売りシグナル: {candlestickPattern.recentSellSignals}回
              </span>
            </div>
          </div>
        )}

        {/* チャートパターン */}
        {chartPatterns.length > 0 && (
          <div className="border-b border-gray-100 pb-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-semibold text-gray-900">チャートパターン</span>
              <span className="text-xs text-gray-500">(複数足フォーメーション)</span>
            </div>
            <div className="space-y-3">
              {chartPatterns.map((pattern, index) => (
                <div key={index} className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-gray-900">{pattern.name}</span>
                    <SignalBadge signal={pattern.signal} />
                  </div>
                  <p className="text-xs text-gray-600 mb-2">{pattern.description}</p>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span>信頼度:</span>
                    <div className="flex-1 max-w-24">
                      <StrengthBar value={pattern.reliability} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 週間変化率 */}
        {weekChange && (
          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-900">週間変化率</span>
              {weekChange.isWarning && (
                <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-700">
                  注意
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={`text-2xl font-bold ${
                  weekChange.rate >= 0 ? "text-green-600" : "text-red-600"
                }`}
              >
                {weekChange.rate >= 0 ? "+" : ""}
                {weekChange.rate.toFixed(1)}%
              </span>
              <span className="text-sm text-gray-500">({weekChange.label})</span>
            </div>
          </div>
        )}

        {/* データがない場合 */}
        {!technicalIndicators.rsi && !technicalIndicators.macd && !candlestickPattern && chartPatterns.length === 0 && (
          <p className="text-sm text-gray-500">分析に必要なデータが不足しています</p>
        )}
      </div>
    </div>
  )
}
