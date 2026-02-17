"use client"

import { useState, useEffect } from "react"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts"

type Period = "1m" | "3m" | "6m" | "1y"

interface HistoryItem {
  date: string
  totalValue: number
  unrealizedGain: number
  unrealizedGainPercent: number
}

interface HistoryData {
  history: HistoryItem[]
  period: string
}

const PERIOD_LABELS: Record<Period, string> = {
  "1m": "1ヶ月",
  "3m": "3ヶ月",
  "6m": "6ヶ月",
  "1y": "1年",
}

export default function PortfolioHistoryChart() {
  const [data, setData] = useState<HistoryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<Period>("1m")

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/portfolio/history?period=${period}`)
        if (res.ok) {
          const json = await res.json()
          setData(json)
        }
      } catch (error) {
        console.error("Failed to fetch history:", error)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [period])

  if (loading) {
    return (
      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg">📈</span>
          <h3 className="font-semibold">資産推移</h3>
        </div>
        <div className="h-64 bg-gray-100 rounded-lg animate-pulse" />
      </div>
    )
  }

  if (!data || data.history.length === 0) {
    return (
      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg">📈</span>
          <h3 className="font-semibold">資産推移</h3>
        </div>
        <div className="h-64 flex items-center justify-center text-gray-500">
          <div className="text-center">
            <p className="text-sm">まだデータがありません</p>
            <p className="text-xs text-gray-400 mt-1">
              毎日15:30以降に自動記録されます
            </p>
          </div>
        </div>
      </div>
    )
  }

  const formatValue = (value: number) => {
    if (value >= 10000) {
      return `${(value / 10000).toFixed(1)}万`
    }
    return `${Math.round(value).toLocaleString()}`
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return `${date.getMonth() + 1}/${date.getDate()}`
  }

  const formatFullDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`
  }

  // 最新と最初の比較
  const firstValue = data.history[0]?.totalValue || 0
  const lastValue = data.history[data.history.length - 1]?.totalValue || 0
  const change = lastValue - firstValue
  const changePercent = firstValue > 0 ? (change / firstValue) * 100 : 0

  return (
    <div className="bg-white rounded-lg border p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-lg">📈</span>
          <h3 className="font-semibold">資産推移</h3>
          {data.history.length > 1 && (
            <span
              className={`text-sm font-medium ${
                change >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {change >= 0 ? "+" : ""}
              {changePercent.toFixed(1)}%
            </span>
          )}
        </div>
        <div className="flex bg-gray-100 rounded-lg p-1">
          {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-2 py-1 text-xs rounded-md transition-colors ${
                period === p
                  ? "bg-white shadow text-gray-900"
                  : "text-gray-600"
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data.history}
            margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tickFormatter={formatValue}
              fontSize={11}
              tickLine={false}
              axisLine={false}
              width={50}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length > 0) {
                  const item = payload[0].payload as HistoryItem
                  return (
                    <div className="bg-white border rounded-lg shadow-lg p-3 text-sm">
                      <p className="text-gray-500 text-xs mb-1">
                        {formatFullDate(item.date)}
                      </p>
                      <p className="font-semibold">
                        {item.totalValue.toLocaleString()}円
                      </p>
                      <p
                        className={`text-xs ${
                          item.unrealizedGain >= 0
                            ? "text-green-600"
                            : "text-red-600"
                        }`}
                      >
                        含み損益: {item.unrealizedGain >= 0 ? "+" : ""}
                        {item.unrealizedGain.toLocaleString()}円 (
                        {item.unrealizedGainPercent >= 0 ? "+" : ""}
                        {item.unrealizedGainPercent.toFixed(1)}%)
                      </p>
                    </div>
                  )
                }
                return null
              }}
            />
            <ReferenceLine y={firstValue} stroke="#94a3b8" strokeDasharray="3 3" />
            <Line
              type="monotone"
              dataKey="totalValue"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: "#3b82f6" }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 pt-3 border-t text-xs text-gray-500 flex justify-between">
        <span>
          {formatFullDate(data.history[0]?.date || "")} 〜{" "}
          {formatFullDate(data.history[data.history.length - 1]?.date || "")}
        </span>
        <span>{data.history.length}日分</span>
      </div>
    </div>
  )
}
