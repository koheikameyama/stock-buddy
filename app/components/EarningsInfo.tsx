"use client"

interface EarningsData {
  isProfitable?: boolean | null
  profitTrend?: string | null
  revenueGrowth?: number | null
  netIncomeGrowth?: number | null
  eps?: number | null
  latestRevenue?: number | null
  latestNetIncome?: number | null
}

interface EarningsInfoProps {
  earnings: EarningsData
  embedded?: boolean
}

function formatLargeNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-"
  const absValue = Math.abs(value)
  if (absValue >= 1_000_000_000_000) {
    return `${(value / 1_000_000_000_000).toFixed(2)}兆円`
  }
  if (absValue >= 100_000_000) {
    return `${(value / 100_000_000).toFixed(0)}億円`
  }
  return `${value.toLocaleString()}円`
}

function getProfitTrendLabel(trend: string | null | undefined): string {
  if (trend === "increasing") return "増益"
  if (trend === "decreasing") return "減益"
  if (trend === "stable") return "横ばい"
  return "-"
}

function getProfitTrendColor(trend: string | null | undefined): string {
  if (trend === "increasing") return "text-green-600"
  if (trend === "decreasing") return "text-red-600"
  return "text-gray-600"
}

export default function EarningsInfo({ earnings, embedded = false }: EarningsInfoProps) {
  const {
    isProfitable,
    profitTrend,
    revenueGrowth,
    netIncomeGrowth,
    eps,
    latestRevenue,
    latestNetIncome,
  } = earnings

  const hasAnyData =
    isProfitable !== null &&
    isProfitable !== undefined

  if (!hasAnyData) {
    return null
  }

  const wrapperClass = embedded
    ? "mt-6"
    : "bg-white rounded-xl shadow-md p-4 sm:p-6 mb-6"

  return (
    <section className={wrapperClass}>
      <div className="mb-4">
        <h2 className="text-lg sm:text-xl font-bold text-gray-900">
          業績情報
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          直近の決算データ
        </p>
      </div>

      {/* 損益状況 */}
      <div className="mb-4">
        <div
          className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg ${
            isProfitable
              ? "bg-green-50 border border-green-200"
              : "bg-red-50 border border-red-200"
          }`}
        >
          <span className="text-lg">{isProfitable ? "📈" : "⚠️"}</span>
          <span
            className={`font-bold ${
              isProfitable ? "text-green-700" : "text-red-700"
            }`}
          >
            {isProfitable ? "黒字" : "赤字"}
          </span>
          {profitTrend && (
            <span className={`text-sm font-medium ${getProfitTrendColor(profitTrend)}`}>
              （{getProfitTrendLabel(profitTrend)}）
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* 売上高 */}
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-sm font-semibold text-gray-900">売上高</span>
            <span className="text-xs text-gray-500">(Revenue)</span>
          </div>
          <p className="text-xl font-bold text-gray-900 mb-1">
            {formatLargeNumber(latestRevenue)}
          </p>
          {revenueGrowth !== null && revenueGrowth !== undefined && (
            <p
              className={`text-sm font-medium ${
                revenueGrowth >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              前年比 {revenueGrowth >= 0 ? "+" : ""}
              {revenueGrowth.toFixed(1)}%
            </p>
          )}
        </div>

        {/* 純利益 */}
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-sm font-semibold text-gray-900">純利益</span>
            <span className="text-xs text-gray-500">(Net Income)</span>
          </div>
          <p className="text-xl font-bold text-gray-900 mb-1">
            {formatLargeNumber(latestNetIncome)}
          </p>
          {netIncomeGrowth !== null && netIncomeGrowth !== undefined && (
            <p
              className={`text-sm font-medium ${
                netIncomeGrowth >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              前年比 {netIncomeGrowth >= 0 ? "+" : ""}
              {netIncomeGrowth.toFixed(1)}%
            </p>
          )}
        </div>

        {/* EPS */}
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-sm font-semibold text-gray-900">1株利益</span>
            <span className="text-xs text-gray-500">(EPS)</span>
          </div>
          <p className="text-xl font-bold text-gray-900 mb-1">
            {eps !== null && eps !== undefined ? `¥${eps.toFixed(2)}` : "-"}
          </p>
          <p className="text-xs text-gray-500">
            {eps !== null && eps !== undefined
              ? eps > 0
                ? "1株あたりの利益"
                : "1株あたりの損失"
              : "データがありません"}
          </p>
        </div>

        {/* 利益トレンド */}
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-sm font-semibold text-gray-900">利益傾向</span>
            <span className="text-xs text-gray-500">(Trend)</span>
          </div>
          <p className={`text-xl font-bold mb-1 ${getProfitTrendColor(profitTrend)}`}>
            {getProfitTrendLabel(profitTrend)}
          </p>
          <p className="text-xs text-gray-500">
            {profitTrend === "increasing"
              ? "前年より利益が増加"
              : profitTrend === "decreasing"
                ? "前年より利益が減少"
                : profitTrend === "stable"
                  ? "前年とほぼ同水準"
                  : "データがありません"}
          </p>
        </div>
      </div>

      {/* 赤字警告 */}
      {!isProfitable && (
        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start gap-2">
            <span className="text-amber-500">⚠️</span>
            <div>
              <p className="text-sm font-semibold text-amber-800">注意</p>
              <p className="text-xs text-amber-700 mt-1">
                この銘柄は直近決算で赤字です。投資する場合は、赤字の原因や今後の見通しを確認することをおすすめします。
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
