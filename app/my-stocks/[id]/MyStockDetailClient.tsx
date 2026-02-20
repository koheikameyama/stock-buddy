"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import PurchaseRecommendation from "@/app/components/PurchaseRecommendation"
import StockAnalysisCard from "@/app/components/StockAnalysisCard"
import FinancialMetrics from "@/app/components/FinancialMetrics"
import EarningsInfo from "@/app/components/EarningsInfo"
import StockChart from "@/app/components/StockChart"
import PriceHistory from "@/app/components/PriceHistory"
import RelatedNews from "@/app/components/RelatedNews"
import StockDetailLayout from "@/app/components/StockDetailLayout"
import DelistedWarning from "@/app/components/DelistedWarning"
import StaleAnalysisBanner from "@/app/components/StaleAnalysisBanner"
import CurrentPriceCard from "@/app/components/CurrentPriceCard"
import DeleteButton from "@/app/components/DeleteButton"
import Tabs from "@/app/components/Tabs"
import TechnicalAnalysis from "@/app/components/TechnicalAnalysis"
import EditTransactionDialog from "../EditTransactionDialog"
import AdditionalPurchaseDialog from "../AdditionalPurchaseDialog"
import AddStockDialog from "../AddStockDialog"
import { toast } from "sonner"
import { useChatContext } from "@/app/contexts/ChatContext"
import { useStockPrice } from "@/app/hooks/useStockPrice"

interface Transaction {
  id: string
  type: string
  quantity: number
  price: number
  totalAmount: number
  transactionDate: string
}

interface Stock {
  id: string
  stockId: string
  type: "portfolio" | "watchlist"
  quantity?: number
  averagePurchasePrice?: number
  purchaseDate?: string
  statusType?: string | null
  suggestedSellPrice?: number | null
  sellCondition?: string | null
  // Watchlist fields
  targetBuyPrice?: number | null
  limitPrice?: number | null  // AI suggested limit price (fallback for buy alert)
  transactions?: Transaction[]
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
    // Earnings data
    isProfitable?: boolean | null
    profitTrend?: string | null
    revenueGrowth?: number | null
    netIncomeGrowth?: number | null
    eps?: number | null
    latestRevenue?: number | null
    latestNetIncome?: number | null
    fetchFailCount?: number
    isDelisted?: boolean
  }
}

export default function MyStockDetailClient({ stock }: { stock: Stock }) {
  const router = useRouter()
  const { setStockContext } = useChatContext()
  const { price, loading, isStale } = useStockPrice(stock.stock.tickerCode)
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null)
  const [openMenuTransactionId, setOpenMenuTransactionId] = useState<string | null>(null)
  const [showTransactionDialog, setShowTransactionDialog] = useState(false)
  const [transactionType, setTransactionType] = useState<"buy" | "sell">("buy")
  const [showPurchaseDialog, setShowPurchaseDialog] = useState(false)
  const [trackingStock, setTrackingStock] = useState(false)
  const [targetBuyPrice, setTargetBuyPrice] = useState<string>(
    stock.targetBuyPrice ? String(stock.targetBuyPrice) : ""
  )
  const [savingTargetPrice, setSavingTargetPrice] = useState(false)
  const [showBuyAlertModal, setShowBuyAlertModal] = useState(false)
  const [currentTargetBuyPrice, setCurrentTargetBuyPrice] = useState<number | null>(
    stock.targetBuyPrice ?? null
  )
  const [showTrackingModal, setShowTrackingModal] = useState(false)
  const [analysisDate, setAnalysisDate] = useState<string | null>(null)

  const isPortfolio = stock.type === "portfolio"
  const currentPrice = price?.currentPrice || stock.stock.currentPrice || 0
  const quantity = stock.quantity || 0
  const averagePrice = stock.averagePurchasePrice || 0

  const totalCost = averagePrice * quantity
  const currentValue = currentPrice * quantity
  const profit = currentValue - totalCost
  const profitPercent = totalCost > 0 ? (profit / totalCost) * 100 : 0

  useEffect(() => {
    setStockContext({
      stockId: stock.stockId,
      tickerCode: stock.stock.tickerCode,
      name: stock.stock.name,
      sector: stock.stock.sector,
      currentPrice: currentPrice,
      type: stock.type,
      quantity: isPortfolio ? quantity : undefined,
      averagePurchasePrice: isPortfolio ? averagePrice : undefined,
      profit: isPortfolio ? profit : undefined,
      profitPercent: isPortfolio ? profitPercent : undefined,
    })

    return () => {
      setStockContext(null)
    }
  }, [stock, currentPrice, quantity, averagePrice, profit, profitPercent, isPortfolio, setStockContext])

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

      toast.success("削除しました")
      router.push("/my-stocks")
    } catch (err: any) {
      console.error(err)
      toast.error(err.message || "削除に失敗しました")
    }
  }

  const handleDeleteTransaction = async (transactionId: string) => {
    if (!confirm("この取引履歴を削除しますか？保有数量と平均単価が再計算されます。")) {
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
      router.refresh()
    } catch (err: any) {
      console.error(err)
      toast.error(err.message || "削除に失敗しました")
    }
  }

  return (
    <StockDetailLayout
      name={stock.stock.name}
      tickerCode={stock.stock.tickerCode}
      sector={stock.stock.sector}
    >
      {/* Delisted Warning */}
      <DelistedWarning
        isDelisted={stock.stock.isDelisted ?? false}
        fetchFailCount={stock.stock.fetchFailCount ?? 0}
      />

      {/* Stale Analysis Banner */}
      <StaleAnalysisBanner analysisDate={analysisDate} />

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
                <span className="text-sm text-gray-600">
                  {stock.stock.isDelisted ? "最終価格" : "現在価格"}
                </span>
                {loading ? (
                  <span className="text-sm text-gray-400">読み込み中...</span>
                ) : price ? (
                  <div className="text-right">
                    <p className={`text-xl font-bold ${stock.stock.isDelisted ? "text-gray-400" : "text-gray-900"}`}>
                      ¥{price.currentPrice.toLocaleString()}
                    </p>
                    {!stock.stock.isDelisted && (
                      <p
                        className={`text-sm font-semibold ${
                          price.change >= 0 ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {price.change >= 0 ? "+" : ""}
                        {price.changePercent.toFixed(2)}%
                      </p>
                    )}
                    {price.marketTime && (
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {new Date(price.marketTime * 1000).toLocaleString("ja-JP", {
                          month: "numeric",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        時点
                      </p>
                    )}
                  </div>
                ) : isStale ? (
                  <span className="text-xs text-amber-600">株価データが取得できませんでした。<br />上場廃止、取引停止の銘柄の可能性があります。</span>
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

          {/* AI Analysis Section */}
          <section className="bg-white rounded-xl shadow-md p-4 sm:p-6 mb-6">
            <StockAnalysisCard
              stockId={stock.stockId}
              quantity={quantity}
              onAnalysisDateLoaded={setAnalysisDate}
            />
          </section>

          {/* Tabbed Content Section */}
          <section className="bg-white rounded-xl shadow-md p-4 sm:p-6 mb-6">
            <Tabs
              tabs={[
                { id: "chart", label: "チャート" },
                { id: "analysis", label: "分析" },
                { id: "news", label: "ニュース" },
                { id: "details", label: "詳細" },
              ]}
              defaultTab="chart"
            >
              {(activeTab) => (
                <>
                  {activeTab === "chart" && (
                    <>
                      <StockChart stockId={stock.stockId} embedded />
                      <PriceHistory stockId={stock.stockId} embedded />
                    </>
                  )}
                  {activeTab === "analysis" && (
                    <TechnicalAnalysis stockId={stock.stockId} embedded />
                  )}
                  {activeTab === "news" && (
                    <RelatedNews stockId={stock.stockId} embedded />
                  )}
                  {activeTab === "details" && (
                    <>
                      <FinancialMetrics stock={stock.stock} embedded />
                      <EarningsInfo earnings={stock.stock} embedded />
                    </>
                  )}
                </>
              )}
            </Tabs>
          </section>

          {/* Transaction History Section - Always at bottom */}
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
                          onClick={() =>
                            setOpenMenuTransactionId(
                              openMenuTransactionId === transaction.id ? null : transaction.id
                            )
                          }
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
                              onClick={() => setOpenMenuTransactionId(null)}
                            />
                            <div className="absolute right-0 top-8 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[100px]">
                              <button
                                onClick={() => {
                                  setSelectedTransaction(transaction)
                                  setOpenMenuTransactionId(null)
                                }}
                                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                              >
                                編集
                              </button>
                              <button
                                onClick={() => {
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
            </section>
          )}
        </>
      )}

      {/* Watchlist Stock Details */}
      {!isPortfolio && (
        <>
          {/* Current Price Section */}
          <CurrentPriceCard
            price={price}
            loading={loading}
            fiftyTwoWeekHigh={stock.stock.fiftyTwoWeekHigh}
            fiftyTwoWeekLow={stock.stock.fiftyTwoWeekLow}
            isDelisted={stock.stock.isDelisted ?? false}
            isStale={isStale}
            actions={
              <>
                <button
                  onClick={() => setShowPurchaseDialog(true)}
                  className="px-2 py-1 text-xs font-medium text-green-600 hover:bg-green-50 rounded transition-colors"
                >
                  +購入
                </button>
                <button
                  onClick={() => setShowTrackingModal(true)}
                  disabled={trackingStock}
                  className="px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
                >
                  -見送り
                </button>
              </>
            }
            bottomActions={
              <button
                onClick={() => {
                  setTargetBuyPrice(
                    currentTargetBuyPrice ? String(currentTargetBuyPrice) : ""
                  )
                  setShowBuyAlertModal(true)
                }}
                className={`text-xs font-medium rounded-full px-3 py-1 transition-colors ${
                  currentTargetBuyPrice
                    ? "text-amber-700 bg-amber-100 hover:bg-amber-200"
                    : "text-amber-600 bg-amber-50 hover:bg-amber-100"
                }`}
              >
                {currentTargetBuyPrice ? `🔔 通知設定中（¥${currentTargetBuyPrice.toLocaleString()}）` : "🔔 買い時通知を設定"}
              </button>
            }
          />

          {/* AI Purchase Recommendation Section */}
          <section className="bg-white rounded-xl shadow-md p-4 sm:p-6 mb-6">
            <PurchaseRecommendation stockId={stock.stockId} onAnalysisDateLoaded={setAnalysisDate} />
          </section>

          {/* Tabbed Content Section */}
          <section className="bg-white rounded-xl shadow-md p-4 sm:p-6 mb-6">
            <Tabs
              tabs={[
                { id: "chart", label: "チャート" },
                { id: "analysis", label: "分析" },
                { id: "news", label: "ニュース" },
                { id: "details", label: "詳細" },
              ]}
              defaultTab="chart"
            >
              {(activeTab) => (
                <>
                  {activeTab === "chart" && (
                    <>
                      <StockChart stockId={stock.stockId} embedded />
                      <PriceHistory stockId={stock.stockId} embedded />
                    </>
                  )}
                  {activeTab === "analysis" && (
                    <TechnicalAnalysis stockId={stock.stockId} embedded />
                  )}
                  {activeTab === "news" && (
                    <RelatedNews stockId={stock.stockId} embedded />
                  )}
                  {activeTab === "details" && (
                    <>
                      <FinancialMetrics stock={stock.stock} embedded />
                      <EarningsInfo earnings={stock.stock} embedded />
                    </>
                  )}
                </>
              )}
            </Tabs>
          </section>
        </>
      )}

      {/* Delete Button */}
      <DeleteButton label="削除" onClick={handleDelete} />

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

      {/* Tracking Confirmation Modal */}
      {showTrackingModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-lg font-bold text-gray-900">この銘柄を追跡しますか？</h3>
              <button
                onClick={() => setShowTrackingModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-2">
              <span className="font-semibold">{stock.stock.name}</span>
            </p>
            <p className="text-sm text-gray-500 mb-6">
              追跡すると、AI分析なしで株価だけを追いかけられます。気になるリストからは移動されます。
            </p>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  setTrackingStock(true)
                  try {
                    await fetch(`/api/user-stocks/${stock.id}`, { method: "DELETE" })
                    toast.success("見送りました")
                    router.push("/my-stocks")
                  } catch (err: any) {
                    toast.error(err.message || "削除に失敗しました")
                  } finally {
                    setTrackingStock(false)
                    setShowTrackingModal(false)
                  }
                }}
                disabled={trackingStock}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                {trackingStock ? "処理中..." : "見送る"}
              </button>
              <button
                onClick={async () => {
                  setTrackingStock(true)
                  try {
                    const response = await fetch("/api/tracked-stocks", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ tickerCode: stock.stock.tickerCode }),
                    })
                    if (!response.ok) {
                      const data = await response.json()
                      throw new Error(data.error || "追跡に失敗しました")
                    }
                    await fetch(`/api/user-stocks/${stock.id}`, { method: "DELETE" })
                    toast.success("追跡に追加しました")
                    router.push("/my-stocks")
                  } catch (err: any) {
                    toast.error(err.message || "追跡に失敗しました")
                  } finally {
                    setTrackingStock(false)
                    setShowTrackingModal(false)
                  }
                }}
                disabled={trackingStock}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {trackingStock ? "処理中..." : "追跡する"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Buy Alert Modal */}
      {showBuyAlertModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-lg font-bold text-gray-900">🔔 買い時通知</h3>
              <button
                onClick={() => setShowBuyAlertModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              設定した価格以下になったら通知します
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                目標買値
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">¥</span>
                <input
                  type="number"
                  value={targetBuyPrice}
                  onChange={(e) => setTargetBuyPrice(e.target.value)}
                  placeholder={stock.limitPrice ? stock.limitPrice.toLocaleString() : ""}
                  className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setShowBuyAlertModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                キャンセル
              </button>
              <button
                onClick={async () => {
                  setSavingTargetPrice(true)
                  try {
                    const priceValue = targetBuyPrice ? Number(targetBuyPrice) : null
                    const response = await fetch(`/api/user-stocks/${stock.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ targetBuyPrice: priceValue }),
                    })
                    if (!response.ok) {
                      throw new Error("保存に失敗しました")
                    }
                    setCurrentTargetBuyPrice(priceValue)
                    setShowBuyAlertModal(false)
                    toast.success("通知設定を保存しました")
                  } catch (err) {
                    console.error(err)
                    toast.error("保存に失敗しました")
                  } finally {
                    setSavingTargetPrice(false)
                  }
                }}
                disabled={savingTargetPrice}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {savingTargetPrice ? "保存中..." : "保存"}
              </button>
            </div>

            <p className="text-xs text-gray-500 mt-3">
              ※ 取引時間中に15分間隔でチェック
            </p>
          </div>
        </div>
      )}

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
      />
    </StockDetailLayout>
  )
}
