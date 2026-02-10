"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import PurchaseRecommendation from "@/app/components/PurchaseRecommendation"
import StockAnalysisCard from "@/app/components/StockAnalysisCard"
import FinancialMetrics from "@/app/components/FinancialMetrics"
import StockChart from "@/app/components/StockChart"
import PriceHistory from "@/app/components/PriceHistory"
import EditTransactionDialog from "../EditTransactionDialog"
import AdditionalPurchaseDialog from "../AdditionalPurchaseDialog"
import EditTargetPriceDialog from "../EditTargetPriceDialog"
import EditWatchlistDialog from "../EditWatchlistDialog"
import AddStockDialog from "../AddStockDialog"
import { useChatContext } from "@/app/contexts/ChatContext"

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
  targetPrice?: number | null
  stopLossPrice?: number | null
  // 感情コーチング・ステータス
  emotionalCoaching?: string | null
  simpleStatus?: string | null
  statusType?: string | null
  // 売却提案
  suggestedSellPrice?: number | null
  sellCondition?: string | null
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
  const { setStockContext } = useChatContext()
  const [price, setPrice] = useState<StockPrice | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null)
  const [showTransactionDialog, setShowTransactionDialog] = useState(false)
  const [transactionType, setTransactionType] = useState<"buy" | "sell">("buy")
  const [showTargetPriceDialog, setShowTargetPriceDialog] = useState(false)
  const [showWatchlistDialog, setShowWatchlistDialog] = useState(false)
  const [showPurchaseDialog, setShowPurchaseDialog] = useState(false)
  const [passingStock, setPassingStock] = useState(false)

  const isPortfolio = stock.type === "portfolio"
  const currentPrice = price?.currentPrice || stock.stock.currentPrice || 0
  const quantity = stock.quantity || 0
  const averagePrice = stock.averagePurchasePrice || 0

  // Calculate profit/loss for portfolio
  const totalCost = averagePrice * quantity
  const currentValue = currentPrice * quantity
  const profit = currentValue - totalCost
  const profitPercent = totalCost > 0 ? (profit / totalCost) * 100 : 0

  // Set stock context for global chat
  useEffect(() => {
    setStockContext({
      tickerCode: stock.stock.tickerCode,
      name: stock.stock.name,
      sector: stock.stock.sector,
      currentPrice: currentPrice,
      type: stock.type,
      quantity: isPortfolio ? quantity : undefined,
      averagePurchasePrice: isPortfolio ? averagePrice : undefined,
      profit: isPortfolio ? profit : undefined,
      profitPercent: isPortfolio ? profitPercent : undefined,
      targetPrice: isPortfolio ? stock.targetPrice : undefined,
      stopLossPrice: isPortfolio ? stock.stopLossPrice : undefined,
    })

    // Clear context when leaving the page
    return () => {
      setStockContext(null)
    }
  }, [stock, currentPrice, quantity, averagePrice, profit, profitPercent, isPortfolio, setStockContext])

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

  // 見送りとして記録
  const handlePassStock = async () => {
    const reason = prompt("見送る理由を入力してください（任意）")
    if (reason === null) return // キャンセル

    setPassingStock(true)
    try {
      const response = await fetch("/api/passed-stocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stockId: stock.stockId,
          passedReason: reason || null,
          source: "watchlist",
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "記録に失敗しました")
      }

      // 削除確認
      if (confirm("見送りとして記録しました。ウォッチリストから削除しますか？")) {
        await handleDelete()
      } else {
        alert("見送りとして記録しました。ダッシュボードで結果を追跡できます。")
      }
    } catch (err: any) {
      console.error(err)
      alert(err.message || "記録に失敗しました")
    } finally {
      setPassingStock(false)
    }
  }

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
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
              {stock.stock.name}
            </h1>
            {/* Status Badge for Portfolio */}
            {isPortfolio && stock.simpleStatus && stock.statusType && (
              <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                stock.statusType === "excellent" ? "bg-emerald-100 text-emerald-800" :
                stock.statusType === "good" ? "bg-green-100 text-green-800" :
                stock.statusType === "neutral" ? "bg-gray-100 text-gray-800" :
                stock.statusType === "caution" ? "bg-yellow-100 text-yellow-800" :
                stock.statusType === "warning" ? "bg-red-100 text-red-800" :
                "bg-gray-100 text-gray-800"
              }`}>
                {stock.simpleStatus}
              </span>
            )}
          </div>
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
                  <span className="text-gray-600">購入時単価</span>
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
                    {/* Emotional Coaching Message */}
                    {stock.emotionalCoaching && (
                      <p className="mt-3 text-sm text-gray-700 border-t border-gray-200 pt-3">
                        {stock.emotionalCoaching}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* Target Price Section */}
            <section className="bg-white rounded-xl shadow-md p-4 sm:p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg sm:text-xl font-bold text-gray-900">
                  売却目標
                </h2>
                <button
                  onClick={() => setShowTargetPriceDialog(true)}
                  className="px-3 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded transition-colors flex items-center gap-1"
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
                  編集
                </button>
              </div>

              {stock.targetPrice || stock.stopLossPrice ? (
                <div className="space-y-4">
                  {/* Target Price */}
                  {stock.targetPrice && (
                    <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-green-800">利確目標</span>
                        <span className="text-lg font-bold text-green-700">
                          ¥{stock.targetPrice.toLocaleString()}
                        </span>
                      </div>
                      {averagePrice > 0 && (
                        <>
                          <div className="text-xs text-green-600 mb-2">
                            取得単価から +{((stock.targetPrice - averagePrice) / averagePrice * 100).toFixed(1)}%
                          </div>
                          {/* Progress bar */}
                          <div className="w-full bg-green-200 rounded-full h-2">
                            <div
                              className="bg-green-500 h-2 rounded-full transition-all"
                              style={{
                                width: `${Math.min(100, Math.max(0, (currentPrice - averagePrice) / (stock.targetPrice - averagePrice) * 100))}%`,
                              }}
                            />
                          </div>
                          <div className="text-xs text-green-600 mt-1">
                            達成度: {Math.min(100, Math.max(0, (currentPrice - averagePrice) / (stock.targetPrice - averagePrice) * 100)).toFixed(0)}%
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Stop Loss Price */}
                  {stock.stopLossPrice && (
                    <div className={`p-4 rounded-lg border ${
                      currentPrice < stock.stopLossPrice
                        ? "bg-red-100 border-red-300"
                        : "bg-orange-50 border-orange-200"
                    }`}>
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-sm font-semibold ${
                          currentPrice < stock.stopLossPrice ? "text-red-800" : "text-orange-800"
                        }`}>
                          損切りライン
                          {currentPrice < stock.stopLossPrice && " (割れています)"}
                        </span>
                        <span className={`text-lg font-bold ${
                          currentPrice < stock.stopLossPrice ? "text-red-700" : "text-orange-700"
                        }`}>
                          ¥{stock.stopLossPrice.toLocaleString()}
                        </span>
                      </div>
                      {averagePrice > 0 && (
                        <div className={`text-xs ${
                          currentPrice < stock.stopLossPrice ? "text-red-600" : "text-orange-600"
                        }`}>
                          取得単価から {((stock.stopLossPrice - averagePrice) / averagePrice * 100).toFixed(1)}%
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-6">
                  <p className="text-sm text-gray-500 mb-3">
                    売却目標を設定すると、AIが目標達成度を考慮したアドバイスをします
                  </p>
                  <button
                    onClick={() => setShowTargetPriceDialog(true)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
                  >
                    売却目標を設定する
                  </button>
                </div>
              )}
            </section>

            {/* AI Sell Suggestion Section */}
            {(stock.suggestedSellPrice || stock.sellCondition) && (
              <section className="bg-white rounded-xl shadow-md p-4 sm:p-6 mb-6">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xl">🤖</span>
                  <h2 className="text-lg sm:text-xl font-bold text-gray-900">
                    AIからの売却提案
                  </h2>
                </div>

                <div className="space-y-4">
                  {stock.suggestedSellPrice && (
                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-blue-800">提案売却価格</span>
                        <span className="text-lg font-bold text-blue-700">
                          ¥{stock.suggestedSellPrice.toLocaleString()}
                        </span>
                      </div>
                      {averagePrice > 0 && (
                        <div className="text-xs text-blue-600">
                          取得単価から {((stock.suggestedSellPrice - averagePrice) / averagePrice * 100) >= 0 ? "+" : ""}
                          {((stock.suggestedSellPrice - averagePrice) / averagePrice * 100).toFixed(1)}%
                        </div>
                      )}
                    </div>
                  )}

                  {stock.sellCondition && (
                    <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                      <span className="text-xs font-semibold text-gray-600 block mb-2">売却の条件・考え方</span>
                      <p className="text-sm text-gray-800">{stock.sellCondition}</p>
                    </div>
                  )}

                  <p className="text-xs text-gray-500">
                    ※ 証券アプリで逆指値を設定することで、自動的に売却できます
                  </p>
                </div>
              </section>
            )}

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

            {/* AI Analysis Section */}
            <section className="bg-white rounded-xl shadow-md p-4 sm:p-6 mb-6">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-4">
                AI売買判断
              </h2>
              <StockAnalysisCard stockId={stock.stockId} />
            </section>

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
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg sm:text-xl font-bold text-gray-900">
                  現在の価格
                </h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowPurchaseDialog(true)}
                    className="px-2 py-1 text-xs font-medium text-green-600 hover:bg-green-50 rounded transition-colors"
                  >
                    +購入
                  </button>
                  <button
                    onClick={handlePassStock}
                    disabled={passingStock}
                    className="px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
                  >
                    {passingStock ? "記録中..." : "興味なし"}
                  </button>
                </div>
              </div>

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

            {/* Watchlist Settings Section */}
            <section className="bg-white rounded-xl shadow-md p-4 sm:p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg sm:text-xl font-bold text-gray-900">
                  ウォッチリスト設定
                </h2>
                <button
                  onClick={() => setShowWatchlistDialog(true)}
                  className="px-3 py-1 text-xs font-medium text-yellow-600 hover:bg-yellow-50 rounded transition-colors flex items-center gap-1"
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
                  編集
                </button>
              </div>

              <div className="space-y-4">
                {/* Alert Price */}
                {stock.alertPrice ? (
                  <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold text-yellow-800">購入検討価格</span>
                      <span className="text-lg font-bold text-yellow-700">
                        ¥{stock.alertPrice.toLocaleString()}
                      </span>
                    </div>
                    {currentPrice > 0 && (
                      <div className="text-xs text-yellow-600">
                        現在価格から {((stock.alertPrice - currentPrice) / currentPrice * 100) >= 0 ? "+" : ""}
                        {((stock.alertPrice - currentPrice) / currentPrice * 100).toFixed(1)}%
                        {stock.alertPrice >= currentPrice ? " (購入検討ライン)" : " (現在価格より下)"}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                    <p className="text-sm text-gray-500">
                      購入検討価格が設定されていません
                    </p>
                  </div>
                )}

                {/* Added Reason */}
                {stock.addedReason && (
                  <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                    <span className="text-xs font-semibold text-gray-600 block mb-1">注目理由</span>
                    <p className="text-sm text-gray-800">{stock.addedReason}</p>
                  </div>
                )}

                {/* Note */}
                {stock.note && (
                  <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                    <span className="text-xs font-semibold text-gray-600 block mb-1">メモ</span>
                    <p className="text-sm text-gray-800">{stock.note}</p>
                  </div>
                )}

                {/* Empty state */}
                {!stock.alertPrice && !stock.addedReason && !stock.note && (
                  <div className="text-center py-4">
                    <button
                      onClick={() => setShowWatchlistDialog(true)}
                      className="px-4 py-2 bg-yellow-500 text-white rounded-lg text-sm font-semibold hover:bg-yellow-600 transition-colors"
                    >
                      購入検討価格や注目理由を設定する
                    </button>
                  </div>
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
            stock: {
              ...stock.stock,
              currentPrice: price?.currentPrice ?? stock.stock.currentPrice,
            },
            createdAt: "",
            updatedAt: "",
          }}
          onSuccess={() => {
            setShowTransactionDialog(false)
            router.refresh()
          }}
          transactionType={transactionType}
        />

        {/* Edit Target Price Dialog */}
        <EditTargetPriceDialog
          isOpen={showTargetPriceDialog}
          onClose={() => setShowTargetPriceDialog(false)}
          onSuccess={() => {
            setShowTargetPriceDialog(false)
            router.refresh()
          }}
          stockId={stock.id}
          stockName={stock.stock.name}
          currentPrice={currentPrice}
          averagePrice={averagePrice}
          targetPrice={stock.targetPrice}
          stopLossPrice={stock.stopLossPrice}
        />

        {/* Edit Watchlist Dialog */}
        <EditWatchlistDialog
          isOpen={showWatchlistDialog}
          onClose={() => setShowWatchlistDialog(false)}
          onSuccess={() => {
            setShowWatchlistDialog(false)
            router.refresh()
          }}
          stockId={stock.id}
          stockName={stock.stock.name}
          currentPrice={currentPrice}
          alertPrice={stock.alertPrice}
          addedReason={stock.addedReason}
          note={stock.note}
        />

        {/* Purchase Dialog for Watchlist */}
        <AddStockDialog
          isOpen={showPurchaseDialog}
          onClose={() => setShowPurchaseDialog(false)}
          onSuccess={() => {
            setShowPurchaseDialog(false)
            router.push("/my-stocks")
          }}
          defaultType="portfolio"
          initialStock={{
            id: stock.stock.id,
            tickerCode: stock.stock.tickerCode,
            name: stock.stock.name,
            market: stock.stock.market,
            sector: stock.stock.sector,
            latestPrice: currentPrice || null,
          }}
          initialNote={stock.note || undefined}
        />
      </div>
    </main>
  )
}
