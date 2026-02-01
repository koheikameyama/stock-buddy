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

  return (
    <div className="bg-gradient-to-br from-orange-50 to-red-50 rounded-xl p-6 shadow-lg border-2 border-orange-200">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <span className="text-2xl">🔥</span>
            今週のチャンス銘柄
          </h2>
          <div className="group relative">
            <button className="text-gray-400 hover:text-gray-600 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
            <div className="absolute left-0 top-8 w-80 bg-white rounded-lg shadow-xl p-4 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 border border-gray-200">
              <h3 className="font-semibold text-sm text-gray-900 mb-2">スコア計算方法</h3>
              <div className="text-xs text-gray-600 space-y-2">
                <div>
                  <span className="font-semibold">価格上昇 (30点)</span>
                  <p className="text-gray-500">1週間で+10%以上で高得点</p>
                </div>
                <div>
                  <span className="font-semibold">出来高増加 (25点)</span>
                  <p className="text-gray-500">平均の1.5倍以上で高得点</p>
                </div>
                <div>
                  <span className="font-semibold">ボラティリティ (20点)</span>
                  <p className="text-gray-500">適度な値動き（5-15%）で高得点</p>
                </div>
                <div>
                  <span className="font-semibold">モメンタム (15点)</span>
                  <p className="text-gray-500">連続上昇日数で評価</p>
                </div>
                <div className="pt-2 border-t border-gray-200 mt-2">
                  <p className="text-gray-500">合計30点以上の銘柄を選出</p>
                </div>
              </div>
            </div>
          </div>
        </div>
        <span className="text-xs bg-orange-100 text-orange-700 px-3 py-1 rounded-full font-semibold">
          短期狙い
        </span>
      </div>

      <p className="text-sm text-gray-600 mb-6">
        今週、短期的なチャンスが期待できる銘柄です。リスクもあるので慎重に検討しましょう。
      </p>

      {hotStocks.length === 0 ? (
        <div className="bg-white rounded-lg p-8 text-center">
          <div className="text-5xl mb-4">🔍</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            今日はチャンス銘柄が見つかりませんでした
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            市場の状況により、基準を満たす銘柄がない場合があります。
            <br />
            毎日朝7時に自動で分析しています。
          </p>
          <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3 inline-block">
            💡 スコア30点以上、信頼度50%以上の銘柄を選出
          </div>
        </div>
      ) : (

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

      )}

      {/* 注意事項 */}
      {hotStocks.length > 0 && (
        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-xs text-yellow-800 leading-relaxed">
            <span className="font-semibold">⚠️ チャンス銘柄とは:</span>
            短期的な値動きが期待できる銘柄ですが、リスクも高めです。
            予算の{hotStocks[0]?.recommendedBudgetPercent || 10}-20%程度に抑えることをおすすめします。
          </p>
        </div>
      )}
    </div>
  )
}
