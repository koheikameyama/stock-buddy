"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { getActionButtonClass, ACTION_BUTTON_LABELS } from "@/lib/ui-config"

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
}: StockActionButtonsProps) {
  const router = useRouter()
  const [addingToWatchlist, setAddingToWatchlist] = useState(false)
  const [addingToTracked, setAddingToTracked] = useState(false)

  const isDisabled = addingToWatchlist || addingToTracked

  const handleAddToWatchlist = async () => {
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
    }
  }

  const handleAddToTracked = async () => {
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
    }
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
    </>
  )
}
