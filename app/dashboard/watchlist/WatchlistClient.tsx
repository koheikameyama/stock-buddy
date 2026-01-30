"use client"

import { useEffect, useState } from "react"

interface Stock {
  id: string
  tickerCode: string
  name: string
  sector: string | null
  beginnerScore: number | null
  growthScore: number | null
  dividendScore: number | null
  stabilityScore: number | null
  liquidityScore: number | null
}

interface WatchlistItem {
  id: string
  stock: Stock
  recommendedPrice: number
  recommendedQty: number
  reason: string | null
  source: string
  targetPrice: number | null
  priceAlert: boolean
  lastAlertSent: Date | null
  buyTimingScore: number | null
  lastAnalyzedAt: Date | null
  virtualBuyPrice: number | null
  virtualBuyDate: Date | null
  virtualQuantity: number | null
  currentPrice: number | null
  priceDate: Date | null
  virtualGainLoss: number | null
  virtualGainLossPct: number | null
  createdAt: Date
  updatedAt: Date
}

export default function WatchlistClient() {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchWatchlist()
  }, [])

  const fetchWatchlist = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/watchlist")
      const data = await response.json()

      if (response.ok) {
        setWatchlist(data.watchlist)
      } else {
        setError(data.error || "ウォッチリストの取得に失敗しました")
      }
    } catch (err) {
      setError("ネットワークエラーが発生しました")
      console.error("Error fetching watchlist:", err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">読み込み中...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-600">{error}</p>
      </div>
    )
  }

  if (watchlist.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
        <p className="text-gray-600 mb-4">
          まだ気になる銘柄がありません
        </p>
        <p className="text-sm text-gray-500">
          オンボーディングから銘柄を追加するか、
          <br />
          ダッシュボードの「今日の注目銘柄」から追加してみましょう
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {watchlist.map((item) => (
        <WatchlistCard
          key={item.id}
          item={item}
          onUpdate={fetchWatchlist}
        />
      ))}
    </div>
  )
}

interface WatchlistCardProps {
  item: WatchlistItem
  onUpdate: () => void
}

function WatchlistCard({ item, onUpdate }: WatchlistCardProps) {
  const [showVirtualPurchase, setShowVirtualPurchase] = useState(false)
  const [showPriceAlert, setShowPriceAlert] = useState(false)

  const hasVirtualPurchase = item.virtualBuyPrice && item.virtualQuantity

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow">
      {/* ヘッダー */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-xl font-bold text-gray-900">
            {item.stock.name}
          </h3>
          <p className="text-sm text-gray-500">{item.stock.tickerCode}</p>
          {item.stock.sector && (
            <span className="inline-block mt-2 px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded">
              {item.stock.sector}
            </span>
          )}
        </div>

        {/* 買い時スコア */}
        {item.buyTimingScore !== null && (
          <div className="text-right">
            <div className="text-sm text-gray-500 mb-1">買い時スコア</div>
            <div className="text-3xl font-bold">
              <span
                className={
                  item.buyTimingScore >= 80
                    ? "text-green-600"
                    : item.buyTimingScore >= 60
                      ? "text-blue-600"
                      : item.buyTimingScore >= 40
                        ? "text-yellow-600"
                        : "text-gray-600"
                }
              >
                {item.buyTimingScore}
              </span>
              <span className="text-lg text-gray-400">/100</span>
            </div>
          </div>
        )}
      </div>

      {/* 現在価格 */}
      {item.currentPrice && (
        <div className="mb-4 pb-4 border-b border-gray-200">
          <div className="flex items-baseline gap-2">
            <span className="text-sm text-gray-500">現在価格:</span>
            <span className="text-2xl font-bold text-gray-900">
              ¥{Number(item.currentPrice).toLocaleString()}
            </span>
            {item.targetPrice && item.currentPrice <= item.targetPrice && (
              <span className="ml-2 px-2 py-1 text-xs bg-green-100 text-green-700 rounded font-medium">
                目標価格達成！
              </span>
            )}
          </div>
        </div>
      )}

      {/* 仮想購入情報 */}
      {hasVirtualPurchase && item.currentPrice && (
        <div className="mb-4 p-4 bg-blue-50 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-blue-900">
              仮想購入シミュレーション
            </h4>
            <button
              onClick={() => setShowVirtualPurchase(true)}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              編集
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-gray-600">購入価格</div>
              <div className="font-semibold">
                ¥{Number(item.virtualBuyPrice).toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-gray-600">数量</div>
              <div className="font-semibold">{item.virtualQuantity}株</div>
            </div>
            <div>
              <div className="text-gray-600">購入日</div>
              <div className="font-semibold">
                {item.virtualBuyDate
                  ? new Date(item.virtualBuyDate).toLocaleDateString("ja-JP")
                  : "-"}
              </div>
            </div>
            <div>
              <div className="text-gray-600">損益</div>
              <div
                className={`font-semibold ${
                  item.virtualGainLoss && item.virtualGainLoss > 0
                    ? "text-green-600"
                    : item.virtualGainLoss && item.virtualGainLoss < 0
                      ? "text-red-600"
                      : "text-gray-900"
                }`}
              >
                {item.virtualGainLoss
                  ? `${item.virtualGainLoss > 0 ? "+" : ""}¥${item.virtualGainLoss.toLocaleString()}`
                  : "-"}
                {item.virtualGainLossPct && (
                  <span className="ml-1 text-xs">
                    ({item.virtualGainLossPct > 0 ? "+" : ""}
                    {item.virtualGainLossPct.toFixed(2)}%)
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* アクションボタン */}
      <div className="flex gap-2">
        {!hasVirtualPurchase && (
          <button
            onClick={() => setShowVirtualPurchase(true)}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            仮想購入してみる
          </button>
        )}

        <button
          onClick={() => setShowPriceAlert(true)}
          className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
        >
          {item.priceAlert ? "アラート設定中" : "価格アラート設定"}
        </button>
      </div>

      {/* モーダル（簡易版：後で実装） */}
      {showVirtualPurchase && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-bold mb-4">仮想購入設定</h3>
            <p className="text-sm text-gray-600 mb-4">
              この機能は次のステップで実装します
            </p>
            <button
              onClick={() => setShowVirtualPurchase(false)}
              className="w-full px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
            >
              閉じる
            </button>
          </div>
        </div>
      )}

      {showPriceAlert && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-bold mb-4">価格アラート設定</h3>
            <p className="text-sm text-gray-600 mb-4">
              この機能は次のステップで実装します
            </p>
            <button
              onClick={() => setShowPriceAlert(false)}
              className="w-full px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
            >
              閉じる
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
