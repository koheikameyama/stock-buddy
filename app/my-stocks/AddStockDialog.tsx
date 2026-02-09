"use client"

import { useState, useEffect, useRef } from "react"

interface UserStock {
  id: string
  userId: string
  stockId: string
  type: "watchlist" | "portfolio"
  // Watchlist fields
  addedReason?: string | null
  alertPrice?: number | null
  // Portfolio fields
  quantity?: number
  averagePurchasePrice?: number
  purchaseDate?: string
  lastAnalysis?: string | null
  shortTerm?: string | null
  mediumTerm?: string | null
  longTerm?: string | null
  // Common fields
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

interface SearchResult {
  id: string
  tickerCode: string
  name: string
  market: string
  sector: string | null
  latestPrice: number | null
}

interface AddStockDialogProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (stock: UserStock) => void
  defaultType: "portfolio" | "watchlist"
  // 投資スタイルからのデフォルト設定
  defaultTargetReturnRate?: number | null
  defaultStopLossRate?: number | null
}

export default function AddStockDialog({
  isOpen,
  onClose,
  onSuccess,
  defaultType,
  defaultTargetReturnRate,
  defaultStopLossRate,
}: AddStockDialogProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [showResults, setShowResults] = useState(false)
  const [selectedStock, setSelectedStock] = useState<SearchResult | null>(null)

  // Portfolio fields
  const [quantity, setQuantity] = useState("")
  const [averagePrice, setAveragePrice] = useState("")
  const [purchaseDate, setPurchaseDate] = useState(
    new Date().toISOString().split("T")[0]
  )
  // 売却目標設定（価格で入力）
  const [targetPrice, setTargetPrice] = useState("")
  const [stopLossPrice, setStopLossPrice] = useState("")

  // Watchlist fields
  const [alertPrice, setAlertPrice] = useState("")
  const [addedReason, setAddedReason] = useState("")

  // Common field
  const [note, setNote] = useState("")

  const [loading, setLoading] = useState(false)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // 平均取得単価が変更されたら、投資スタイルの%からデフォルト価格を計算
  // targetPrice/stopLossPriceを依存に入れると無限ループになるため除外
  useEffect(() => {
    const price = parseFloat(averagePrice)
    if (!price || price <= 0) return

    // 利確目標のデフォルト計算
    if (defaultTargetReturnRate && !targetPrice) {
      const defaultTarget = Math.round(price * (1 + defaultTargetReturnRate / 100))
      setTargetPrice(defaultTarget.toString())
    }

    // 損切りのデフォルト計算
    if (defaultStopLossRate && !stopLossPrice) {
      const defaultStop = Math.round(price * (1 + defaultStopLossRate / 100))
      setStopLossPrice(defaultStop.toString())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [averagePrice, defaultTargetReturnRate, defaultStopLossRate])

  // 検索機能
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    // 既に銘柄が選択されている場合は検索をスキップ
    if (selectedStock) {
      setSearchResults([])
      setShowResults(false)
      return
    }

    if (searchQuery.trim().length < 1) {
      setSearchResults([])
      setShowResults(false)
      return
    }

    setSearching(true)
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await fetch(`/api/stocks/search?q=${encodeURIComponent(searchQuery)}`)
        const data = await response.json()
        setSearchResults(data.stocks || [])
        setShowResults(true)
      } catch (error) {
        console.error("Search error:", error)
      } finally {
        setSearching(false)
      }
    }, 300) // 300msのデバウンス
  }, [searchQuery, selectedStock])

  const handleSelectStock = (stock: SearchResult) => {
    // 検索タイムアウトをクリアして、再検索を防ぐ
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }
    // 検索結果を先に非表示にする
    setShowResults(false)
    setSearchResults([])
    // 選択状態を設定
    setSelectedStock(stock)
    // 最後にsearchQueryを更新（useEffectをトリガーするが、selectedStockがあるのでスキップされる）
    setSearchQuery(`${stock.tickerCode} - ${stock.name}`)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // 検索クエリから銘柄コードを取得
    let tickerCode = ""

    if (selectedStock) {
      // 検索結果から選択した場合
      tickerCode = selectedStock.tickerCode
    } else if (searchQuery.trim()) {
      // 直接銘柄コードを入力した場合
      tickerCode = searchQuery.trim().toUpperCase()
      // .T が含まれていなければ追加
      if (!tickerCode.includes(".")) {
        tickerCode += ".T"
      }
    } else {
      setError("銘柄コードを入力するか、検索結果から選択してください")
      return
    }

    // Validate portfolio fields
    if (defaultType === "portfolio") {
      if (!quantity || parseInt(quantity) <= 0) {
        setError("保有株数を入力してください")
        return
      }
      if (!averagePrice || parseFloat(averagePrice) <= 0) {
        setError("平均取得単価を入力してください")
        return
      }
    }

    setLoading(true)

    try {
      const body: any = {
        tickerCode,
        type: defaultType,
      }

      // Add type-specific fields
      if (defaultType === "portfolio") {
        body.quantity = parseInt(quantity)
        body.averagePurchasePrice = parseFloat(averagePrice)
        body.purchaseDate = purchaseDate
        if (note) body.note = note

        // 価格から%を計算して渡す
        const avgPrice = parseFloat(averagePrice)
        if (targetPrice && avgPrice > 0) {
          const targetVal = parseFloat(targetPrice)
          body.targetReturnRate = Math.round(((targetVal - avgPrice) / avgPrice) * 100)
        }
        if (stopLossPrice && avgPrice > 0) {
          const stopVal = parseFloat(stopLossPrice)
          body.stopLossRate = Math.round(((stopVal - avgPrice) / avgPrice) * 100)
        }
      } else {
        if (alertPrice) body.alertPrice = parseFloat(alertPrice)
        if (addedReason) body.addedReason = addedReason
        if (note) body.note = note
      }

      const response = await fetch("/api/user-stocks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "銘柄の追加に失敗しました")
      }

      const newStock = await response.json()
      onSuccess(newStock)

      // Reset form
      setSearchQuery("")
      setSelectedStock(null)
      setQuantity("")
      setAveragePrice("")
      setPurchaseDate(new Date().toISOString().split("T")[0])
      setTargetPrice("")
      setStopLossPrice("")
      setAlertPrice("")
      setAddedReason("")
      setNote("")
    } catch (err: any) {
      console.error(err)
      setError(err.message || "銘柄の追加に失敗しました")
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
            {defaultType === "portfolio" ? "保有銘柄を追加" : "気になる銘柄を追加"}
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

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 銘柄検索 */}
          <div className="relative">
            <label
              htmlFor="searchQuery"
              className="block text-sm font-semibold text-gray-700 mb-2"
            >
              銘柄を検索 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="searchQuery"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                // 入力欄を編集したら選択状態をクリア
                if (selectedStock) {
                  setSelectedStock(null)
                }
              }}
              placeholder="銘柄コードまたは会社名を入力（例: 7203 または トヨタ）"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoComplete="off"
              required
            />
            {searching && (
              <div className="absolute right-3 top-11 text-gray-400">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
            )}

            {/* 検索結果 */}
            {showResults && searchResults.length > 0 && (
              <div className="absolute z-20 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {searchResults.map((stock) => (
                  <button
                    key={stock.id}
                    type="button"
                    onClick={() => handleSelectStock(stock)}
                    className="w-full px-4 py-3 text-left hover:bg-blue-50 border-b border-gray-100 last:border-b-0"
                  >
                    <div className="font-semibold text-gray-900">{stock.name}</div>
                    <div className="text-sm text-gray-600 flex items-center gap-2 mt-1">
                      <span>{stock.tickerCode}</span>
                      {stock.sector && (
                        <>
                          <span>•</span>
                          <span>{stock.sector}</span>
                        </>
                      )}
                      {stock.latestPrice && (
                        <>
                          <span>•</span>
                          <span>¥{stock.latestPrice.toLocaleString()}</span>
                        </>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* 検索結果なし */}
            {showResults && searchQuery.length >= 1 && searchResults.length === 0 && !searching && (
              <div className="absolute z-20 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <p className="text-sm text-gray-600">マスタに該当する銘柄が見つかりませんでした</p>
                  <button
                    type="button"
                    onClick={() => setShowResults(false)}
                    className="text-gray-400 hover:text-gray-600 ml-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <p className="text-xs text-gray-500">
                  銘柄コード（例: 7203）を入力して「追加」を押すと、自動的にデータを収集して追加します
                </p>
              </div>
            )}
          </div>

          {/* Portfolio fields */}
          {defaultType === "portfolio" && (
            <div
              onClick={() => {
                // 他のフィールドをクリックしたら検索結果を閉じる
                if (showResults) {
                  setShowResults(false)
                }
              }}
            >
              <div>
                <label
                  htmlFor="quantity"
                  className="block text-sm font-semibold text-gray-700 mb-2"
                >
                  保有株数 <span className="text-red-500">*</span>
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
                  htmlFor="averagePrice"
                  className="block text-sm font-semibold text-gray-700 mb-2"
                >
                  平均取得単価 <span className="text-red-500">*</span>
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
                  required
                />
                <p className="mt-1 text-xs text-gray-500">
                  複数回に分けて購入した場合は、平均価格を入力してください
                </p>
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

              {/* 売却目標設定 */}
              <div className="bg-gray-50 rounded-lg p-4 mt-4">
                <div className="text-sm font-semibold text-gray-700 mb-3">
                  売却目標（任意）
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="targetPrice" className="block text-xs text-gray-600 mb-1">
                      利確価格
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">¥</span>
                      <input
                        type="number"
                        id="targetPrice"
                        value={targetPrice}
                        onChange={(e) => setTargetPrice(e.target.value)}
                        min="0"
                        placeholder={averagePrice ? `例: ${Math.round(parseFloat(averagePrice) * 1.1)}` : "例: 2750"}
                        className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm"
                      />
                    </div>
                    {averagePrice && targetPrice && (
                      <div className="text-xs text-green-600 mt-1">
                        +{Math.round(((parseFloat(targetPrice) - parseFloat(averagePrice)) / parseFloat(averagePrice)) * 100)}%
                      </div>
                    )}
                  </div>
                  <div>
                    <label htmlFor="stopLossPrice" className="block text-xs text-gray-600 mb-1">
                      損切価格
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">¥</span>
                      <input
                        type="number"
                        id="stopLossPrice"
                        value={stopLossPrice}
                        onChange={(e) => setStopLossPrice(e.target.value)}
                        min="0"
                        placeholder={averagePrice ? `例: ${Math.round(parseFloat(averagePrice) * 0.9)}` : "例: 2250"}
                        className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm"
                      />
                    </div>
                    {averagePrice && stopLossPrice && (
                      <div className="text-xs text-red-600 mt-1">
                        {Math.round(((parseFloat(stopLossPrice) - parseFloat(averagePrice)) / parseFloat(averagePrice)) * 100)}%
                      </div>
                    )}
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  売却タイミングの目安として利確・損切りの価格を設定できます
                </p>
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
            </div>
          )}

          {/* Watchlist fields */}
          {defaultType === "watchlist" && (
            <div
              onClick={() => {
                // 他のフィールドをクリックしたら検索結果を閉じる
                if (showResults) {
                  setShowResults(false)
                }
              }}
            >
              <div>
                <label
                  htmlFor="alertPrice"
                  className="block text-sm font-semibold text-gray-700 mb-2"
                >
                  目標価格（任意）
                </label>
                <input
                  type="number"
                  id="alertPrice"
                  value={alertPrice}
                  onChange={(e) => setAlertPrice(e.target.value)}
                  min="0"
                  step="0.01"
                  placeholder="例: 2000"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="mt-1 text-xs text-gray-500">
                  この価格になったら購入を検討したい金額を入力
                </p>
              </div>

              <div>
                <label
                  htmlFor="addedReason"
                  className="block text-sm font-semibold text-gray-700 mb-2"
                >
                  追加理由（任意）
                </label>
                <textarea
                  id="addedReason"
                  value={addedReason}
                  onChange={(e) => setAddedReason(e.target.value)}
                  placeholder="なぜこの銘柄が気になっているか記録できます"
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
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
                  placeholder="その他のメモを記録できます"
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
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
              disabled={loading || (!selectedStock && !searchQuery.trim())}
            >
              {loading ? "追加中..." : "追加"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
