"use client"

import { useState } from "react"

interface UpdateStockModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: {
    purchaseDate: string
    purchasePrice: number
    quantity: number
  }) => Promise<void>
  stock: {
    id: string
    name: string
    tickerCode: string
    quantity: number
    averagePrice: number
    isSimulation: boolean
  }
}

export default function UpdateStockModal({
  isOpen,
  onClose,
  onSubmit,
  stock,
}: UpdateStockModalProps) {
  const [purchaseDate, setPurchaseDate] = useState("")
  const [purchasePrice, setPurchasePrice] = useState(stock.averagePrice.toString())
  const [quantity, setQuantity] = useState(stock.quantity.toString())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!purchaseDate) {
      setError("購入日を入力してください")
      return
    }

    const price = parseFloat(purchasePrice)
    if (!purchasePrice || isNaN(price) || price <= 0) {
      setError("有効な購入価格を入力してください")
      return
    }

    const qty = parseInt(quantity)
    if (!quantity || isNaN(qty) || qty <= 0) {
      setError("有効な株数を入力してください")
      return
    }

    try {
      setLoading(true)
      await onSubmit({
        purchaseDate,
        purchasePrice: price,
        quantity: qty,
      })
      onClose()
    } catch (err: any) {
      setError(err.message || "更新に失敗しました")
    } finally {
      setLoading(false)
    }
  }

  const totalCost = parseFloat(purchasePrice) * parseInt(quantity)

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900">
            購入情報を更新
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

        <div className="mb-6 p-4 bg-blue-50 rounded-lg">
          <h3 className="font-semibold text-gray-900 mb-2">
            {stock.name} ({stock.tickerCode})
          </h3>
          <span className="inline-block px-2 py-1 text-xs font-semibold bg-gray-100 text-gray-600 rounded">
            {stock.isSimulation ? "シミュレーション" : "実投資"}
          </span>
        </div>

        <form onSubmit={(e) => e.preventDefault()}>
          <div className="mb-4">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              購入日 <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
              max={new Date().toISOString().split("T")[0]}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              購入価格（1株あたり） <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="number"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
                placeholder="例: 1500"
                min="1"
                step="0.01"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500">
                円
              </span>
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              株数 <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="例: 100"
                min="1"
                step="1"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500">
                株
              </span>
            </div>
          </div>

          {!isNaN(totalCost) && totalCost > 0 && (
            <div className="mb-6 p-4 bg-green-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">合計購入金額</p>
              <p className="text-2xl font-bold text-green-700">
                {totalCost.toLocaleString()}円
              </p>
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg font-semibold hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              キャンセル
            </button>
            <button
              type="submit"
              onClick={handleSubmit}
              disabled={loading}
              className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {loading ? "更新中..." : "更新"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
