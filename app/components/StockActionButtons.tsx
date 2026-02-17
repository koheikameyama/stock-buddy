"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { getActionButtonClass, ACTION_BUTTON_LABELS } from "@/lib/ui-config"
import RiskWarningDialog from "./RiskWarningDialog"

interface StockRiskInfo {
  isProfitable?: boolean | null
  volatility?: number | null
  weekChangeRate?: number | null
}

interface StockActionButtonsProps {
  tickerCode: string
  redirectTo?: string
  showWatchlist?: boolean
  showTracked?: boolean
  showPurchase?: boolean
  onPurchaseClick?: () => void
  isInWatchlist?: boolean
  isTracked?: boolean
  onWatchlistSuccess?: () => void
  onTrackedSuccess?: () => void
  stockRiskInfo?: StockRiskInfo
}

// 警告条件をチェックして警告メッセージを生成
function getRiskWarnings(riskInfo?: StockRiskInfo): string[] {
  if (!riskInfo) return []

  const warnings: string[] = []

  if (riskInfo.isProfitable === false) {
    warnings.push("この銘柄は赤字です")
  }

  if (riskInfo.volatility != null && riskInfo.volatility > 50) {
    warnings.push(`価格変動が大きい銘柄です（ボラティリティ ${riskInfo.volatility.toFixed(1)}%）`)
  }

  if (riskInfo.weekChangeRate != null && riskInfo.weekChangeRate < -15) {
    warnings.push(`直近1週間で大幅に下落しています（${riskInfo.weekChangeRate.toFixed(1)}%）`)
  }

  return warnings
}

export default function StockActionButtons({
  tickerCode,
  redirectTo,
  showWatchlist = true,
  showTracked = true,
  showPurchase = false,
  onPurchaseClick,
  isInWatchlist = false,
  isTracked = false,
  onWatchlistSuccess,
  onTrackedSuccess,
  stockRiskInfo,
}: StockActionButtonsProps) {
  const router = useRouter()
  const [addingToWatchlist, setAddingToWatchlist] = useState(false)
  const [addingToTracked, setAddingToTracked] = useState(false)
  const [showWarningDialog, setShowWarningDialog] = useState(false)
  const [pendingAction, setPendingAction] = useState<"watchlist" | "tracked" | null>(null)

  const isDisabled = addingToWatchlist || addingToTracked
  const warnings = getRiskWarnings(stockRiskInfo)

  const executeAddToWatchlist = async () => {
    setAddingToWatchlist(true)
    try {
      const response = await fetch("/api/user-stocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tickerCode,
          type: "watchlist",
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "追加に失敗しました")
      }

      toast.success("気になるに追加しました")
      if (onWatchlistSuccess) {
        onWatchlistSuccess()
      } else if (redirectTo) {
        router.push(redirectTo)
      }
    } catch (err: unknown) {
      const error = err as Error
      toast.error(error.message || "追加に失敗しました")
    } finally {
      setAddingToWatchlist(false)
      setShowWarningDialog(false)
      setPendingAction(null)
    }
  }

  const executeAddToTracked = async () => {
    setAddingToTracked(true)
    try {
      const response = await fetch("/api/tracked-stocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tickerCode,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "追加に失敗しました")
      }

      toast.success("追跡に追加しました")
      if (onTrackedSuccess) {
        onTrackedSuccess()
      } else if (redirectTo) {
        router.push(redirectTo)
      }
    } catch (err: unknown) {
      const error = err as Error
      toast.error(error.message || "追加に失敗しました")
    } finally {
      setAddingToTracked(false)
      setShowWarningDialog(false)
      setPendingAction(null)
    }
  }

  const handleAddToWatchlist = () => {
    if (warnings.length > 0) {
      setPendingAction("watchlist")
      setShowWarningDialog(true)
    } else {
      executeAddToWatchlist()
    }
  }

  const handleAddToTracked = () => {
    // 追跡は「見守るだけ」なので警告不要
    executeAddToTracked()
  }

  const handleWarningConfirm = () => {
    if (pendingAction === "watchlist") {
      executeAddToWatchlist()
    } else if (pendingAction === "tracked") {
      executeAddToTracked()
    }
  }

  const handleWarningCancel = () => {
    setShowWarningDialog(false)
    setPendingAction(null)
  }

  // 追跡中 → 気になるボタンのみ表示
  // 気になる → 追跡ボタンのみ表示
  // 両方未登録 → 両方表示

  return (
    <>
      {showWatchlist && (
        isInWatchlist ? (
          <span className="px-2 py-1 text-xs font-medium text-gray-400">
            {ACTION_BUTTON_LABELS.watchlistDone}
          </span>
        ) : (
          <button
            onClick={handleAddToWatchlist}
            disabled={isDisabled}
            className={getActionButtonClass("watchlist", { disabled: true })}
          >
            {addingToWatchlist ? "追加中..." : ACTION_BUTTON_LABELS.watchlist}
          </button>
        )
      )}
      {showTracked && (
        isTracked ? (
          <span className="px-2 py-1 text-xs font-medium text-gray-400">
            {ACTION_BUTTON_LABELS.trackedDone}
          </span>
        ) : (
          <button
            onClick={handleAddToTracked}
            disabled={isDisabled}
            className={getActionButtonClass("tracked", { disabled: true })}
          >
            {addingToTracked ? "追加中..." : ACTION_BUTTON_LABELS.tracked}
          </button>
        )
      )}
      {showPurchase && onPurchaseClick && (
        <button
          onClick={onPurchaseClick}
          className={getActionButtonClass("purchase")}
        >
          {ACTION_BUTTON_LABELS.purchase}
        </button>
      )}

      <RiskWarningDialog
        isOpen={showWarningDialog}
        warnings={warnings}
        onConfirm={handleWarningConfirm}
        onCancel={handleWarningCancel}
        loading={addingToWatchlist || addingToTracked}
      />
    </>
  )
}
