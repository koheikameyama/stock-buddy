"use client"

interface Stock {
  pbr?: number | null
  per?: number | null
  roe?: number | null
  operatingCF?: number | null
  freeCF?: number | null
}

interface FinancialMetricsProps {
  stock: Stock
  embedded?: boolean
}

interface MetricCardProps {
  label: string
  technicalName: string
  value: string
  hint: string
}

function MetricCard({ label, technicalName, value, hint }: MetricCardProps) {
  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-sm font-semibold text-gray-900">{label}</span>
        <span className="text-xs text-gray-500">({technicalName})</span>
      </div>
      <p className="text-xl font-bold text-gray-900 mb-1">{value}</p>
      <p className="text-xs text-gray-500">{hint}</p>
    </div>
  )
}

function formatCashFlow(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-"
  const absValue = Math.abs(value)
  if (absValue >= 1_000_000_000_000) {
    return `${(value / 1_000_000_000_000).toFixed(1)}兆円`
  }
  if (absValue >= 100_000_000) {
    return `${(value / 100_000_000).toFixed(0)}億円`
  }
  if (absValue >= 10_000) {
    return `${(value / 10_000).toFixed(0)}万円`
  }
  return `${value.toLocaleString()}円`
}

export default function FinancialMetrics({ stock, embedded = false }: FinancialMetricsProps) {
  const { pbr, per, roe, operatingCF, freeCF } = stock
  const hasAnyData =
    pbr !== null &&
    pbr !== undefined ||
    per !== null &&
    per !== undefined ||
    roe !== null &&
    roe !== undefined ||
    operatingCF !== null &&
    operatingCF !== undefined ||
    freeCF !== null &&
    freeCF !== undefined

  if (!hasAnyData) {
    return null
  }

  const wrapperClass = embedded
    ? ""
    : "bg-white rounded-xl shadow-md p-4 sm:p-6 mb-6"

  return (
    <section className={wrapperClass}>
      <div className="mb-4">
        <h2 className="text-lg sm:text-xl font-bold text-gray-900">
          財務指標
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          この銘柄の健全性をチェック
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <MetricCard
          label="割安度"
          technicalName="PBR"
          value={pbr !== null && pbr !== undefined ? `${pbr.toFixed(2)}倍` : "-"}
          hint={pbr !== null && pbr !== undefined ? "1倍以下なら割安の可能性" : "データがありません"}
        />

        <MetricCard
          label="収益性"
          technicalName="PER"
          value={per !== null && per !== undefined ? `${per.toFixed(2)}倍` : "-"}
          hint={per !== null && per !== undefined ? "15倍以下なら割安傾向" : "データがありません"}
        />

        <MetricCard
          label="稼ぐ力"
          technicalName="ROE"
          value={roe !== null && roe !== undefined ? `${roe.toFixed(2)}%` : "-"}
          hint={roe !== null && roe !== undefined ? "10%以上なら優秀" : "データがありません"}
        />

        <MetricCard
          label="本業の稼ぎ"
          technicalName="営業CF"
          value={formatCashFlow(operatingCF)}
          hint={operatingCF !== null && operatingCF !== undefined ? "プラスなら健全" : "データがありません"}
        />

        <MetricCard
          label="自由に使えるお金"
          technicalName="フリーCF"
          value={formatCashFlow(freeCF)}
          hint={freeCF !== null && freeCF !== undefined ? "プラスなら余裕あり" : "データがありません"}
        />
      </div>
    </section>
  )
}
