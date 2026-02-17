"use client"

import { useRouter } from "next/navigation"
import { getActionButtonClass, ACTION_BUTTON_LABELS, CARD_FOOTER_STYLES } from "@/lib/ui-config"
import CopyableTicker from "@/app/components/CopyableTicker"

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
  const router = useRouter()
  const isProfit = soldStock.totalProfit >= 0

  const handleClick = () => {
    router.push(`/stocks/${soldStock.stockId}`)
  }

  return (
    <div
      onClick={handleClick}
      className="bg-white rounded-xl shadow-md hover:shadow-lg transition-all p-4 sm:p-6 cursor-pointer hover:bg-gray-50"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          handleClick()
        }
      }}
    >
      {/* バッジ - 右上固定 */}
      <span
        className={`absolute top-3 right-3 sm:top-4 sm:right-4 px-2 py-0.5 rounded-full text-xs font-semibold ${
          isProfit
            ? "bg-green-50 text-green-700"
            : "bg-red-50 text-red-700"
        }`}
      >
        {isProfit ? "利益確定" : "損切り"}
      </span>

      {/* Header */}
      <div className="mb-3 sm:mb-4 pr-20">
        <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-1">
          {soldStock.stock.name}
        </h3>
        <p className="text-xs sm:text-sm text-gray-500">
          <CopyableTicker tickerCode={soldStock.stock.tickerCode} />
          {soldStock.stock.sector && ` • ${soldStock.stock.sector}`}
        </p>
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

      {/* Footer: Actions + Detail Link */}
      <div className={CARD_FOOTER_STYLES.container}>
        {/* Action Buttons */}
        <div className={CARD_FOOTER_STYLES.actionGroup}>
          {onAddToWatchlist && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onAddToWatchlist(soldStock.stockId, soldStock.stock.tickerCode, soldStock.stock.name)
              }}
              className={getActionButtonClass("watchlist")}
            >
              {ACTION_BUTTON_LABELS.watchlist}
            </button>
          )}
          {onRepurchase && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onRepurchase(soldStock.stockId, soldStock.stock.tickerCode, soldStock.stock.name, soldStock.stock.market, soldStock.stock.sector)
              }}
              className={getActionButtonClass("purchase")}
            >
              {ACTION_BUTTON_LABELS.purchase}
            </button>
          )}
        </div>

        {/* Detail Link */}
        <div className={CARD_FOOTER_STYLES.detailLink}>
          <span className={CARD_FOOTER_STYLES.detailLinkText}>詳細を見る</span>
          <svg
            className="w-4 h-4 ml-1"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </div>
      </div>
    </div>
  )
}
