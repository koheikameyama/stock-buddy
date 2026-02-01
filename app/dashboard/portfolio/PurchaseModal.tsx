"use client"

import { useState } from "react"

interface PurchaseModalProps {
  isOpen: boolean
  onClose: () => void
  watchlistItem: {
    id: string
    tickerCode: string
    name: string
  }
  onSuccess: () => void
}

export default function PurchaseModal({
  isOpen,
  onClose,
  watchlistItem,
  onSuccess,
}: PurchaseModalProps) {
  const [quantity, setQuantity] = useState(100)
  const [averagePrice, setAveragePrice] = useState<number>(0)
  const [purchaseDate, setPurchaseDate] = useState(
    new Date().toISOString().split("T")[0]
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  if (!isOpen) return null

  const totalAmount = quantity * averagePrice

  const handleSubmit = async (isSimulation: boolean) => {
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
          isSimulation,
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

        <div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              購入日
            </label>
            <input
              type="date"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
              max={(() => {
                const d = new Date()
                d.setHours(d.getHours() + 9) // JST (UTC+9)
                return d.toISOString().split("T")[0]
              })()}
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

          <div className="space-y-3">
            <button
              onClick={() => handleSubmit(false)}
              className="w-full px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg font-semibold hover:from-blue-700 hover:to-indigo-700 transition-all shadow-md hover:shadow-lg disabled:from-gray-400 disabled:to-gray-400"
              disabled={loading}
            >
              {loading ? "追加中..." : "💰 実際に購入した"}
            </button>
            <button
              onClick={() => handleSubmit(true)}
              className="w-full px-4 py-3 bg-white border-2 border-blue-600 text-blue-600 rounded-lg font-semibold hover:bg-blue-50 transition-all disabled:border-gray-400 disabled:text-gray-400"
              disabled={loading}
            >
              {loading ? "追加中..." : "🎮 シミュレーションする"}
            </button>
            <button
              onClick={onClose}
              className="w-full px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
              disabled={loading}
            >
              キャンセル
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
