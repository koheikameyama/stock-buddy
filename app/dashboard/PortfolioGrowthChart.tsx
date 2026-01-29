"use client"

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"

interface PortfolioSnapshot {
  date: string
  totalValue: number
  gainLossPct: number
}

interface PortfolioGrowthChartProps {
  snapshots: PortfolioSnapshot[]
}

export default function PortfolioGrowthChart({ snapshots }: PortfolioGrowthChartProps) {
  if (snapshots.length === 0) {
    return (
      <div className="bg-white rounded-xl p-6 shadow-md">
        <h3 className="text-lg font-bold text-gray-900 mb-4">📈 成長グラフ</h3>
        <div className="text-center py-12 text-gray-500">
          <p>まだデータがありません</p>
          <p className="text-sm mt-2">明日から記録が始まります</p>
        </div>
      </div>
    )
  }

  // データを整形（日付を見やすく）
  const chartData = snapshots.map((snapshot) => ({
    date: new Date(snapshot.date).toLocaleDateString("ja-JP", { month: "M", day: "d" }),
    評価額: Math.round(snapshot.totalValue),
    損益率: Number(snapshot.gainLossPct.toFixed(2)),
  }))

  const latestSnapshot = snapshots[snapshots.length - 1]
  const isProfit = latestSnapshot.gainLossPct >= 0

  return (
    <div className="bg-white rounded-xl p-6 shadow-md">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-bold text-gray-900">📈 成長グラフ</h3>
        <div className="text-right">
          <p className="text-sm text-gray-500">現在の評価額</p>
          <p className="text-2xl font-bold text-gray-900">
            {latestSnapshot.totalValue.toLocaleString()}円
          </p>
          <p className={`text-sm font-semibold ${isProfit ? "text-green-600" : "text-red-600"}`}>
            {isProfit ? "+" : ""}
            {latestSnapshot.gainLossPct.toFixed(2)}%
          </p>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12, fill: "#6b7280" }}
            stroke="#e5e7eb"
          />
          <YAxis
            tick={{ fontSize: 12, fill: "#6b7280" }}
            stroke="#e5e7eb"
            tickFormatter={(value) => `${(value / 10000).toFixed(0)}万`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: "8px",
              padding: "8px",
            }}
            labelStyle={{ color: "#374151", fontWeight: "bold" }}
            formatter={(value: number, name: string) => {
              if (name === "評価額") {
                return [`${value.toLocaleString()}円`, "評価額"]
              }
              return [`${value}%`, "損益率"]
            }}
          />
          <Line
            type="monotone"
            dataKey="評価額"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={{ fill: "#3b82f6", r: 4 }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>

      <p className="text-xs text-gray-500 mt-4 text-center">
        過去{snapshots.length}日間の推移
      </p>
    </div>
  )
}
