"use client"

import { useState } from "react"

interface PurchaseModalProps {
  isOpen: boolean
  onClose: () => void
  watchlistItem: {
    id: string
    tickerCode: string
    name: string
    recommendedPrice: string
    recommendedQty: number
  }
  onSuccess: () => void
}

export default function PurchaseModal({
  isOpen,
  onClose,
  watchlistItem,
  onSuccess,
}: PurchaseModalProps) {
  const [quantity, setQuantity] = useState(watchlistItem.recommendedQty)
  const [averagePrice, setAveragePrice] = useState(
    parseFloat(watchlistItem.recommendedPrice)
  )
  const [purchaseDate, setPurchaseDate] = useState(
    new Date().toISOString().split("T")[0]
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  if (!isOpen) return null

  const totalAmount = quantity * averagePrice

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    try {
      const response = await fetch("/api/portfolio/add-from-watchlist", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          watchlistId: watchlistItem.id,
          quantity,
          averagePrice,
          purchaseDate,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "追加に失敗しました")
      }

      onSuccess()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h2 className="text-xl font-bold mb-4">購入情報を入力</h2>

        <div className="mb-4 p-3 bg-gray-50 rounded">
          <p className="text-sm text-gray-600">銘柄</p>
          <p className="font-semibold">
            {watchlistItem.name} ({watchlistItem.tickerCode})
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              購入日
            </label>
            <input
              type="date"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              required
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              購入株数
            </label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value))}
              min="1"
              step="1"
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              推奨: {watchlistItem.recommendedQty}株
            </p>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              購入単価（円）
            </label>
            <input
              type="number"
              value={averagePrice}
              onChange={(e) => setAveragePrice(parseFloat(e.target.value))}
              min="0.01"
              step="0.01"
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              推奨: {parseFloat(watchlistItem.recommendedPrice).toLocaleString()}円
            </p>
          </div>

          <div className="mb-6 p-3 bg-blue-50 rounded">
            <p className="text-sm text-gray-600">合計購入金額</p>
            <p className="text-2xl font-bold text-blue-600">
              {totalAmount.toLocaleString()}円
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              disabled={loading}
            >
              キャンセル
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
              disabled={loading}
            >
              {loading ? "追加中..." : "ポートフォリオに追加"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
