"use client"

import { useState, useEffect } from "react"
import Link from "next/link"

interface StockRequest {
  id: string
  tickerCode: string
  name: string | null
  market: string | null
  reason: string | null
  status: string
  adminNote: string | null
  createdAt: string
  updatedAt: string
}

export default function StockRequestClient() {
  const [tickerCode, setTickerCode] = useState("")
  const [name, setName] = useState("")
  const [market, setMarket] = useState("")
  const [reason, setReason] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [requests, setRequests] = useState<StockRequest[]>([])
  const [loadingRequests, setLoadingRequests] = useState(true)

  // リクエスト一覧を取得
  useEffect(() => {
    fetchRequests()
  }, [])

  const fetchRequests = async () => {
    try {
      setLoadingRequests(true)
      const response = await fetch("/api/stock-requests")
      if (!response.ok) throw new Error("リクエストの取得に失敗しました")
      const data = await response.json()
      setRequests(data.requests)
    } catch (err) {
      console.error("Failed to fetch requests:", err)
    } finally {
      setLoadingRequests(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    setLoading(true)

    try {
      const response = await fetch("/api/stock-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tickerCode,
          name: name || null,
          market: market || null,
          reason: reason || null,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "リクエストの送信に失敗しました")
      }

      // 成功
      setSuccess(true)
      setTickerCode("")
      setName("")
      setMarket("")
      setReason("")

      // リクエスト一覧を再取得
      fetchRequests()
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました")
    } finally {
      setLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <span className="px-2 py-1 text-xs font-semibold bg-yellow-100 text-yellow-700 rounded">審査中</span>
      case "approved":
        return <span className="px-2 py-1 text-xs font-semibold bg-blue-100 text-blue-700 rounded">承認済み</span>
      case "rejected":
        return <span className="px-2 py-1 text-xs font-semibold bg-red-100 text-red-700 rounded">却下</span>
      case "added":
        return <span className="px-2 py-1 text-xs font-semibold bg-green-100 text-green-700 rounded">追加完了</span>
      default:
        return <span className="px-2 py-1 text-xs font-semibold bg-gray-100 text-gray-700 rounded">{status}</span>
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* ヘッダー */}
        <div className="mb-8">
          <Link
            href="/dashboard"
            className="inline-flex items-center text-blue-600 hover:text-blue-700 mb-4"
          >
            <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            ダッシュボードに戻る
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">銘柄リクエスト</h1>
          <p className="text-gray-600">
            取り扱っていない銘柄を追加してほしい場合は、こちらからリクエストできます。
          </p>
        </div>

        {/* リクエストフォーム */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-4">新しい銘柄をリクエスト</h2>

          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                ティッカーコード <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={tickerCode}
                onChange={(e) => setTickerCode(e.target.value)}
                placeholder="例: 6600.T (東証) または AAPL (米国)"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                東証銘柄は「.T」を付けてください（例: 7203.T）
              </p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                銘柄名（任意）
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例: キオクシアホールディングス"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                市場（任意）
              </label>
              <input
                type="text"
                value={market}
                onChange={(e) => setMarket(e.target.value)}
                placeholder="例: 東証プライム、NASDAQ"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                追加希望理由（任意）
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="例: 最近IPOしたばかりで注目している、成長が期待できる"
                rows={3}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {success && (
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm text-green-700">
                  リクエストを送信しました！審査後、追加されます。
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "送信中..." : "リクエストを送信"}
            </button>
          </form>

          <div className="mt-4 p-3 bg-blue-50 rounded-lg">
            <p className="text-xs text-blue-800">
              💡 リクエストは審査後に追加されます。追加された銘柄は自動的に初心者向けスコアが計算され、
              適切な場合はチャンス銘柄として検出されるようになります。
            </p>
          </div>
        </div>

        {/* リクエスト一覧 */}
        <div className="bg-white rounded-xl shadow-md p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">あなたのリクエスト履歴</h2>

          {loadingRequests ? (
            <div className="text-center py-8 text-gray-500">
              読み込み中...
            </div>
          ) : requests.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-5xl mb-4">📝</div>
              <p className="text-gray-600">まだリクエストがありません</p>
              <p className="text-sm text-gray-500 mt-2">
                上のフォームから銘柄をリクエストしてみましょう
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {requests.map((req) => (
                <div
                  key={req.id}
                  className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-gray-900">{req.tickerCode}</h3>
                        {getStatusBadge(req.status)}
                      </div>
                      {req.name && (
                        <p className="text-sm text-gray-600">{req.name}</p>
                      )}
                      {req.market && (
                        <p className="text-xs text-gray-500">{req.market}</p>
                      )}
                    </div>
                    <div className="text-right text-xs text-gray-500">
                      {new Date(req.createdAt).toLocaleDateString("ja-JP")}
                    </div>
                  </div>

                  {req.reason && (
                    <div className="mb-2">
                      <p className="text-xs text-gray-600 bg-gray-50 rounded p-2">
                        {req.reason}
                      </p>
                    </div>
                  )}

                  {req.adminNote && (
                    <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded">
                      <p className="text-xs text-yellow-800">
                        <span className="font-semibold">管理者メモ:</span> {req.adminNote}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
