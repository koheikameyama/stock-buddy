"use client"

import { useState } from "react"

interface VirtualPurchaseModalProps {
  isOpen: boolean
  onClose: () => void
  watchlistId: string
  stockName: string
  tickerCode: string
  currentPrice: number | null
  virtualBuyPrice: number | null
  virtualQuantity: number | null
  onUpdate: () => void
}

export default function VirtualPurchaseModal({
  isOpen,
  onClose,
  watchlistId,
  stockName,
  tickerCode,
  currentPrice,
  virtualBuyPrice,
  virtualQuantity,
  onUpdate,
}: VirtualPurchaseModalProps) {
  const [localBuyPrice, setLocalBuyPrice] = useState(
    virtualBuyPrice?.toString() || currentPrice?.toString() || ""
  )
  const [localQuantity, setLocalQuantity] = useState(
    virtualQuantity?.toString() || ""
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const hasExistingPurchase = virtualBuyPrice && virtualQuantity

  const totalAmount =
    localBuyPrice && localQuantity
      ? Number(localBuyPrice) * Number(localQuantity)
      : 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (!localBuyPrice || !localQuantity) {
      setError("購入価格と数量を入力してください")
      setLoading(false)
      return
    }

    try {
      const response = await fetch("/api/watchlist/virtual-purchase", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          watchlistId,
          virtualBuyPrice: Number(localBuyPrice),
          virtualQuantity: Number(localQuantity),
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
      console.error("Error setting virtual purchase:", err)
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = async () => {
    if (!hasExistingPurchase) {
      onClose()
      return
    }

    if (!confirm("仮想購入をキャンセルしますか？")) {
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(
        `/api/watchlist/virtual-purchase?watchlistId=${watchlistId}`,
        {
          method: "DELETE",
        }
      )

      const data = await response.json()

      if (response.ok) {
        onUpdate()
        onClose()
      } else {
        setError(data.error || "キャンセルに失敗しました")
      }
    } catch (err) {
      setError("ネットワークエラーが発生しました")
      console.error("Error canceling virtual purchase:", err)
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
            仮想購入シミュレーション
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
          {/* 購入価格入力 */}
          <div className="mb-4">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              購入価格
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                ¥
              </span>
              <input
                type="number"
                value={localBuyPrice}
                onChange={(e) => setLocalBuyPrice(e.target.value)}
                placeholder={currentPrice?.toLocaleString() || "0"}
                className="w-full pl-8 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                min="0"
                step="1"
                required
              />
            </div>
          </div>

          {/* 数量入力 */}
          <div className="mb-4">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              購入数量
            </label>
            <div className="relative">
              <input
                type="number"
                value={localQuantity}
                onChange={(e) => setLocalQuantity(e.target.value)}
                placeholder="100"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                min="1"
                step="1"
                required
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
                株
              </span>
            </div>
          </div>

          {/* 合計金額表示 */}
          {totalAmount > 0 && (
            <div className="mb-6 p-4 bg-blue-50 rounded-lg">
              <div className="text-sm text-blue-700 mb-1">購入金額</div>
              <div className="text-2xl font-bold text-blue-900">
                ¥{totalAmount.toLocaleString()}
              </div>
              <div className="mt-2 text-xs text-blue-600">
                {localBuyPrice && localQuantity && (
                  <>
                    ¥{Number(localBuyPrice).toLocaleString()} ×{" "}
                    {Number(localQuantity).toLocaleString()}株
                  </>
                )}
              </div>
            </div>
          )}

          {/* エラーメッセージ */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* アクションボタン */}
          <div className="flex gap-3">
            {hasExistingPurchase ? (
              <>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="flex-1 px-4 py-3 border border-red-300 text-red-600 rounded-lg font-semibold hover:bg-red-50 transition-colors"
                  disabled={loading}
                >
                  {loading ? "処理中..." : "キャンセル"}
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                  disabled={loading}
                >
                  {loading ? "更新中..." : "更新する"}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
                  disabled={loading}
                >
                  閉じる
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                  disabled={loading}
                >
                  {loading ? "設定中..." : "設定する"}
                </button>
              </>
            )}
          </div>
        </form>

        {/* 説明 */}
        <div className="mt-6 p-4 bg-green-50 rounded-lg">
          <h3 className="text-sm font-semibold text-green-900 mb-2">
            💡 仮想購入について
          </h3>
          <ul className="text-xs text-green-800 space-y-1">
            <li>• 実際の購入ではありません（練習用）</li>
            <li>• 現在価格と比較して損益を表示します</li>
            <li>• 「もし買っていたら？」を体験できます</li>
            <li>• いつでも設定を変更・キャンセルできます</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
