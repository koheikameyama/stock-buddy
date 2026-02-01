import FinancialMetricTooltip from "./FinancialMetricTooltip"

interface Stock {
  pbr?: number | null
  per?: number | null
  roe?: number | null
  operatingCF?: number | null
  freeCF?: number | null
  currentPrice?: number | null
  fiftyTwoWeekHigh?: number | null
  fiftyTwoWeekLow?: number | null
}

interface FinancialMetricsProps {
  stock: Stock
}

export default function FinancialMetrics({ stock }: FinancialMetricsProps) {
  // 数値をフォーマット
  const formatNumber = (num: number | null | undefined) => {
    if (num === null || num === undefined) return null
    return num.toLocaleString()
  }

  // 大きな数値を億円単位に変換
  const formatCashflow = (num: number | null | undefined) => {
    if (num === null || num === undefined) return null
    const oku = num / 100000000
    return `${oku.toFixed(0)}億円`
  }

  // パーセントをフォーマット
  const formatPercent = (num: number | null | undefined) => {
    if (num === null || num === undefined) return null
    return `${(num * 100).toFixed(2)}%`
  }

  return (
    <div className="bg-gray-50 rounded-lg p-4 space-y-3">
      <h3 className="text-sm font-bold text-gray-900 mb-3">財務指標</h3>

      <div className="grid grid-cols-2 gap-3">
        <FinancialMetricTooltip
          label="PBR"
          value={stock.pbr?.toFixed(2)}
          description="株価純資産倍率（Price to Book Ratio）。会社の純資産に対して、株価が何倍になっているかを示します。"
          howToRead="一般的に1倍未満は割安、3倍以上は割高とされますが、業種によって基準が異なります。成長企業は高くなりがちです。"
        />

        <FinancialMetricTooltip
          label="PER"
          value={stock.per?.toFixed(2)}
          description="株価収益率（Price to Earnings Ratio）。会社の利益に対して、株価が何倍になっているかを示します。"
          howToRead="一般的に15倍前後が適正とされますが、成長企業は高くなります。同業他社と比較することが重要です。"
        />

        <FinancialMetricTooltip
          label="ROE"
          value={formatPercent(stock.roe)}
          description="自己資本利益率（Return on Equity）。株主が出資したお金をどれだけ効率的に使って利益を出しているかを示します。"
          howToRead="10%以上が優良とされ、15%以上なら非常に優秀です。高いほど経営効率が良いと言えます。"
        />

        <FinancialMetricTooltip
          label="営業CF"
          value={formatCashflow(stock.operatingCF)}
          description="営業キャッシュフロー。本業でどれだけ現金を稼いでいるかを示します。"
          howToRead="プラスで大きいほど良く、マイナスの場合は注意が必要です。利益は黒字でもCFが赤字の場合があります。"
        />

        <FinancialMetricTooltip
          label="フリーCF"
          value={formatCashflow(stock.freeCF)}
          description="フリーキャッシュフロー。会社が自由に使えるお金がどれだけあるかを示します。"
          howToRead="プラスで大きいほど財務が健全です。この資金で配当や新規投資ができます。"
        />

        <FinancialMetricTooltip
          label="現在株価"
          value={stock.currentPrice ? `¥${formatNumber(stock.currentPrice)}` : null}
          description="現在の株価です。"
          howToRead="52週高値・安値と比較して、今が割安か割高かの参考になります。"
        />
      </div>

      {stock.fiftyTwoWeekHigh && stock.fiftyTwoWeekLow && (
        <div className="pt-3 border-t border-gray-200">
          <p className="text-xs text-gray-600 mb-1">52週レンジ</p>
          <p className="text-sm text-gray-900">
            ¥{formatNumber(stock.fiftyTwoWeekLow)} 〜 ¥
            {formatNumber(stock.fiftyTwoWeekHigh)}
          </p>
        </div>
      )}
    </div>
  )
}
