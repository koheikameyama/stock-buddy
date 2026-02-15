"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

interface StockActionButtonsProps {
  tickerCode: string
  redirectTo?: string
  showWatchlist?: boolean
  showTracked?: boolean
  showPurchase?: boolean
  onPurchaseClick?: () => void
}

export default function StockActionButtons({
  tickerCode,
  redirectTo = "/my-stocks",
  showWatchlist = true,
  showTracked = true,
  showPurchase = false,
  onPurchaseClick,
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
      router.push(redirectTo)
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
      router.push(redirectTo)
    } catch (err: unknown) {
      const error = err as Error
      toast.error(error.message || "追加に失敗しました")
    } finally {
      setAddingToTracked(false)
    }
  }

  return (
    <>
      {showWatchlist && (
        <button
          onClick={handleAddToWatchlist}
          disabled={isDisabled}
          className="px-2 py-1 text-xs font-medium text-green-600 hover:bg-green-50 rounded transition-colors disabled:opacity-50"
        >
          {addingToWatchlist ? "追加中..." : "+気になる"}
        </button>
      )}
      {showTracked && (
        <button
          onClick={handleAddToTracked}
          disabled={isDisabled}
          className="px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
        >
          {addingToTracked ? "追加中..." : "+追跡"}
        </button>
      )}
      {showPurchase && onPurchaseClick && (
        <button
          onClick={onPurchaseClick}
          className="px-2 py-1 text-xs font-medium text-green-600 hover:bg-green-50 rounded transition-colors"
        >
          +購入
        </button>
      )}
    </>
  )
}
