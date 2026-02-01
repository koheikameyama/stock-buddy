"use client"

import { useState, useEffect, useRef } from "react"

interface SearchedStock {
  id: string
  tickerCode: string
  name: string
  market: string
  sector: string | null
  latestPrice: number | null
  latestPriceDate: string | null
}

interface AddStockModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  mode: "portfolio" | "watchlist"
}

export default function AddStockModal({
  isOpen,
  onClose,
  onSuccess,
  mode,
}: AddStockModalProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<SearchedStock[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedStock, setSelectedStock] = useState<SearchedStock | null>(null)
  const [isSimulation, setIsSimulation] = useState(false)

  // Purchase details
  const today = new Date()
  today.setHours(today.getHours() + 9) // JST (UTC+9)
  const [purchaseDate, setPurchaseDate] = useState(
    today.toISOString().split("T")[0]
  )
  const [quantity, setQuantity] = useState<number>(1)
  const [price, setPrice] = useState<number | "">("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // リアルタイム検索（デバウンス付き）
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      setSearching(false)
      return
    }

    // 前回のタイマーをクリア
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    // 前回のリクエストをキャンセル
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    // 入力中の表示
    setSearching(true)

    // 300ms後に検索実行
    debounceTimerRef.current = setTimeout(async () => {
      try {
        setError(null)

        // 新しいAbortControllerを作成
        abortControllerRef.current = new AbortController()

        const response = await fetch(
          `/api/stocks/search?q=${encodeURIComponent(searchQuery)}`,
          { signal: abortControllerRef.current.signal }
        )

        if (!response.ok) {
          throw new Error("検索に失敗しました")
        }

        const data = await response.json()
        setSearchResults(data.stocks || [])
      } catch (err: unknown) {
        // AbortErrorは無視
        if (err instanceof Error && err.name === 'AbortError') {
          return
        }
        console.error(err)
        setError("検索に失敗しました")
      } finally {
        setSearching(false)
      }
    }, 300)

    // クリーンアップ
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [searchQuery])

  const handleSelectStock = (stock: SearchedStock) => {
    setSelectedStock(stock)
    setPrice(stock.latestPrice || "")
    setSearchQuery("")
    setSearchResults([])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedStock || !price || quantity <= 0) {
      setError("すべての項目を入力してください")
      return
    }

    try {
      setSubmitting(true)
      setError(null)

      if (mode === "portfolio") {
        const response = await fetch("/api/portfolio/add-stock", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            stockId: selectedStock.id,
            quantity,
            price: Number(price),
            purchaseDate,
            isSimulation,
          }),
        })

        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.error || "追加に失敗しました")
        }
      } else {
        // ウォッチリストに追加
        const response = await fetch("/api/onboarding/add-to-watchlist", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            recommendations: [
              {
                tickerCode: selectedStock.tickerCode,
                recommendedPrice: Number(price),
                quantity,
                source: "manual",
              },
            ],
          }),
        })

        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.error || "追加に失敗しました")
        }
      }

      // Success
      onSuccess()
      handleClose()
    } catch (err: any) {
      console.error(err)
      setError(err.message || "追加に失敗しました")
    } finally {
      setSubmitting(false)
    }
  }

  const handleClose = () => {
    setSearchQuery("")
    setSearchResults([])
    setSelectedStock(null)
    setQuantity(1)
    setPrice("")
    const resetDate = new Date()
    resetDate.setHours(resetDate.getHours() + 9) // JST (UTC+9)
    setPurchaseDate(resetDate.toISOString().split("T")[0])
    setError(null)
    setIsSimulation(false)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-gray-900">
              {mode === "portfolio" ? "銘柄を追加" : "気になる銘柄を追加"}
            </h2>
            <button
              onClick={handleClose}
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
        </div>

        <div className="p-6">
          {/* エラー表示 */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-700">{error}</p>
            </div>
          )}

          {/* Step 1: 銘柄検索 */}
          {!selectedStock && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                銘柄を検索
              </label>
              <div className="mb-4">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="銘柄名またはコード (例: トヨタ, 7203)"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus
                />
                {searching && (
                  <p className="text-sm text-gray-500 mt-2">検索中...</p>
                )}
              </div>

              {/* 検索結果 */}
              {searchResults.length > 0 && (
                <div className="border border-gray-200 rounded-lg max-h-96 overflow-y-auto">
                  {searchResults.map((stock) => (
                    <button
                      key={stock.id}
                      onClick={() => handleSelectStock(stock)}
                      className="w-full p-4 border-b border-gray-100 hover:bg-blue-50 transition-colors text-left"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-semibold text-gray-900">
                            {stock.name}
                          </p>
                          <p className="text-sm text-gray-500">
                            {stock.tickerCode}
                          </p>
                          <p className="text-xs text-gray-400 mt-1">
                            {stock.sector && `${stock.sector} | `}
                            {stock.market}
                          </p>
                        </div>
                        {stock.latestPrice && (
                          <div className="text-right">
                            <p className="text-sm text-gray-500">現在価格</p>
                            <p className="text-lg font-bold text-blue-600">
                              {stock.latestPrice.toLocaleString()}円
                            </p>
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {searchQuery && !searching && searchResults.length === 0 && (
                <p className="text-gray-500 text-center py-8">
                  該当する銘柄が見つかりませんでした
                </p>
              )}
            </div>
          )}

          {/* Step 2: 購入詳細入力 */}
          {selectedStock && (
            <form onSubmit={handleSubmit}>
              {/* 選択された銘柄 */}
              <div className="bg-blue-50 rounded-lg p-4 mb-6">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-gray-900 text-lg">
                      {selectedStock.name}
                    </p>
                    <p className="text-sm text-gray-600">
                      {selectedStock.tickerCode}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedStock(null)}
                    className="text-sm text-blue-600 hover:text-blue-700 font-semibold"
                  >
                    変更
                  </button>
                </div>
              </div>

              {/* 状態選択（ポートフォリオのみ） */}
              {mode === "portfolio" && (
                <div className="mb-6">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    状態
                  </label>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setIsSimulation(false)}
                      className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold transition-all ${
                        !isSimulation
                          ? "bg-green-600 text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      投資中
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsSimulation(true)}
                      className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold transition-all ${
                        isSimulation
                          ? "bg-gray-600 text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      シミュレーション
                    </button>
                  </div>
                </div>
              )}

              {/* 購入日 */}
              {mode === "portfolio" && (
                <div className="mb-4">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
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
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>
              )}

              {/* 株数 */}
              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  {mode === "portfolio" ? "株数" : "気になる株数"}
                </label>
                <input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>

              {/* 購入価格 */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  {mode === "portfolio" ? "購入価格（1株あたり）" : "気になる価格（1株あたり）"}
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={price}
                    onChange={(e) => setPrice(e.target.value ? parseFloat(e.target.value) : "")}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                  <span className="absolute right-4 top-2 text-gray-500">円</span>
                </div>
                {selectedStock.latestPrice && (
                  <p className="text-xs text-gray-500 mt-1">
                    参考: 最新価格 {selectedStock.latestPrice.toLocaleString()}円
                  </p>
                )}
              </div>

              {/* 合計金額 */}
              {price && quantity > 0 && (
                <div className="bg-gray-50 rounded-lg p-4 mb-6">
                  <p className="text-sm text-gray-600 mb-1">
                    {mode === "portfolio" ? "購入総額" : "参考総額"}
                  </p>
                  <p className="text-2xl font-bold text-gray-900">
                    {(Number(price) * quantity).toLocaleString()}円
                  </p>
                </div>
              )}

              {/* ボタン */}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 px-6 py-3 bg-gray-100 text-gray-700 rounded-lg font-semibold hover:bg-gray-200 transition-colors"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:bg-gray-300"
                >
                  {submitting
                    ? "追加中..."
                    : mode === "portfolio"
                      ? "今持ってる銘柄に追加"
                      : "気になる銘柄に追加"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
