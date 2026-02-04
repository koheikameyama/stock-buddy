"use client"

import { useState } from "react"

interface UserStock {
  id: string
  userId: string
  stockId: string
  type: "watchlist" | "portfolio"
  quantity?: number
  averagePurchasePrice?: number
  purchaseDate?: string
  note?: string | null
  stock: {
    id: string
    tickerCode: string
    name: string
    sector: string | null
    market: string
    currentPrice: number | null
  }
  createdAt: string
  updatedAt: string
}

interface AdditionalPurchaseDialogProps {
  isOpen: boolean
  onClose: () => void
  stock: UserStock | null
  onSuccess: (updatedStock: UserStock) => void
}

export default function AdditionalPurchaseDialog({
  isOpen,
  onClose,
  stock,
  onSuccess,
}: AdditionalPurchaseDialogProps) {
  const [quantity, setQuantity] = useState("")
  const [price, setPrice] = useState("")
  const [purchaseDate, setPurchaseDate] = useState(
    new Date().toISOString().split("T")[0]
  )
  const [note, setNote] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!stock) {
      setError("銘柄が選択されていません")
      return
    }

    if (!quantity || parseInt(quantity) <= 0) {
      setError("追加購入株数を入力してください")
      return
    }

    if (!price || parseFloat(price) <= 0) {
      setError("購入単価を入力してください")
      return
    }

    setLoading(true)

    try {
      const body = {
        quantity: parseInt(quantity),
        price: parseFloat(price),
        purchaseDate,
        note: note || undefined,
      }

      const response = await fetch(`/api/portfolio-stocks/${stock.id}/additional-purchase`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "追加購入の登録に失敗しました")
      }

      const updatedStock = await response.json()
      onSuccess(updatedStock)

      // Reset form
      setQuantity("")
      setPrice("")
      setPurchaseDate(new Date().toISOString().split("T")[0])
      setNote("")
    } catch (err: any) {
      console.error(err)
      setError(err.message || "追加購入の登録に失敗しました")
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen || !stock) return null

  // Calculate new average price
  const currentQuantity = stock.quantity || 0
  const currentAvgPrice = stock.averagePurchasePrice || 0
  const additionalQuantity = parseInt(quantity) || 0
  const additionalPrice = parseFloat(price) || 0

  const newTotalQuantity = currentQuantity + additionalQuantity
  const newAvgPrice = newTotalQuantity > 0
    ? (currentQuantity * currentAvgPrice + additionalQuantity * additionalPrice) / newTotalQuantity
    : 0

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
            追加購入
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
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <h3 className="font-semibold text-gray-900">{stock.stock.name}</h3>
          <p className="text-sm text-gray-600">{stock.stock.tickerCode}</p>
          <div className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">現在の保有数</span>
              <span className="font-semibold text-gray-900">{currentQuantity}株</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">現在の平均単価</span>
              <span className="font-semibold text-gray-900">¥{currentAvgPrice.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="quantity"
              className="block text-sm font-semibold text-gray-700 mb-2"
            >
              追加購入株数 <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              id="quantity"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              min="1"
              placeholder="例: 100"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          <div>
            <label
              htmlFor="price"
              className="block text-sm font-semibold text-gray-700 mb-2"
            >
              購入単価 <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              id="price"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              min="0"
              step="0.01"
              placeholder="例: 2500"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          <div>
            <label
              htmlFor="purchaseDate"
              className="block text-sm font-semibold text-gray-700 mb-2"
            >
              購入日 <span className="text-red-500">*</span>
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

          <div>
            <label
              htmlFor="note"
              className="block text-sm font-semibold text-gray-700 mb-2"
            >
              メモ（任意）
            </label>
            <textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="購入理由や注意点などを記録できます"
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Preview of new average */}
          {quantity && price && (
            <div className="p-4 bg-blue-50 rounded-lg">
              <h4 className="text-sm font-semibold text-blue-900 mb-2">購入後の状況</h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-blue-700">合計保有数</span>
                  <span className="font-semibold text-blue-900">{newTotalQuantity}株</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-blue-700">新しい平均単価</span>
                  <span className="font-semibold text-blue-900">¥{newAvgPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>
          )}

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
              className="flex-1 px-4 py-2 rounded-lg font-semibold transition-colors text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              disabled={loading}
            >
              {loading ? "登録中..." : "追加購入を登録"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
