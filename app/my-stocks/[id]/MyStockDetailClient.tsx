"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import StockPrediction from "@/app/components/StockPrediction"
import PurchaseRecommendation from "@/app/components/PurchaseRecommendation"
import PortfolioAnalysis from "@/app/components/PortfolioAnalysis"
import FinancialMetrics from "@/app/components/FinancialMetrics"
import StockChart from "@/app/components/StockChart"
import PriceHistory from "@/app/components/PriceHistory"
import StockChat from "@/app/components/StockChat"
import EditTransactionDialog from "../EditTransactionDialog"
import AdditionalPurchaseDialog from "../AdditionalPurchaseDialog"

interface Transaction {
  id: string
  type: string
  quantity: number
  price: number
  totalAmount: number
  transactionDate: string
  note: string | null
}

interface Stock {
  id: string
  stockId: string
  type: "portfolio" | "watchlist"
  quantity?: number
  averagePurchasePrice?: number
  purchaseDate?: string
  transactions?: Transaction[]
  addedReason?: string | null
  alertPrice?: number | null
  note?: string | null
  stock: {
    id: string
    tickerCode: string
    name: string
    sector: string | null
    market: string
    currentPrice: number | null
    fiftyTwoWeekHigh: number | null
    fiftyTwoWeekLow: number | null
    pbr: number | null
    per: number | null
    roe: number | null
    operatingCF: number | null
    freeCF: number | null
  }
}

interface StockPrice {
  currentPrice: number
  previousClose: number
  change: number
  changePercent: number
}

export default function MyStockDetailClient({ stock }: { stock: Stock }) {
  const router = useRouter()
  const [price, setPrice] = useState<StockPrice | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null)
  const [showTransactionDialog, setShowTransactionDialog] = useState(false)
  const [transactionType, setTransactionType] = useState<"buy" | "sell">("buy")

  const isPortfolio = stock.type === "portfolio"
  const currentPrice = price?.currentPrice || stock.stock.currentPrice || 0
  const quantity = stock.quantity || 0
  const averagePrice = stock.averagePurchasePrice || 0

  // Calculate profit/loss for portfolio
  const totalCost = averagePrice * quantity
  const currentValue = currentPrice * quantity
  const profit = currentValue - totalCost
  const profitPercent = totalCost > 0 ? (profit / totalCost) * 100 : 0

  // Fetch current price
  useEffect(() => {
    async function fetchPrice() {
      try {
        const response = await fetch("/api/stocks/prices")
        if (!response.ok) throw new Error("Failed to fetch price")

        const data = await response.json()
        const priceData = data.prices.find(
          (p: any) => p.tickerCode === stock.stock.tickerCode
        )
        if (priceData) {
          setPrice(priceData)
        }
      } catch (err) {
        console.error("Error fetching price:", err)
      } finally {
        setLoading(false)
      }
    }

    fetchPrice()
  }, [stock.stock.tickerCode])

  const handleDelete = async () => {
    if (!confirm(`${stock.stock.name}を削除しますか？`)) {
      return
    }

    try {
      const response = await fetch(`/api/user-stocks/${stock.id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "削除に失敗しました")
      }

      // Redirect back to my-stocks list
      router.push("/my-stocks")
    } catch (err: any) {
      console.error(err)
      alert(err.message || "削除に失敗しました")
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-blue-50 pb-8">
      <div className="max-w-4xl mx-auto px-3 sm:px-6 py-4 sm:py-8">
        {/* Back Button */}
        <button
          onClick={() => router.push("/my-stocks")}
          className="mb-4 sm:mb-6 flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          <span className="text-sm sm:text-base font-semibold">戻る</span>
        </button>

        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
            {stock.stock.name}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {stock.stock.tickerCode}
            {stock.stock.sector && ` • ${stock.stock.sector}`}
          </p>
        </div>

        {/* Portfolio Stock Details */}
        {isPortfolio && (
          <>
            {/* Current Status Section */}
            <section className="bg-white rounded-xl shadow-md p-4 sm:p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg sm:text-xl font-bold text-gray-900">
                  現在の状況
                </h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setTransactionType("buy")
                      setShowTransactionDialog(true)
                    }}
                    className="px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded transition-colors"
                  >
                    +追加購入
                  </button>
                  <button
                    onClick={() => {
                      setTransactionType("sell")
                      setShowTransactionDialog(true)
                    }}
                    disabled={quantity === 0}
                    className="px-2 py-1 text-xs font-medium text-orange-600 hover:bg-orange-50 rounded transition-colors disabled:text-gray-400 disabled:hover:bg-transparent"
                  >
                    -売却
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                {/* Current Price */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">現在価格</span>
                  {loading ? (
                    <span className="text-sm text-gray-400">読み込み中...</span>
                  ) : price ? (
                    <div className="text-right">
                      <p className="text-xl font-bold text-gray-900">
                        ¥{price.currentPrice.toLocaleString()}
                      </p>
                      <p
                        className={`text-sm font-semibold ${
                          price.change >= 0 ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {price.change >= 0 ? "+" : ""}
                        {price.changePercent.toFixed(2)}%
                      </p>
                    </div>
                  ) : (
                    <span className="text-sm text-gray-400">価格情報なし</span>
                  )}
                </div>

                {/* Holdings Info */}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">保有数</span>
                  <span className="font-semibold text-gray-900">{quantity}株</span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">平均取得単価</span>
                  <span className="font-semibold text-gray-900">
                    ¥{averagePrice.toLocaleString()}
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">評価額</span>
                  <span className="font-semibold text-gray-900">
                    ¥{currentValue.toLocaleString()}
                  </span>
                </div>

                {/* Profit/Loss (Highlighted) */}
                {!loading && price && (
                  <div
                    className={`rounded-lg p-4 mt-4 ${
                      profit >= 0
                        ? "bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200"
                        : "bg-gradient-to-r from-red-50 to-rose-50 border-2 border-red-200"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">評価損益</span>
                      <div className="text-right">
                        <p
                          className={`text-2xl font-bold ${
                            profit >= 0 ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {profit >= 0 ? "+" : ""}¥{profit.toLocaleString()}
                        </p>
                        <p
                          className={`text-sm font-semibold ${
                            profit >= 0 ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          ({profitPercent >= 0 ? "+" : ""}
                          {profitPercent.toFixed(2)}%)
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* Transaction History Section */}
            {stock.transactions && stock.transactions.length > 0 && (
              <section className="bg-white rounded-xl shadow-md p-4 sm:p-6 mb-6">
                <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-4">
                  取引履歴
                </h2>

                <div className="space-y-3">
                  {stock.transactions.map((transaction) => (
                    <div
                      key={transaction.id}
                      className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
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
                          {transaction.note && (
                            <p className="text-xs text-gray-500">{transaction.note}</p>
                          )}
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
                        <button
                          onClick={() => setSelectedTransaction(transaction)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          title="編集"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* AI Sell/Hold Analysis Section */}
            <section className="bg-white rounded-xl shadow-md p-4 sm:p-6 mb-6">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-4">
                AI売買判断
              </h2>

              <div className="space-y-4">
                <PortfolioAnalysis stockId={stock.stockId} />
                <StockPrediction stockId={stock.stockId} />
              </div>
            </section>

            {/* AI Chat Section */}
            <StockChat
              stock={{
                tickerCode: stock.stock.tickerCode,
                name: stock.stock.name,
                sector: stock.stock.sector,
                currentPrice: currentPrice,
                type: "portfolio",
                quantity: quantity,
                averagePurchasePrice: averagePrice,
                profit: profit,
                profitPercent: profitPercent,
              }}
            />

            {/* Chart Section */}
            <StockChart stockId={stock.stockId} />

            {/* Price History Section */}
            <PriceHistory stockId={stock.stockId} />

            {/* Financial Metrics Section */}
            <FinancialMetrics stock={stock.stock} />
          </>
        )}

        {/* Watchlist Stock Details */}
        {!isPortfolio && (
          <>
            {/* Current Price Section */}
            <section className="bg-white rounded-xl shadow-md p-4 sm:p-6 mb-6">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-4">
                現在の価格
              </h2>

              <div className="space-y-4">
                {loading ? (
                  <p className="text-sm text-gray-400">読み込み中...</p>
                ) : price ? (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">現在価格</span>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-gray-900">
                          ¥{price.currentPrice.toLocaleString()}
                        </p>
                        <p
                          className={`text-sm font-semibold ${
                            price.change >= 0 ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {price.change >= 0 ? "+" : ""}
                          {price.changePercent.toFixed(2)}%
                        </p>
                      </div>
                    </div>

                    {(stock.stock.fiftyTwoWeekHigh || stock.stock.fiftyTwoWeekLow) && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">52週高値 / 安値</span>
                        <span className="font-semibold text-gray-900">
                          ¥{(stock.stock.fiftyTwoWeekHigh || 0).toLocaleString()} / ¥
                          {(stock.stock.fiftyTwoWeekLow || 0).toLocaleString()}
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-gray-400">価格情報なし</p>
                )}
              </div>
            </section>

            {/* AI Purchase Recommendation Section */}
            <section className="bg-white rounded-xl shadow-md p-4 sm:p-6 mb-6">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-4">
                AI購入判断
              </h2>

              <PurchaseRecommendation stockId={stock.stockId} />
            </section>

            {/* AI Chat Section */}
            <StockChat
              stock={{
                tickerCode: stock.stock.tickerCode,
                name: stock.stock.name,
                sector: stock.stock.sector,
                currentPrice: price?.currentPrice || stock.stock.currentPrice,
                type: "watchlist",
              }}
            />

            {/* Chart Section */}
            <StockChart stockId={stock.stockId} />

            {/* Price History Section */}
            <PriceHistory stockId={stock.stockId} />

            {/* Financial Metrics Section */}
            <FinancialMetrics stock={stock.stock} />
          </>
        )}

        {/* Delete Button */}
        <button
          onClick={handleDelete}
          className="w-full px-4 py-2 bg-red-50 text-red-700 rounded-lg text-sm font-semibold hover:bg-red-100 transition-colors flex items-center justify-center gap-2"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
          削除
        </button>

        {/* Edit Transaction Dialog */}
        {selectedTransaction && (
          <EditTransactionDialog
            isOpen={true}
            onClose={() => setSelectedTransaction(null)}
            onSuccess={() => {
              setSelectedTransaction(null)
              router.refresh()
            }}
            transaction={selectedTransaction}
            stockName={stock.stock.name}
          />
        )}

        {/* Additional Purchase / Sell Dialog */}
        <AdditionalPurchaseDialog
          isOpen={showTransactionDialog}
          onClose={() => setShowTransactionDialog(false)}
          stock={{
            id: stock.id,
            userId: "",
            stockId: stock.stockId,
            type: stock.type,
            quantity: stock.quantity,
            averagePurchasePrice: stock.averagePurchasePrice,
            purchaseDate: stock.purchaseDate,
            note: stock.note,
            stock: stock.stock,
            createdAt: "",
            updatedAt: "",
          }}
          onSuccess={() => {
            setShowTransactionDialog(false)
            router.refresh()
          }}
          transactionType={transactionType}
        />
      </div>
    </main>
  )
}
