"use client"

interface PassedStock {
  id: string
  stockId: string
  stock: {
    id: string
    tickerCode: string
    name: string
    sector: string | null
  }
  passedAt: string
  passedPrice: number
  passedReason: string | null
  source: string
  currentPrice: number | null
  priceChangePercent: number | null
  whatIfProfit: number | null
  whatIfQuantity: number | null
  wasGoodDecision: boolean | null
  feedbackNote: string | null
}

interface PassedStockCardProps {
  passedStock: PassedStock
  onRemove: (id: string) => void
}

export default function PassedStockCard({ passedStock, onRemove }: PassedStockCardProps) {
  const priceChange = passedStock.priceChangePercent || 0
  const whatIfProfit = passedStock.whatIfProfit || 0
  const isPositive = priceChange >= 0

  return (
    <div className="bg-white rounded-xl shadow-md p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-3 sm:mb-4">
        <div>
          <div className="flex items-center gap-2 sm:gap-3 mb-1">
            <h3 className="text-lg sm:text-xl font-bold text-gray-900">
              {passedStock.stock.name}
            </h3>
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                isPositive
                  ? "bg-red-50 text-red-700"
                  : "bg-green-50 text-green-700"
              }`}
            >
              {isPositive ? "値上がり" : "見送り正解"}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-gray-500">
            {passedStock.stock.tickerCode}
            {passedStock.stock.sector && ` • ${passedStock.stock.sector}`}
          </p>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onRemove(passedStock.id)
          }}
          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
          title="追跡を解除"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Info */}
      <div className="space-y-3">
        {/* Passed Date & Reason */}
        <div className="text-xs sm:text-sm text-gray-600">
          <span>見送り日: {new Date(passedStock.passedAt).toLocaleDateString("ja-JP")}</span>
          {passedStock.passedReason && (
            <span className="ml-2">• 理由: {passedStock.passedReason}</span>
          )}
        </div>

        {/* Price Comparison */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <div>
            <span className="text-xs sm:text-sm text-gray-600 block">見送り時</span>
            <span className="text-base sm:text-lg font-bold text-gray-900">
              ¥{passedStock.passedPrice.toLocaleString()}
            </span>
          </div>
          <div>
            <span className="text-xs sm:text-sm text-gray-600 block">現在</span>
            <span className="text-base sm:text-lg font-bold text-gray-900">
              ¥{passedStock.currentPrice?.toLocaleString() || "-"}
            </span>
          </div>
        </div>

        {/* Change & What-If */}
        <div
          className={`rounded-lg p-3 sm:p-4 ${
            isPositive
              ? "bg-gradient-to-r from-red-50 to-rose-50"
              : "bg-gradient-to-r from-green-50 to-emerald-50"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs sm:text-sm text-gray-600">騰落率</span>
            <span
              className={`text-lg sm:text-xl font-bold ${
                isPositive ? "text-red-600" : "text-green-600"
              }`}
            >
              {priceChange >= 0 ? "+" : ""}
              {priceChange.toFixed(1)}%
            </span>
          </div>

          {passedStock.whatIfQuantity && (
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-200">
              <span className="text-xs sm:text-sm text-gray-600">
                {passedStock.whatIfQuantity}株買っていたら
              </span>
              <span
                className={`text-sm sm:text-base font-bold ${
                  isPositive ? "text-red-600" : "text-green-600"
                }`}
              >
                {whatIfProfit >= 0 ? "+" : ""}
                ¥{whatIfProfit.toLocaleString()}
              </span>
            </div>
          )}

          {/* Feedback */}
          <p className="mt-2 pt-2 border-t border-gray-200 text-xs sm:text-sm">
            {isPositive ? (
              <span className="text-red-700">
                買っていれば利益が出ていました。次回は良いタイミングを逃さないようにしましょう。
              </span>
            ) : (
              <span className="text-green-700">
                見送り正解！ 株価は下がっています。良い判断でした。
              </span>
            )}
          </p>
        </div>
      </div>
    </div>
  )
}
