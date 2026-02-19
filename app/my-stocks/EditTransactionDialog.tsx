"use client"

import { useState, useEffect } from "react"

interface Transaction {
  id: string
  type: string
  quantity: number
  price: number
  totalAmount: number
  transactionDate: string
}

interface EditTransactionDialogProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  transaction: Transaction
  stockName: string
}

export default function EditTransactionDialog({
  isOpen,
  onClose,
  onSuccess,
  transaction,
  stockName,
}: EditTransactionDialogProps) {
  const [quantity, setQuantity] = useState(transaction.quantity.toString())
  const [price, setPrice] = useState(transaction.price.toString())
  const [transactionDate, setTransactionDate] = useState(
    new Date(transaction.transactionDate).toISOString().split("T")[0]
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset form when transaction changes
  useEffect(() => {
    setQuantity(transaction.quantity.toString())
    setPrice(transaction.price.toString())
    setTransactionDate(
      new Date(transaction.transactionDate).toISOString().split("T")[0]
    )
    setError(null)
  }, [transaction])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const response = await fetch(`/api/transactions/${transaction.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          quantity: parseInt(quantity),
          price: parseFloat(price),
          transactionDate: transactionDate,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "更新に失敗しました")
      }

      onSuccess()
    } catch (err: any) {
      console.error(err)
      setError(err.message || "更新に失敗しました")
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  const totalAmount = parseInt(quantity || "0") * parseFloat(price || "0")

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
            購入履歴を編集
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
          <h3 className="font-bold text-gray-900">{stockName}</h3>
          <p className="text-sm text-gray-600">
            {transaction.type === "buy" ? "購入" : "売却"}
          </p>
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
              株数
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

          {/* Price */}
          <div>
            <label
              htmlFor="price"
              className="block text-sm font-semibold text-gray-700 mb-2"
            >
              単価
            </label>
            <input
              type="number"
              id="price"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              min="0"
              step="0.01"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          {/* Total Amount (calculated) */}
          <div className="p-3 bg-gray-50 rounded-lg">
            <span className="text-sm text-gray-600">合計金額: </span>
            <span className="font-semibold text-gray-900">
              ¥{totalAmount.toLocaleString()}
            </span>
          </div>

          {/* Transaction Date */}
          <div>
            <label
              htmlFor="transactionDate"
              className="block text-sm font-semibold text-gray-700 mb-2"
            >
              取引日
            </label>
            <input
              type="date"
              id="transactionDate"
              value={transactionDate}
              onChange={(e) => setTransactionDate(e.target.value)}
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
