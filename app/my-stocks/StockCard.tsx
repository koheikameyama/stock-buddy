"use client"

import { useRouter } from "next/navigation"
import { formatAnalysisTime } from "@/lib/analysis-time"
import { getActionButtonClass, ACTION_BUTTON_LABELS, CARD_FOOTER_STYLES } from "@/lib/ui-config"
import { PORTFOLIO_STATUS_CONFIG, PURCHASE_JUDGMENT_CONFIG, FETCH_FAIL_WARNING_THRESHOLD, INVESTMENT_THEME_CONFIG } from "@/lib/constants"
import DelistedWarning from "@/app/components/DelistedWarning"
import CopyableTicker from "@/app/components/CopyableTicker"

interface UserStock {
  id: string
  stockId: string
  type: "watchlist" | "portfolio"
  // Portfolio fields
  quantity?: number
  averagePurchasePrice?: number
  purchaseDate?: string
  // ステータス
  statusType?: string | null
  // AI分析テキスト（Portfolio）
  shortTerm?: string | null
  // おすすめ経由の情報（Watchlist only）
  investmentTheme?: string | null
  recommendationReason?: string | null
  stock: {
    id: string
    tickerCode: string
    name: string
    sector: string | null
    market: string
    currentPrice: number | null
    fetchFailCount?: number
    isDelisted?: boolean
  }
}

interface StockPrice {
  currentPrice: number
  previousClose: number
  change: number
  changePercent: number
  volume: number
  high: number
  low: number
  marketTime?: number | null
}

interface PurchaseRecommendation {
  recommendation: "buy" | "stay" | "avoid"
  confidence: number
  reason: string
  caution: string
  buyTiming?: "market" | "dip" | null
  sellTiming?: "market" | "rebound" | null
}

interface StockCardProps {
  stock: UserStock
  price?: StockPrice
  priceLoaded?: boolean
  recommendation?: PurchaseRecommendation
  portfolioRecommendation?: "buy" | "sell" | "hold" | null
  analyzedAt?: string | null
  onAdditionalPurchase?: () => void
  onSell?: () => void
  onPurchase?: () => void
  onTrackClick?: () => void
}


export default function StockCard({ stock, price, priceLoaded = false, recommendation, portfolioRecommendation, analyzedAt, onAdditionalPurchase, onSell, onPurchase, onTrackClick }: StockCardProps) {
  const router = useRouter()
  const isHolding = stock.type === "portfolio"
  const isWatchlist = stock.type === "watchlist"
  const quantity = stock.quantity || 0
  const averagePrice = stock.averagePurchasePrice || 0
  const currentPrice = price?.currentPrice || stock.stock.currentPrice || 0

  // Calculate profit/loss for holdings
  const totalCost = averagePrice * quantity
  const currentValue = currentPrice * quantity
  const profit = currentValue - totalCost
  const profitPercent = totalCost > 0 ? (profit / totalCost) * 100 : 0

  // AI Purchase Judgment using real recommendations (for watchlist)
  const getAIPurchaseJudgment = () => {
    if (!recommendation) return null
    return PURCHASE_JUDGMENT_CONFIG[recommendation.recommendation] || null
  }

  // AI Status Badge using statusType (for portfolio)
  const getAIStatusBadge = () => {
    const statusType = stock.statusType
    if (!statusType) return null
    return PORTFOLIO_STATUS_CONFIG[statusType] || null
  }

  const aiJudgment = isWatchlist ? getAIPurchaseJudgment() : getAIStatusBadge()

  const handleClick = () => {
    router.push(`/my-stocks/${stock.id}`)
  }

  return (
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
      {/* AI推奨バッジ - 右上 */}
      {aiJudgment && (
        <div className="absolute top-3 right-3 sm:top-4 sm:right-4 flex items-center gap-1.5">
          {isWatchlist && recommendation?.recommendation === "buy" && recommendation.buyTiming ? (
            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
              recommendation.buyTiming === "market"
                ? "bg-green-100 text-green-700"
                : "bg-yellow-100 text-yellow-700"
            }`}>
              {recommendation.buyTiming === "market" ? "成り行きOK" : "押し目待ち"}
            </span>
          ) : isWatchlist && recommendation?.recommendation === "avoid" && recommendation.sellTiming ? (
            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
              recommendation.sellTiming === "market"
                ? "bg-red-100 text-red-700"
                : "bg-yellow-100 text-yellow-700"
            }`}>
              {recommendation.sellTiming === "market" ? "即見送り" : "戻り待ち"}
            </span>
          ) : (
            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${aiJudgment.bg} ${aiJudgment.color}`}>
              {aiJudgment.text}
            </span>
          )}
        </div>
      )}

      {/* 投資テーマバッジ（おすすめ経由のウォッチリストのみ） */}
      {isWatchlist && stock.investmentTheme && INVESTMENT_THEME_CONFIG[stock.investmentTheme] && (
        <div className="mb-2">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${INVESTMENT_THEME_CONFIG[stock.investmentTheme].bg} ${INVESTMENT_THEME_CONFIG[stock.investmentTheme].color}`}>
            <span>{INVESTMENT_THEME_CONFIG[stock.investmentTheme].icon}</span>
            {INVESTMENT_THEME_CONFIG[stock.investmentTheme].text}
          </span>
        </div>
      )}

      {/* Stock Header */}
      <div className="mb-3 sm:mb-4 pr-20">
        <div className="flex items-center gap-2 sm:gap-3 mb-2">
          <h3 className="text-lg sm:text-xl font-bold text-gray-900">
            {stock.stock.name}
          </h3>
        </div>
        <p className="text-xs sm:text-sm text-gray-500">
          <CopyableTicker tickerCode={stock.stock.tickerCode} />
          {stock.stock.sector && ` • ${stock.stock.sector}`}
        </p>
      </div>

      {/* Delisted Warning */}
      {(stock.stock.isDelisted || (stock.stock.fetchFailCount ?? 0) >= FETCH_FAIL_WARNING_THRESHOLD) && (
        <div className="mb-3">
          <DelistedWarning
            isDelisted={stock.stock.isDelisted ?? false}
            fetchFailCount={stock.stock.fetchFailCount ?? 0}
            compact
          />
        </div>
      )}

      {/* Price and Holdings Info */}
      <div className="space-y-3">
        {/* Current Price */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">
            {stock.stock.isDelisted ? "最終価格" : "現在価格"}
          </span>
          {price ? (
            <div className="text-right">
              <p className={`text-lg sm:text-xl font-bold ${stock.stock.isDelisted ? "text-gray-400" : "text-gray-900"}`}>
                ¥{price.currentPrice.toLocaleString()}
              </p>
              {!stock.stock.isDelisted && (
                <p
                  className={`text-xs sm:text-sm font-semibold ${
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
          ) : priceLoaded ? (
            <p className="text-sm text-gray-400">価格情報なし</p>
          ) : (
            <p className="text-sm text-gray-400">読み込み中...</p>
          )}
        </div>

        {/* Portfolio Specific Info */}
        {isHolding && (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">保有数</span>
              <span className="font-semibold text-gray-900">{quantity}株</span>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">平均取得単価</span>
              <span className="font-semibold text-gray-900">¥{averagePrice.toLocaleString()}</span>
            </div>

            {price ? (
              <div
                className={`rounded-lg p-3 sm:p-4 ${
                  profit >= 0
                    ? "bg-gradient-to-r from-green-50 to-emerald-50"
                    : "bg-gradient-to-r from-red-50 to-rose-50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs sm:text-sm text-gray-600">評価損益</span>
                  <div className="text-right">
                    <p
                      className={`text-lg sm:text-xl font-bold ${
                        profit >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {profit >= 0 ? "+" : ""}¥{profit.toLocaleString()}
                    </p>
                    <p
                      className={`text-xs sm:text-sm font-semibold ${
                        profit >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      ({profitPercent >= 0 ? "+" : ""}
                      {profitPercent.toFixed(2)}%)
                    </p>
                  </div>
                </div>
                {/* AI Analysis for Portfolio */}
                {stock.shortTerm && (
                  <div className="mt-2 pt-2 border-t border-gray-200">
                    <p className="text-xs sm:text-sm text-gray-700">
                      <span className="font-semibold text-blue-700">💡 AI分析: </span>
                      {stock.shortTerm}
                    </p>
                  </div>
                )}
                {/* Analysis Time for Portfolio */}
                {analyzedAt && (() => {
                  const { label, relative, colorClass } = formatAnalysisTime(analyzedAt)
                  return (
                    <p className="mt-2 text-xs text-gray-400 text-right border-t border-gray-200 pt-2">
                      <span className={colorClass}>{label}</span> | {relative}
                    </p>
                  )
                })()}
              </div>
            ) : (
              /* 価格未取得時は評価損益を「取得中」で表示 */
              <div className="rounded-lg p-3 sm:p-4 bg-gray-50">
                <div className="flex items-center justify-between">
                  <span className="text-xs sm:text-sm text-gray-600">評価損益</span>
                  <div className="text-right">
                    <p className="text-sm text-gray-400">{priceLoaded ? "価格情報なし" : "価格取得中..."}</p>
                  </div>
                </div>
                {/* AI Analysis for Portfolio */}
                {stock.shortTerm && (
                  <div className="mt-2 pt-2 border-t border-gray-200">
                    <p className="text-xs sm:text-sm text-gray-700">
                      <span className="font-semibold text-blue-700">💡 AI分析: </span>
                      {stock.shortTerm}
                    </p>
                  </div>
                )}
                {/* Analysis Time for Portfolio */}
                {analyzedAt && (() => {
                  const { label, relative, colorClass } = formatAnalysisTime(analyzedAt)
                  return (
                    <p className="mt-2 text-xs text-gray-400 text-right border-t border-gray-200 pt-2">
                      <span className={colorClass}>{label}</span> | {relative}
                    </p>
                  )
                })()}
              </div>
            )}

          </>
        )}

        {/* AI Analysis Reason for Watchlist */}
        {isWatchlist && recommendation?.reason && (
          <div className="bg-blue-50 rounded-lg p-3">
            <p className="text-xs sm:text-sm text-gray-700">
              <span className="font-semibold text-blue-700">💡 AI分析: </span>
              {recommendation.reason}
            </p>
            {/* Analysis Time for Watchlist */}
            {analyzedAt && (() => {
              const { label, relative, colorClass } = formatAnalysisTime(analyzedAt)
              return (
                <p className="mt-2 text-xs text-gray-400 text-right border-t border-gray-200 pt-2">
                  <span className={colorClass}>{label}</span> | {relative}
                </p>
              )
            })()}
          </div>
        )}

        {/* Footer: Actions + Detail Link */}
        <div className={CARD_FOOTER_STYLES.container}>
          {/* Action Buttons */}
          <div className={CARD_FOOTER_STYLES.actionGroup}>
            {isHolding && onAdditionalPurchase && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onAdditionalPurchase()
                }}
                className={getActionButtonClass("additionalPurchase")}
              >
                {ACTION_BUTTON_LABELS.additionalPurchase}
              </button>
            )}
            {isHolding && onSell && quantity > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onSell()
                }}
                className={getActionButtonClass("sell")}
              >
                {ACTION_BUTTON_LABELS.sell}
              </button>
            )}
            {isWatchlist && onPurchase && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onPurchase()
                }}
                className={getActionButtonClass("purchase")}
              >
                {ACTION_BUTTON_LABELS.purchase}
              </button>
            )}
            {isWatchlist && onTrackClick && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onTrackClick()
                }}
                className={getActionButtonClass("tracked")}
              >
                -見送り
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
    </div>
  )
}
