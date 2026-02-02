"use client"

import { useState, useEffect, useRef } from "react"

interface UserStock {
  id: string
  userId: string
  stockId: string
  quantity: number | null
  averagePrice: number | null
  purchaseDate: string | null
  lastAnalysis: string | null
  shortTerm: string | null
  mediumTerm: string | null
  longTerm: string | null
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
}

export default function AddStockDialog({
  isOpen,
  onClose,
  onSuccess,
}: AddStockDialogProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [showResults, setShowResults] = useState(false)
  const [selectedStock, setSelectedStock] = useState<SearchResult | null>(null)
  const [quantity, setQuantity] = useState("")
  const [averagePrice, setAveragePrice] = useState("")
  const [purchaseDate, setPurchaseDate] = useState(
    new Date().toISOString().split("T")[0]
  )
  const [loading, setLoading] = useState(false)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // 検索機能
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
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
  }, [searchQuery])

  const handleSelectStock = (stock: SearchResult) => {
    setSelectedStock(stock)
    setSearchQuery(`${stock.tickerCode} - ${stock.name}`)
    setShowResults(false)
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

    setLoading(true)

    try {
      const response = await fetch("/api/user-stocks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tickerCode,
          quantity: quantity ? parseInt(quantity) : null,
          averagePrice: averagePrice ? parseFloat(averagePrice) : null,
          purchaseDate: quantity ? purchaseDate : null,
        }),
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
      <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
            銘柄を追加
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
              銘柄を検索
            </label>
            <input
              type="text"
              id="searchQuery"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="銘柄コードまたは会社名を入力（例: 7203 または トヨタ）"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoComplete="off"
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
                <p className="text-sm text-gray-600 mb-2">マスタに該当する銘柄が見つかりませんでした</p>
                <p className="text-xs text-gray-500">
                  銘柄コードのままで「追加」ボタンを押すと、自動的にデータを取得して追加します
                </p>
              </div>
            )}
          </div>

          {/* Optional holding fields */}
          <div>
            <label
              htmlFor="quantity"
              className="block text-sm font-semibold text-gray-700 mb-2"
            >
              保有株数（オプション）
            </label>
            <input
              type="number"
              id="quantity"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              min="1"
              placeholder="例: 100"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="mt-1 text-xs text-gray-500">
              保有株数を入力すると利益が自動計算されます
            </p>
          </div>

          {quantity && (
            <>
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
            </>
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
              {loading ? "追加中..." : "追加"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
