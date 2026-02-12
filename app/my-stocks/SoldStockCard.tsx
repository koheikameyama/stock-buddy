"use client"

interface SoldStock {
  id: string
  stockId: string
  stock: {
    id: string
    tickerCode: string
    name: string
    sector: string | null
    market: string
  }
  firstPurchaseDate: string
  lastSellDate: string
  totalBuyQuantity: number
  totalBuyAmount: number
  totalSellAmount: number
  totalProfit: number
  profitPercent: number
  transactions: {
    id: string
    type: string
    quantity: number
    price: number
    totalAmount: number
    transactionDate: string
    note: string | null
  }[]
}

interface SoldStockCardProps {
  soldStock: SoldStock
  onAddToWatchlist?: (stockId: string, tickerCode: string, name: string) => void
  onRepurchase?: (stockId: string, tickerCode: string, name: string, market: string, sector: string | null) => void
}

export default function SoldStockCard({ soldStock, onAddToWatchlist, onRepurchase }: SoldStockCardProps) {
  const isProfit = soldStock.totalProfit >= 0

  return (
    <div className="bg-white rounded-xl shadow-md p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-3 sm:mb-4">
        <div>
          <div className="flex items-center gap-2 sm:gap-3 mb-1">
            <h3 className="text-lg sm:text-xl font-bold text-gray-900">
              {soldStock.stock.name}
            </h3>
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                isProfit
                  ? "bg-green-50 text-green-700"
                  : "bg-red-50 text-red-700"
              }`}
            >
              {isProfit ? "利益確定" : "損切り"}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-gray-500">
            {soldStock.stock.tickerCode}
            {soldStock.stock.sector && ` • ${soldStock.stock.sector}`}
          </p>
        </div>
      </div>

      {/* Period */}
      <div className="text-xs sm:text-sm text-gray-600 mb-3">
        <span>
          {new Date(soldStock.firstPurchaseDate).toLocaleDateString("ja-JP")}
          {" ~ "}
          {new Date(soldStock.lastSellDate).toLocaleDateString("ja-JP")}
        </span>
        <span className="ml-2">• {soldStock.totalBuyQuantity}株</span>
      </div>

      {/* Amounts */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-3">
        <div>
          <span className="text-xs sm:text-sm text-gray-600 block">購入金額</span>
          <span className="text-base sm:text-lg font-bold text-gray-900">
            ¥{soldStock.totalBuyAmount.toLocaleString()}
          </span>
        </div>
        <div>
          <span className="text-xs sm:text-sm text-gray-600 block">売却金額</span>
          <span className="text-base sm:text-lg font-bold text-gray-900">
            ¥{soldStock.totalSellAmount.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Profit/Loss */}
      <div
        className={`rounded-lg p-3 sm:p-4 ${
          isProfit
            ? "bg-gradient-to-r from-green-50 to-emerald-50"
            : "bg-gradient-to-r from-red-50 to-rose-50"
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs sm:text-sm text-gray-600">損益</span>
          <div className="text-right">
            <span
              className={`text-lg sm:text-xl font-bold ${
                isProfit ? "text-green-600" : "text-red-600"
              }`}
            >
              {soldStock.totalProfit >= 0 ? "+" : ""}
              ¥{soldStock.totalProfit.toLocaleString()}
            </span>
            <span
              className={`ml-2 text-sm ${
                isProfit ? "text-green-600" : "text-red-600"
              }`}
            >
              ({soldStock.profitPercent >= 0 ? "+" : ""}
              {soldStock.profitPercent.toFixed(1)}%)
            </span>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      {(onAddToWatchlist || onRepurchase) && (
        <div className="flex gap-2 mt-4 pt-4 border-t border-gray-200">
          {onAddToWatchlist && (
            <button
              onClick={() => onAddToWatchlist(soldStock.stockId, soldStock.stock.tickerCode, soldStock.stock.name)}
              className="flex-1 px-3 py-2 text-sm font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
            >
              気になるに追加
            </button>
          )}
          {onRepurchase && (
            <button
              onClick={() => onRepurchase(soldStock.stockId, soldStock.stock.tickerCode, soldStock.stock.name, soldStock.stock.market, soldStock.stock.sector)}
              className="flex-1 px-3 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              再購入する
            </button>
          )}
        </div>
      )}
    </div>
  )
}
