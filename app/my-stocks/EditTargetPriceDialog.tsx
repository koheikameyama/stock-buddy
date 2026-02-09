"use client"

import { useState, useEffect } from "react"

interface EditTargetPriceDialogProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  stockId: string
  stockName: string
  currentPrice: number
  averagePrice: number
  targetPrice: number | null | undefined
  stopLossPrice: number | null | undefined
}

export default function EditTargetPriceDialog({
  isOpen,
  onClose,
  onSuccess,
  stockId,
  stockName,
  currentPrice,
  averagePrice,
  targetPrice: initialTargetPrice,
  stopLossPrice: initialStopLossPrice,
}: EditTargetPriceDialogProps) {
  const [targetPrice, setTargetPrice] = useState(
    initialTargetPrice?.toString() || ""
  )
  const [stopLossPrice, setStopLossPrice] = useState(
    initialStopLossPrice?.toString() || ""
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset form when dialog opens
  useEffect(() => {
    if (isOpen) {
      setTargetPrice(initialTargetPrice?.toString() || "")
      setStopLossPrice(initialStopLossPrice?.toString() || "")
      setError(null)
    }
  }, [isOpen, initialTargetPrice, initialStopLossPrice])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const body: { targetPrice?: number | null; stopLossPrice?: number | null } = {}

      if (targetPrice) {
        const tp = parseFloat(targetPrice)
        if (tp <= 0) {
          throw new Error("利確目標価格は0より大きい値を指定してください")
        }
        if (averagePrice > 0 && tp <= averagePrice) {
          throw new Error("利確目標価格は取得単価より高い価格を設定してください")
        }
        body.targetPrice = tp
      } else {
        body.targetPrice = null
      }

      if (stopLossPrice) {
        const sp = parseFloat(stopLossPrice)
        if (sp <= 0) {
          throw new Error("損切り価格は0より大きい値を指定してください")
        }
        if (averagePrice > 0 && sp >= averagePrice) {
          throw new Error("損切り価格は取得単価より低い価格を設定してください")
        }
        body.stopLossPrice = sp
      } else {
        body.stopLossPrice = null
      }

      const response = await fetch(`/api/user-stocks/${stockId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "更新に失敗しました")
      }

      onSuccess()
    } catch (err: unknown) {
      console.error(err)
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError("更新に失敗しました")
      }
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  // Calculate percentages for display
  const targetPercent = targetPrice && averagePrice > 0
    ? ((parseFloat(targetPrice) - averagePrice) / averagePrice * 100)
    : null
  const stopLossPercent = stopLossPrice && averagePrice > 0
    ? ((parseFloat(stopLossPrice) - averagePrice) / averagePrice * 100)
    : null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
            売却目標を設定
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
          <div className="flex justify-between text-sm text-gray-600 mt-1">
            <span>現在価格: ¥{currentPrice.toLocaleString()}</span>
            <span>取得単価: ¥{averagePrice.toLocaleString()}</span>
          </div>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Target Price */}
          <div>
            <label
              htmlFor="targetPrice"
              className="block text-sm font-semibold text-gray-700 mb-2"
            >
              利確目標価格（円）
            </label>
            <input
              type="number"
              id="targetPrice"
              value={targetPrice}
              onChange={(e) => setTargetPrice(e.target.value)}
              min="0"
              step="1"
              placeholder="例: 2000"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {targetPercent !== null && (
              <p className="text-xs text-gray-500 mt-1">
                取得単価から {targetPercent >= 0 ? "+" : ""}{targetPercent.toFixed(1)}%
              </p>
            )}
            <p className="text-xs text-gray-400 mt-1">
              この価格に達したら売却を検討するラインです
            </p>
          </div>

          {/* Stop Loss Price */}
          <div>
            <label
              htmlFor="stopLossPrice"
              className="block text-sm font-semibold text-gray-700 mb-2"
            >
              損切り価格（円）
            </label>
            <input
              type="number"
              id="stopLossPrice"
              value={stopLossPrice}
              onChange={(e) => setStopLossPrice(e.target.value)}
              min="0"
              step="1"
              placeholder="例: 1200"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {stopLossPercent !== null && (
              <p className="text-xs text-gray-500 mt-1">
                取得単価から {stopLossPercent.toFixed(1)}%
              </p>
            )}
            <p className="text-xs text-gray-400 mt-1">
              損失を限定するための売却ラインです
            </p>
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
              {loading ? "更新中..." : "保存"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
