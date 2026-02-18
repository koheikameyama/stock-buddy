"use client"

import { useEffect, useState } from "react"
import { BETA_THRESHOLDS } from "@/lib/constants"

interface BetaData {
  beta: number
  correlation: number
  dataPoints: number
}

interface MarketCorrelationMetricsProps {
  stockId: string
  embedded?: boolean
}

function getBetaLabel(beta: number): { label: string; color: string; bg: string; hint: string } {
  if (beta >= BETA_THRESHOLDS.HIGHLY_AGGRESSIVE) {
    return {
      label: "積極型",
      color: "text-red-700",
      bg: "bg-red-50",
      hint: "市場全体より大きく動く傾向。上昇相場で有利だが、下落時のリスクも高い",
    }
  }
  if (beta >= BETA_THRESHOLDS.AGGRESSIVE) {
    return {
      label: "市場連動型",
      color: "text-orange-700",
      bg: "bg-orange-50",
      hint: "市場と同程度以上に動く。日経平均と一緒に上下しやすい",
    }
  }
  if (beta >= BETA_THRESHOLDS.DEFENSIVE) {
    return {
      label: "安定型",
      color: "text-blue-700",
      bg: "bg-blue-50",
      hint: "市場より小さく動く。日経平均が下がっても影響を受けにくい",
    }
  }
  if (beta >= 0) {
    return {
      label: "超安定型",
      color: "text-green-700",
      bg: "bg-green-50",
      hint: "市場とほぼ連動しない。景気に左右されにくいディフェンシブ銘柄",
    }
  }
  return {
    label: "逆相関型",
    color: "text-purple-700",
    bg: "bg-purple-50",
    hint: "市場が下がると上がる傾向。相場の逆張り・ヘッジとして機能することがある",
  }
}

export default function MarketCorrelationMetrics({
  stockId,
  embedded = false,
}: MarketCorrelationMetricsProps) {
  const [data, setData] = useState<BetaData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch(`/api/stocks/${stockId}/beta`)
      .then((r) => {
        if (!r.ok) throw new Error()
        return r.json()
      })
      .then((d: BetaData) => setData(d))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [stockId])

  const wrapperClass = embedded
    ? ""
    : "bg-white rounded-xl shadow-md p-4 sm:p-6 mb-6"

  if (loading) {
    return (
      <div className={wrapperClass}>
        <div className="mb-4">
          <h2 className="text-lg sm:text-xl font-bold text-gray-900">市場連動性</h2>
          <p className="text-sm text-gray-500 mt-1">日経平均との相関を分析中...</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="bg-gray-50 rounded-lg p-4 animate-pulse h-24" />
          <div className="bg-gray-50 rounded-lg p-4 animate-pulse h-24" />
        </div>
      </div>
    )
  }

  if (error || !data) {
    return null
  }

  const betaInfo = getBetaLabel(data.beta)
  const correlationPercent = Math.round(Math.abs(data.correlation) * 100)

  return (
    <section className={wrapperClass}>
      <div className="mb-4">
        <h2 className="text-lg sm:text-xl font-bold text-gray-900">市場連動性</h2>
        <p className="text-sm text-gray-500 mt-1">
          日経平均と比べてどう動くか（過去1年間）
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Beta Value */}
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-sm font-semibold text-gray-900">日経平均連動率</span>
            <span className="text-xs text-gray-500">(ベータ値)</span>
          </div>
          <div className="flex items-center gap-2 mb-2">
            <p className="text-xl font-bold text-gray-900">{data.beta.toFixed(2)}</p>
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded-full ${betaInfo.bg} ${betaInfo.color}`}
            >
              {betaInfo.label}
            </span>
          </div>
          <p className="text-xs text-gray-500">{betaInfo.hint}</p>
          <p className="text-xs text-gray-400 mt-1">
            例: ベータ1.5 → 日経+10%のとき約+15%動く
          </p>
        </div>

        {/* Correlation */}
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-sm font-semibold text-gray-900">日経との相関度</span>
            <span className="text-xs text-gray-500">(相関係数)</span>
          </div>
          <p className="text-xl font-bold text-gray-900 mb-1">
            {correlationPercent}%
          </p>
          <p className="text-xs text-gray-500">
            {correlationPercent >= 70
              ? "日経平均と強く連動している。市場全体の影響を受けやすい"
              : correlationPercent >= 40
              ? "日経平均とある程度連動している"
              : "日経平均との連動が弱い。独自の値動きをしやすい"}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            過去{data.dataPoints}営業日のデータで算出
          </p>
        </div>
      </div>
    </section>
  )
}
