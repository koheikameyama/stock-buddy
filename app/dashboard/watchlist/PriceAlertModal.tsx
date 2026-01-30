"use client"

import { useState } from "react"

interface PriceAlertModalProps {
  isOpen: boolean
  onClose: () => void
  watchlistId: string
  stockName: string
  tickerCode: string
  currentPrice: number | null
  targetPrice: number | null
  priceAlert: boolean
  onUpdate: () => void
}

export default function PriceAlertModal({
  isOpen,
  onClose,
  watchlistId,
  stockName,
  tickerCode,
  currentPrice,
  targetPrice,
  priceAlert,
  onUpdate,
}: PriceAlertModalProps) {
  const [localTargetPrice, setLocalTargetPrice] = useState(
    targetPrice?.toString() || ""
  )
  const [localPriceAlert, setLocalPriceAlert] = useState(priceAlert)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const response = await fetch("/api/watchlist/set-alert", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          watchlistId,
          targetPrice: localTargetPrice ? Number(localTargetPrice) : null,
          priceAlert: localPriceAlert,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        onUpdate()
        onClose()
      } else {
        setError(data.error || "設定の更新に失敗しました")
      }
    } catch (err) {
      setError("ネットワークエラーが発生しました")
      console.error("Error setting price alert:", err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
        {/* ヘッダー */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            価格アラート設定
          </h2>
          <div className="text-sm text-gray-600">
            <div className="font-semibold">{stockName}</div>
            <div className="text-gray-500">{tickerCode}</div>
          </div>
        </div>

        {/* 現在価格 */}
        {currentPrice && (
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-600 mb-1">現在価格</div>
            <div className="text-2xl font-bold text-gray-900">
              ¥{currentPrice.toLocaleString()}
            </div>
          </div>
        )}

        {/* フォーム */}
        <form onSubmit={handleSubmit}>
          {/* 目標価格入力 */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              目標購入価格
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                ¥
              </span>
              <input
                type="number"
                value={localTargetPrice}
                onChange={(e) => setLocalTargetPrice(e.target.value)}
                placeholder={currentPrice?.toLocaleString() || "0"}
                className="w-full pl-8 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                min="0"
                step="1"
              />
            </div>
            <p className="mt-2 text-xs text-gray-500">
              この価格以下になったら通知します
            </p>
          </div>

          {/* アラート有効/無効 */}
          <div className="mb-6">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={localPriceAlert}
                onChange={(e) => setLocalPriceAlert(e.target.checked)}
                className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm font-semibold text-gray-700">
                価格アラートを有効にする
              </span>
            </label>
            <p className="mt-2 ml-8 text-xs text-gray-500">
              目標価格以下になったときにプッシュ通知を送信します
            </p>
          </div>

          {/* エラーメッセージ */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* アクションボタン */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
              disabled={loading}
            >
              キャンセル
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
              disabled={loading}
            >
              {loading ? "保存中..." : "保存する"}
            </button>
          </div>
        </form>

        {/* 説明 */}
        <div className="mt-6 p-4 bg-blue-50 rounded-lg">
          <h3 className="text-sm font-semibold text-blue-900 mb-2">
            💡 価格アラートについて
          </h3>
          <ul className="text-xs text-blue-800 space-y-1">
            <li>• 毎日自動で価格をチェックします</li>
            <li>• 目標価格以下になったら即座に通知</li>
            <li>• 24時間に1回までの通知制限あり</li>
            <li>• 通知を受け取るにはプッシュ通知を許可してください</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
