"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { formatAnalysisTime } from "@/lib/analysis-time";
import {
  getActionButtonClass,
  ACTION_BUTTON_LABELS,
  CARD_FOOTER_STYLES,
} from "@/lib/ui-config";
import {
  PORTFOLIO_STATUS_CONFIG,
  PURCHASE_JUDGMENT_CONFIG,
  FETCH_FAIL_WARNING_THRESHOLD,
  INVESTMENT_THEME_CONFIG,
} from "@/lib/constants";
import DelistedWarning from "@/app/components/DelistedWarning";
import CopyableTicker from "@/app/components/CopyableTicker";
import EditTransactionDialog from "./EditTransactionDialog";

interface Transaction {
  id: string;
  type: string;
  quantity: number;
  price: number;
  totalAmount: number;
  transactionDate: string;
}

interface UserStock {
  id: string;
  stockId: string;
  type: "watchlist" | "portfolio";
  // Portfolio fields
  quantity?: number;
  averagePurchasePrice?: number;
  purchaseDate?: string;
  // ステータス
  statusType?: string | null;
  // AI分析テキスト（Portfolio）
  shortTerm?: string | null;
  // おすすめ経由の情報（Watchlist only）
  investmentTheme?: string | null;
  recommendationReason?: string | null;
  transactions?: Transaction[];
  stock: {
    id: string;
    tickerCode: string;
    name: string;
    sector: string | null;
    market: string;
    currentPrice: number | null;
    fetchFailCount?: number;
    isDelisted?: boolean;
  };
}

interface StockPrice {
  currentPrice: number;
  previousClose: number;
  change: number;
  changePercent: number;
  volume: number;
  high: number;
  low: number;
  marketTime?: number | null;
}

interface PurchaseRecommendation {
  recommendation: "buy" | "stay" | "avoid";
  confidence: number;
  reason: string;
  caution: string;
  buyTiming?: "market" | "dip" | null;
  sellTiming?: "market" | "rebound" | null;
}

interface StockCardProps {
  stock: UserStock;
  price?: StockPrice;
  priceLoaded?: boolean;
  isStale?: boolean;
  recommendation?: PurchaseRecommendation;
  portfolioRecommendation?: "buy" | "sell" | "hold" | null;
  analyzedAt?: string | null;
  onAdditionalPurchase?: () => void;
  onSell?: () => void;
  onPurchase?: () => void;
  onTrackClick?: () => void;
  onDelete?: () => void;
  onTransactionUpdated?: () => void;
}

export default function StockCard({
  stock,
  price,
  priceLoaded = false,
  isStale = false,
  recommendation,
  portfolioRecommendation,
  analyzedAt,
  onAdditionalPurchase,
  onSell,
  onPurchase,
  onTrackClick,
  onDelete,
  onTransactionUpdated,
}: StockCardProps) {
  const [showTransactions, setShowTransactions] = useState(false);
  const [selectedTransaction, setSelectedTransaction] =
    useState<Transaction | null>(null);
  const [openMenuTransactionId, setOpenMenuTransactionId] = useState<
    string | null
  >(null);
  const isHolding = stock.type === "portfolio";
  const isWatchlist = stock.type === "watchlist";
  const quantity = stock.quantity || 0;
  const averagePrice = stock.averagePurchasePrice || 0;

  // 堅牢な価格取得ロジック: StoreのMapのキーが.Tあり/なしの両方の可能性があるため
  const getPrice = () => {
    if (price) return price.currentPrice;
    // price プロップが渡されていない場合のフォールバック（MyStocksClient等での渡し忘れ対策）
    return stock.stock.currentPrice || 0;
  };
  const currentPrice = getPrice();

  // Calculate profit/loss for holdings
  const totalCost = averagePrice * quantity;
  const currentValue = currentPrice * quantity;
  const profit = currentValue - totalCost;
  const profitPercent = totalCost > 0 ? (profit / totalCost) * 100 : 0;

  // AI Purchase Judgment using real recommendations (for watchlist)
  const getAIPurchaseJudgment = () => {
    if (!recommendation) return null;
    return PURCHASE_JUDGMENT_CONFIG[recommendation.recommendation] || null;
  };

  // AI Status Badge using statusType (for portfolio)
  const getAIStatusBadge = () => {
    const statusType = stock.statusType;
    if (!statusType) return null;
    return PORTFOLIO_STATUS_CONFIG[statusType] || null;
  };

  const aiJudgment = isWatchlist ? getAIPurchaseJudgment() : getAIStatusBadge();

  // staleまたは上場廃止の銘柄は詳細遷移・バッジ・AI分析を無効化
  const isDisabled = isStale || stock.stock.isDelisted === true;
  // 価格未取得時もリンクを無効化（stale判定が終わるまで遷移させない）
  const linkDisabled = isDisabled || !priceLoaded;

  return (
    <>
      <div
        className={`relative bg-white rounded-xl shadow-md transition-all p-4 sm:p-6 ${isDisabled ? "opacity-60" : "hover:shadow-lg hover:bg-gray-50"}`}
      >
        {/* AI推奨バッジ - 右上（無効化時は非表示） */}
        {aiJudgment && !isDisabled && (
          <div className="absolute top-3 right-3 sm:top-4 sm:right-4 flex items-center gap-1.5">
            {isWatchlist &&
            recommendation?.recommendation === "buy" &&
            recommendation.buyTiming ? (
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                  recommendation.buyTiming === "market"
                    ? "bg-green-100 text-green-700"
                    : "bg-yellow-100 text-yellow-700"
                }`}
              >
                {recommendation.buyTiming === "market"
                  ? "成り行きOK"
                  : "押し目待ち"}
              </span>
            ) : isWatchlist &&
              recommendation?.recommendation === "avoid" &&
              recommendation.sellTiming ? (
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                  recommendation.sellTiming === "market"
                    ? "bg-red-100 text-red-700"
                    : "bg-yellow-100 text-yellow-700"
                }`}
              >
                {recommendation.sellTiming === "market"
                  ? "即見送り"
                  : "戻り待ち"}
              </span>
            ) : (
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-semibold ${aiJudgment.bg} ${aiJudgment.color}`}
              >
                {aiJudgment.text}
              </span>
            )}
          </div>
        )}

        {/* 投資テーマバッジ（おすすめ経由のウォッチリストのみ、無効化時は非表示） */}
        {isWatchlist &&
          !isDisabled &&
          stock.investmentTheme &&
          INVESTMENT_THEME_CONFIG[stock.investmentTheme] && (
            <div className="mb-2">
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${INVESTMENT_THEME_CONFIG[stock.investmentTheme].bg} ${INVESTMENT_THEME_CONFIG[stock.investmentTheme].color}`}
              >
                <span>
                  {INVESTMENT_THEME_CONFIG[stock.investmentTheme].icon}
                </span>
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
        {(stock.stock.isDelisted ||
          (stock.stock.fetchFailCount ?? 0) >=
            FETCH_FAIL_WARNING_THRESHOLD) && (
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
                <p
                  className={`text-lg sm:text-xl font-bold ${stock.stock.isDelisted ? "text-gray-400" : "text-gray-900"}`}
                >
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
              isStale ? (
                <p className="text-xs text-amber-600">
                  株価データが取得できませんでした。
                  <br />
                  上場廃止、取引停止の銘柄の可能性があります。
                </p>
              ) : (
                <p className="text-sm text-gray-400">価格情報なし</p>
              )
            ) : (
              <p className="text-sm text-gray-400">読み込み中...</p>
            )}
          </div>

          {/* Portfolio Specific Info */}
          {isHolding && (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">保有数</span>
                <span className="font-semibold text-gray-900">
                  {quantity}株
                </span>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">平均取得単価</span>
                <span className="font-semibold text-gray-900">
                  ¥{averagePrice.toLocaleString()}
                </span>
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
                    <span className="text-xs sm:text-sm text-gray-600">
                      評価損益
                    </span>
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
                        <span className="font-semibold text-blue-700">
                          💡 AI分析:{" "}
                        </span>
                        {stock.shortTerm}
                      </p>
                    </div>
                  )}
                  {/* Analysis Time for Portfolio */}
                  {analyzedAt &&
                    (() => {
                      const { label, relative, colorClass } =
                        formatAnalysisTime(analyzedAt);
                      return (
                        <p className="mt-2 text-xs text-gray-400 text-right border-t border-gray-200 pt-2">
                          <span className={colorClass}>{label}</span> |{" "}
                          {relative}
                        </p>
                      );
                    })()}
                </div>
              ) : (
                /* 価格未取得時は評価損益を「取得中」で表示 */
                <div className="rounded-lg p-3 sm:p-4 bg-gray-50">
                  <div className="flex items-center justify-between">
                    <span className="text-xs sm:text-sm text-gray-600">
                      評価損益
                    </span>
                    <div className="text-right">
                      <p className="text-sm text-gray-400">
                        {priceLoaded
                          ? isStale
                            ? "株価データが取得できませんでした。上場廃止、取引停止の銘柄の可能性があります。"
                            : "価格情報なし"
                          : "価格取得中..."}
                      </p>
                    </div>
                  </div>
                  {/* AI Analysis for Portfolio */}
                  {stock.shortTerm && (
                    <div className="mt-2 pt-2 border-t border-gray-200">
                      <p className="text-xs sm:text-sm text-gray-700">
                        <span className="font-semibold text-blue-700">
                          💡 AI分析:{" "}
                        </span>
                        {stock.shortTerm}
                      </p>
                    </div>
                  )}
                  {/* Analysis Time for Portfolio */}
                  {analyzedAt &&
                    (() => {
                      const { label, relative, colorClass } =
                        formatAnalysisTime(analyzedAt);
                      return (
                        <p className="mt-2 text-xs text-gray-400 text-right border-t border-gray-200 pt-2">
                          <span className={colorClass}>{label}</span> |{" "}
                          {relative}
                        </p>
                      );
                    })()}
                </div>
              )}
            </>
          )}

          {/* AI Analysis Reason for Watchlist */}
          {isWatchlist &&
            (isDisabled ? (
              <div className="bg-amber-50 rounded-lg p-3">
                <p className="text-xs sm:text-sm text-amber-700">
                  最新の株価が取得できないため分析がおこなえませんでした
                </p>
              </div>
            ) : recommendation?.reason ? (
              <div className="bg-blue-50 rounded-lg p-3">
                <p className="text-xs sm:text-sm text-gray-700">
                  <span className="font-semibold text-blue-700">
                    💡 AI分析:{" "}
                  </span>
                  {recommendation.reason}
                </p>
                {/* Analysis Time for Watchlist */}
                {analyzedAt &&
                  (() => {
                    const { label, relative, colorClass } =
                      formatAnalysisTime(analyzedAt);
                    return (
                      <p className="mt-2 text-xs text-gray-400 text-right border-t border-gray-200 pt-2">
                        <span className={colorClass}>{label}</span> | {relative}
                      </p>
                    );
                  })()}
              </div>
            ) : null)}

          {/* Transaction History (expandable, portfolio only) */}
          {isHolding && stock.transactions && stock.transactions.length > 0 && (
            <div className="pt-3 border-t border-gray-100">
              <button
                onClick={() => setShowTransactions(!showTransactions)}
                className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 hover:text-gray-900 transition-colors w-full"
              >
                <svg
                  className={`w-4 h-4 transition-transform ${showTransactions ? "rotate-90" : ""}`}
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
                取引履歴 ({stock.transactions.length}件)
              </button>

              {showTransactions && (
                <div className="mt-3 space-y-2">
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
                            {new Date(
                              transaction.transactionDate,
                            ).toLocaleDateString("ja-JP")}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-sm font-semibold text-gray-900">
                            {transaction.quantity}株 @ ¥
                            {transaction.price.toLocaleString()}
                          </p>
                          <p className="text-xs text-gray-500">
                            ¥{transaction.totalAmount.toLocaleString()}
                          </p>
                        </div>
                        <div className="relative">
                          <button
                            onClick={() =>
                              setOpenMenuTransactionId(
                                openMenuTransactionId === transaction.id
                                  ? null
                                  : transaction.id,
                              )
                            }
                            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                            title="メニュー"
                          >
                            <svg
                              className="w-4 h-4"
                              fill="currentColor"
                              viewBox="0 0 24 24"
                            >
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
                                    setSelectedTransaction(transaction);
                                    setOpenMenuTransactionId(null);
                                  }}
                                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                >
                                  編集
                                </button>
                                <button
                                  onClick={async () => {
                                    setOpenMenuTransactionId(null);
                                    if (
                                      !confirm("この取引履歴を削除しますか？")
                                    )
                                      return;
                                    try {
                                      const response = await fetch(
                                        `/api/transactions/${transaction.id}`,
                                        { method: "DELETE" },
                                      );
                                      if (!response.ok) {
                                        const data = await response.json();
                                        throw new Error(
                                          data.error || "削除に失敗しました",
                                        );
                                      }
                                      toast.success("取引履歴を削除しました");
                                      onTransactionUpdated?.();
                                    } catch (err: any) {
                                      toast.error(
                                        err.message || "削除に失敗しました",
                                      );
                                    }
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
              {isHolding && !isDisabled && onAdditionalPurchase && (
                <button
                  onClick={() => onAdditionalPurchase()}
                  className={getActionButtonClass("additionalPurchase")}
                >
                  {ACTION_BUTTON_LABELS.additionalPurchase}
                </button>
              )}
              {isHolding && onSell && quantity > 0 && (
                <button
                  onClick={() => onSell()}
                  className={getActionButtonClass("sell")}
                >
                  {ACTION_BUTTON_LABELS.sell}
                </button>
              )}
              {isWatchlist && !isDisabled && onPurchase && (
                <button
                  onClick={() => onPurchase()}
                  className={getActionButtonClass("purchase")}
                >
                  {ACTION_BUTTON_LABELS.purchase}
                </button>
              )}
              {isWatchlist && !isDisabled && onTrackClick && (
                <button
                  onClick={() => onTrackClick()}
                  className={getActionButtonClass("tracked")}
                >
                  -見送り
                </button>
              )}
              {isDisabled && onDelete && (
                <button
                  onClick={() => onDelete()}
                  className="px-2 py-1 text-xs font-medium rounded transition-colors text-red-600 hover:bg-red-50"
                >
                  削除
                </button>
              )}
            </div>

            {/* Detail Link */}
            {linkDisabled ? (
              <div className="flex items-center text-gray-300 ml-auto">
                <span className="text-xs text-gray-300">詳細を見る</span>
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
            ) : (
              <Link
                href={`/my-stocks/${stock.id}`}
                className={CARD_FOOTER_STYLES.detailLink}
              >
                <span className={CARD_FOOTER_STYLES.detailLinkText}>
                  詳細を見る
                </span>
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
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Edit Transaction Dialog */}
      {selectedTransaction && (
        <EditTransactionDialog
          isOpen={true}
          onClose={() => setSelectedTransaction(null)}
          onSuccess={() => {
            setSelectedTransaction(null);
            onTransactionUpdated?.();
          }}
          transaction={selectedTransaction}
          stockName={stock.stock.name}
        />
      )}
    </>
  );
}
