"use client"

import { useState, useEffect, useCallback } from "react"
import { FETCH_FAIL_WARNING_THRESHOLD } from "@/lib/constants"

interface Stock {
  id: string
  tickerCode: string
  name: string
  market: string
  latestPrice: number | null
  fetchFailCount: number
  lastFetchFailedAt: string | null
  isDelisted: boolean
  priceUpdatedAt: string | null
  userCount: number
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

type FilterType = "all" | "failed" | "delisted"

export default function AdminStocksClient() {
  const [stocks, setStocks] = useState<Stock[]>([])
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, totalPages: 0 })
  const [filter, setFilter] = useState<FilterType>("all")
  const [search, setSearch] = useState("")
  const [searchInput, setSearchInput] = useState("")
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)

  const fetchStocks = useCallback(async (page = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        filter,
        page: String(page),
        limit: "50",
      })
      if (search) params.set("search", search)

      const response = await fetch(`/api/admin/stocks?${params}`)
      if (!response.ok) throw new Error("Failed to fetch")

      const data = await response.json()
      setStocks(data.stocks)
      setPagination(data.pagination)
    } catch (error) {
      console.error("Error fetching stocks:", error)
    } finally {
      setLoading(false)
    }
  }, [filter, search])

  useEffect(() => {
    fetchStocks()
  }, [fetchStocks])

  const handleToggleDelisted = async (stockId: string, currentValue: boolean) => {
    setUpdating(stockId)
    try {
      const response = await fetch(`/api/admin/stocks/${stockId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDelisted: !currentValue }),
      })

      if (!response.ok) throw new Error("Failed to update")

      setStocks((prev) =>
        prev.map((s) =>
          s.id === stockId ? { ...s, isDelisted: !currentValue } : s
        )
      )
    } catch (error) {
      console.error("Error updating stock:", error)
      alert("更新に失敗しました")
    } finally {
      setUpdating(null)
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearch(searchInput)
  }

  const filterButtons: { key: FilterType; label: string }[] = [
    { key: "all", label: "すべて" },
    { key: "failed", label: "取得失敗あり" },
    { key: "delisted", label: "上場廃止マーク済み" },
  ]

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-4">銘柄マスタ管理</h2>

      {/* フィルター & 検索 */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex gap-2">
          {filterButtons.map((btn) => (
            <button
              key={btn.key}
              onClick={() => setFilter(btn.key)}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                filter === btn.key
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSearch} className="flex gap-2 flex-1">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="銘柄コード or 名前で検索"
            className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <button
            type="submit"
            className="px-4 py-1.5 text-sm bg-gray-800 text-white rounded-lg hover:bg-gray-700"
          >
            検索
          </button>
        </form>
      </div>

      {/* 件数 */}
      <p className="text-sm text-gray-500 mb-3">
        {pagination.total}件中 {(pagination.page - 1) * pagination.limit + 1}-
        {Math.min(pagination.page * pagination.limit, pagination.total)}件を表示
      </p>

      {/* テーブル */}
      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-4 py-3 font-semibold text-gray-700">銘柄</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-700">最新株価</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-700">失敗回数</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-700">利用者数</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-700">状態</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-700">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  読み込み中...
                </td>
              </tr>
            ) : stocks.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  該当する銘柄がありません
                </td>
              </tr>
            ) : (
              stocks.map((stock) => {
                const isWarning = stock.fetchFailCount >= FETCH_FAIL_WARNING_THRESHOLD
                return (
                  <tr
                    key={stock.id}
                    className={`border-b border-gray-100 ${
                      stock.isDelisted
                        ? "bg-red-50"
                        : isWarning
                          ? "bg-amber-50"
                          : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div>
                        <span className="font-semibold text-gray-900">{stock.name}</span>
                        <span className="ml-2 text-xs text-gray-500">{stock.tickerCode}</span>
                      </div>
                      <div className="text-xs text-gray-400">
                        {stock.market}
                        {stock.priceUpdatedAt && (
                          <span className="ml-2">
                            更新: {new Date(stock.priceUpdatedAt).toLocaleDateString("ja-JP")}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {stock.latestPrice != null
                        ? `¥${stock.latestPrice.toLocaleString()}`
                        : <span className="text-gray-400">-</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                        stock.fetchFailCount >= FETCH_FAIL_WARNING_THRESHOLD
                          ? "bg-red-100 text-red-700"
                          : stock.fetchFailCount > 0
                            ? "bg-amber-100 text-amber-700"
                            : "bg-gray-100 text-gray-600"
                      }`}>
                        {stock.fetchFailCount}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {stock.userCount > 0 ? (
                        <span className="text-blue-600 font-semibold">{stock.userCount}</span>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {stock.isDelisted ? (
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                          上場廃止
                        </span>
                      ) : isWarning ? (
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
                          要確認
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                          正常
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleToggleDelisted(stock.id, stock.isDelisted)}
                        disabled={updating === stock.id}
                        className={`px-3 py-1 text-xs font-medium rounded transition-colors disabled:opacity-50 ${
                          stock.isDelisted
                            ? "bg-green-100 text-green-700 hover:bg-green-200"
                            : "bg-red-100 text-red-700 hover:bg-red-200"
                        }`}
                      >
                        {updating === stock.id
                          ? "更新中..."
                          : stock.isDelisted
                            ? "解除"
                            : "廃止マーク"}
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ページネーション */}
      {pagination.totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          <button
            onClick={() => fetchStocks(pagination.page - 1)}
            disabled={pagination.page <= 1}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            前へ
          </button>
          <span className="px-3 py-1.5 text-sm text-gray-600">
            {pagination.page} / {pagination.totalPages}
          </span>
          <button
            onClick={() => fetchStocks(pagination.page + 1)}
            disabled={pagination.page >= pagination.totalPages}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            次へ
          </button>
        </div>
      )}
    </div>
  )
}
