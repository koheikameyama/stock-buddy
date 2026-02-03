"use client"

import { useState, useEffect } from "react"

interface UserStock {
  id: string
  stockId: string
  type: "watchlist" | "portfolio"
  // Portfolio fields
  quantity?: number
  averagePurchasePrice?: number
  purchaseDate?: string
  stock: {
    id: string
    tickerCode: string
    name: string
    sector: string | null
    market: string
    currentPrice: number | null
  }
}

interface EditStockDialogProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (stock: any) => void
  stock: UserStock
}

export default function EditStockDialog({
  isOpen,
  onClose,
  onSuccess,
  stock,
}: EditStockDialogProps) {
  const [quantity, setQuantity] = useState(stock.quantity?.toString() || "100")
  const [averagePrice, setAveragePrice] = useState(
    stock.averagePurchasePrice?.toString() || ""
  )
  const [purchaseDate, setPurchaseDate] = useState(
    stock.purchaseDate
      ? new Date(stock.purchaseDate).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0]
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset form when stock changes
  useEffect(() => {
    setQuantity(stock.quantity?.toString() || "100")
    setAveragePrice(stock.averagePurchasePrice?.toString() || "")
    setPurchaseDate(
      stock.purchaseDate
        ? new Date(stock.purchaseDate).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0]
    )
    setError(null)
  }, [stock])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const response = await fetch(`/api/user-stocks/${stock.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          quantity: parseInt(quantity),
          averagePurchasePrice: averagePrice ? parseFloat(averagePrice) : null,
          purchaseDate: purchaseDate,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "更新に失敗しました")
      }

      const updatedStock = await response.json()
      onSuccess(updatedStock)
    } catch (err: any) {
      console.error(err)
      setError(err.message || "更新に失敗しました")
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
            保有情報を編集
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Stock Info */}
        <div className="mb-6 p-4 bg-blue-50 rounded-lg">
          <h3 className="font-bold text-gray-900">{stock.stock.name}</h3>
          <p className="text-sm text-gray-600">{stock.stock.tickerCode}</p>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Quantity */}
          <div>
            <label
              htmlFor="quantity"
              className="block text-sm font-semibold text-gray-700 mb-2"
            >
              保有株数
            </label>
            <input
              type="number"
              id="quantity"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              min="1"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          {/* Average Price */}
          <div>
            <label
              htmlFor="averagePrice"
              className="block text-sm font-semibold text-gray-700 mb-2"
            >
              平均取得単価（オプション）
            </label>
            <input
              type="number"
              id="averagePrice"
              value={averagePrice}
              onChange={(e) => setAveragePrice(e.target.value)}
              min="0"
              step="0.01"
              placeholder="例: 2500"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Purchase Date */}
          <div>
            <label
              htmlFor="purchaseDate"
              className="block text-sm font-semibold text-gray-700 mb-2"
            >
              購入日
            </label>
            <input
              type="date"
              id="purchaseDate"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-semibold hover:bg-gray-200 transition-colors"
              disabled={loading}
            >
              キャンセル
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
              disabled={loading}
            >
              {loading ? "更新中..." : "更新"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
