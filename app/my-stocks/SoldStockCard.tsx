"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { getActionButtonClass, ACTION_BUTTON_LABELS, CARD_FOOTER_STYLES } from "@/lib/ui-config"
import CopyableTicker from "@/app/components/CopyableTicker"
import EditTransactionDialog from "./EditTransactionDialog"

interface Transaction {
  id: string
  type: string
  quantity: number
  price: number
  totalAmount: number
  transactionDate: string
  note: string | null
}

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
  currentPrice: number | null
  hypotheticalValue: number | null
  hypotheticalProfit: number | null
  hypotheticalProfitPercent: number | null
  transactions: Transaction[]
}

interface SoldStockCardProps {
  soldStock: SoldStock
  onAddToWatchlist?: (stockId: string, tickerCode: string, name: string) => void
  onRepurchase?: (stockId: string, tickerCode: string, name: string, market: string, sector: string | null) => void
  onTransactionUpdated?: () => void
}

function getHypotheticalComment(hypotheticalProfitPercent: number, actualProfitPercent: number): string {
  const diff = hypotheticalProfitPercent - actualProfitPercent

  if (diff > 20) {
    return "かなり早めの利確でした"
  } else if (diff > 5) {
    return "早めの利確でした"
  } else if (diff > -5) {
    return "適切なタイミングでした"
  } else if (diff > -20) {
    return "良いタイミングでした"
  } else {
    return "絶好のタイミングでした"
  }
}

export default function SoldStockCard({ soldStock, onAddToWatchlist, onRepurchase, onTransactionUpdated }: SoldStockCardProps) {
  const router = useRouter()
  const isProfit = soldStock.totalProfit >= 0
  const [showTransactions, setShowTransactions] = useState(false)
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null)
  const [openMenuTransactionId, setOpenMenuTransactionId] = useState<string | null>(null)

  const handleClick = () => {
    router.push(`/stocks/${soldStock.stockId}`)
  }

  const handleDeleteTransaction = async (transactionId: string) => {
    if (!confirm("この取引履歴を削除しますか？")) {
      return
    }

    try {
      const response = await fetch(`/api/transactions/${transactionId}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "削除に失敗しました")
      }

      toast.success("取引履歴を削除しました")
      onTransactionUpdated?.()
    } catch (err: any) {
      console.error(err)
      toast.error(err.message || "削除に失敗しました")
    }
  }

  return (
    <>
      <div
        onClick={handleClick}
        className="relative bg-white rounded-xl shadow-md hover:shadow-lg transition-all p-4 sm:p-6 cursor-pointer hover:bg-gray-50"
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

        {/* Hypothetical Section */}
        {soldStock.hypotheticalProfit !== null && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-sm">📊</span>
              <span className="text-xs sm:text-sm font-semibold text-gray-700">
                今も保有してたら
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">
                → {getHypotheticalComment(
                    soldStock.hypotheticalProfitPercent ?? 0,
                    soldStock.profitPercent
                  )}
              </span>
              <div className="text-right">
                <span
                  className={`text-sm sm:text-base font-bold ${
                    (soldStock.hypotheticalProfit ?? 0) >= 0
                      ? "text-green-600"
                      : "text-red-600"
                  }`}
                >
                  {(soldStock.hypotheticalProfit ?? 0) >= 0 ? "+" : ""}
                  ¥{(soldStock.hypotheticalProfit ?? 0).toLocaleString()}
                </span>
                <span
                  className={`ml-1 text-xs ${
                    (soldStock.hypotheticalProfitPercent ?? 0) >= 0
                      ? "text-green-600"
                      : "text-red-600"
                  }`}
                >
                  ({(soldStock.hypotheticalProfitPercent ?? 0) >= 0 ? "+" : ""}
                  {(soldStock.hypotheticalProfitPercent ?? 0).toFixed(1)}%)
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Transaction History (expandable) */}
        {soldStock.transactions.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <button
              onClick={(e) => {
                e.stopPropagation()
                setShowTransactions(!showTransactions)
              }}
              className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 hover:text-gray-900 transition-colors w-full"
            >
              <svg
                className={`w-4 h-4 transition-transform ${showTransactions ? "rotate-90" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              取引履歴 ({soldStock.transactions.length}件)
            </button>

            {showTransactions && (
              <div className="mt-3 space-y-2">
                {soldStock.transactions.map((transaction) => (
                  <div
                    key={transaction.id}
                    className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 text-xs font-semibold rounded ${
                          transaction.type === "buy"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-orange-100 text-orange-700"
                        }`}
                      >
                        {transaction.type === "buy" ? "買" : "売"}
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          {new Date(transaction.transactionDate).toLocaleDateString("ja-JP")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-sm font-semibold text-gray-900">
                          {transaction.quantity}株 @ ¥{transaction.price.toLocaleString()}
                        </p>
                        <p className="text-xs text-gray-500">
                          ¥{transaction.totalAmount.toLocaleString()}
                        </p>
                      </div>
                      <div className="relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setOpenMenuTransactionId(
                              openMenuTransactionId === transaction.id ? null : transaction.id
                            )
                          }}
                          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                          title="メニュー"
                        >
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                            <circle cx="12" cy="5" r="1.5" />
                            <circle cx="12" cy="12" r="1.5" />
                            <circle cx="12" cy="19" r="1.5" />
                          </svg>
                        </button>
                        {openMenuTransactionId === transaction.id && (
                          <>
                            <div
                              className="fixed inset-0 z-10"
                              onClick={(e) => {
                                e.stopPropagation()
                                setOpenMenuTransactionId(null)
                              }}
                            />
                            <div className="absolute right-0 top-8 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[100px]">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setSelectedTransaction(transaction)
                                  setOpenMenuTransactionId(null)
                                }}
                                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                              >
                                編集
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setOpenMenuTransactionId(null)
                                  handleDeleteTransaction(transaction.id)
                                }}
                                className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                              >
                                削除
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

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

      {/* Edit Transaction Dialog */}
      {selectedTransaction && (
        <EditTransactionDialog
          isOpen={true}
          onClose={() => setSelectedTransaction(null)}
          onSuccess={() => {
            setSelectedTransaction(null)
            onTransactionUpdated?.()
          }}
          transaction={selectedTransaction}
          stockName={soldStock.stock.name}
        />
      )}
    </>
  )
}
