"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

interface HotStock {
  id: string
  stock: {
    id: string
    ticker: string
    name: string
    sector: string
    currentPrice: number | null
    beginnerFriendlyScore: number
  }
  hotScore: number
  reasons: string[]
  risks: string[]
  recommendedBudgetPercent: number
  recommendation: string
  confidence: number
  validUntil: string
  analyzedAt: string
  isInPortfolio: boolean
  isInWatchlist: boolean
}

interface HotStocksResponse {
  hotStocks: HotStock[]
  count: number
}

export default function HotStocks() {
  const [hotStocks, setHotStocks] = useState<HotStock[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchHotStocks() {
      try {
        const response = await fetch("/api/hot-stocks?limit=3")
        if (!response.ok) {
          throw new Error("チャンス銘柄の取得に失敗しました")
        }
        const data: HotStocksResponse = await response.json()
        setHotStocks(data.hotStocks)
      } catch (err) {
        setError(err instanceof Error ? err.message : "エラーが発生しました")
      } finally {
        setLoading(false)
      }
    }

    fetchHotStocks()
  }, [])

  if (loading) {
    return (
      <div className="bg-white rounded-xl p-6 shadow-md">
        <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
          <span className="text-2xl">🔥</span>
          今週のチャンス銘柄
        </h2>
        <div className="text-center py-8 text-gray-500">
          読み込み中...
        </div>
      </div>
    )
  }

  if (error) {
    return null // エラー時は非表示
  }

  if (hotStocks.length === 0) {
    return null // チャンス銘柄がない場合は非表示
  }

  return (
    <div className="bg-gradient-to-br from-orange-50 to-red-50 rounded-xl p-6 shadow-lg border-2 border-orange-200">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <span className="text-2xl">🔥</span>
          今週のチャンス銘柄
        </h2>
        <span className="text-xs bg-orange-100 text-orange-700 px-3 py-1 rounded-full font-semibold">
          短期狙い
        </span>
      </div>

      <p className="text-sm text-gray-600 mb-6">
        今週、短期的なチャンスが期待できる銘柄です。リスクもあるので慎重に検討しましょう。
      </p>

      <div className="space-y-4">
        {hotStocks.map((hot, index) => (
          <div
            key={hot.id}
            className="bg-white rounded-lg p-4 shadow-sm border border-orange-100 hover:shadow-md transition-shadow"
          >
            {/* ヘッダー */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg font-bold text-orange-600">
                    #{index + 1}
                  </span>
                  <h3 className="text-base font-bold text-gray-900 truncate">
                    {hot.stock.name}
                  </h3>
                  {hot.isInPortfolio && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                      保有中
                    </span>
                  )}
                  {hot.isInWatchlist && (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                      監視中
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500">
                  {hot.stock.ticker} • {hot.stock.sector}
                </p>
              </div>
              <div className="text-right ml-4">
                <div className="text-lg font-bold text-gray-900">
                  {hot.hotScore}
                  <span className="text-sm text-gray-500 font-normal">/100</span>
                </div>
                <div className="text-xs text-gray-500">
                  信頼度 {(hot.confidence * 100).toFixed(0)}%
                </div>
              </div>
            </div>

            {/* 推奨コメント */}
            <div className="mb-3 p-3 bg-orange-50 rounded-lg">
              <p className="text-sm text-gray-700 leading-relaxed">
                {hot.recommendation}
              </p>
            </div>

            {/* 理由 */}
            <div className="mb-3">
              <h4 className="text-xs font-semibold text-gray-700 mb-1">
                チャンスの理由:
              </h4>
              <ul className="text-xs text-gray-600 space-y-0.5">
                {hot.reasons.slice(0, 2).map((reason, i) => (
                  <li key={i} className="flex items-start gap-1">
                    <span className="text-orange-500 mt-0.5">•</span>
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* リスク */}
            <div className="mb-3">
              <h4 className="text-xs font-semibold text-red-700 mb-1">
                ⚠️ リスク:
              </h4>
              <ul className="text-xs text-gray-600 space-y-0.5">
                {hot.risks.slice(0, 2).map((risk, i) => (
                  <li key={i} className="flex items-start gap-1">
                    <span className="text-red-500 mt-0.5">•</span>
                    <span>{risk}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* 推奨投資額 */}
            <div className="flex items-center justify-between pt-3 border-t border-gray-100">
              <div className="text-xs text-gray-600">
                推奨投資額:{" "}
                <span className="font-semibold text-gray-900">
                  予算の{hot.recommendedBudgetPercent}%まで
                </span>
              </div>
              <Link
                href={`/dashboard/stocks/${hot.stock.id}`}
                className="text-xs bg-orange-600 text-white px-3 py-1.5 rounded-lg hover:bg-orange-700 transition-colors font-semibold"
              >
                詳細を見る
              </Link>
            </div>
          </div>
        ))}
      </div>

      {/* 注意事項 */}
      <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
        <p className="text-xs text-yellow-800 leading-relaxed">
          <span className="font-semibold">⚠️ チャンス銘柄とは:</span>
          短期的な値動きが期待できる銘柄ですが、リスクも高めです。
          予算の{hotStocks[0]?.recommendedBudgetPercent || 10}-20%程度に抑えることをおすすめします。
        </p>
      </div>
    </div>
  )
}
