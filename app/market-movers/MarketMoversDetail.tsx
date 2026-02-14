"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import BackButton from "@/app/components/BackButton"
import AddStockDialog from "@/app/my-stocks/AddStockDialog"

interface RelatedNewsItem {
  title: string
  url: string | null
  sentiment: string | null
}

interface MoverStock {
  position: number
  changeRate: number
  analysis: string
  relatedNews: RelatedNewsItem[] | null
  stock: {
    id: string
    tickerCode: string
    name: string
    sector: string | null
    market?: string
    latestPrice: number | null
  }
}

interface MoversData {
  gainers: MoverStock[]
  losers: MoverStock[]
  date: string | null
  isToday: boolean
}

export default function MarketMoversDetail() {
  const [data, setData] = useState<MoversData | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [dialogType, setDialogType] = useState<"watchlist" | "tracked" | null>(null)
  const [dialogStock, setDialogStock] = useState<{
    id: string
    tickerCode: string
    name: string
    market: string
    sector: string | null
    latestPrice: number | null
  } | null>(null)

  useEffect(() => {
    async function fetchMovers() {
      try {
        const response = await fetch("/api/market-analysis/gainers-losers")
        const result = await response.json()
        if (response.ok) {
          setData(result)
        }
      } catch (error) {
        console.error("Error fetching market movers:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchMovers()
  }, [])

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id)
  }

  const handleAddStock = (
    type: "watchlist" | "tracked",
    stock: MoverStock["stock"]
  ) => {
    setDialogStock({
      id: stock.id,
      tickerCode: stock.tickerCode,
      name: stock.name,
      market: stock.market || "プライム",
      sector: stock.sector,
      latestPrice: stock.latestPrice,
    })
    setDialogType(type)
  }

  if (loading) {
    return (
      <>
        <BackButton href="/dashboard" label="ダッシュボード" />
        <div className="mb-6 sm:mb-8">
          <div className="w-48 h-8 bg-gray-200 rounded animate-pulse mb-2" />
          <div className="w-32 h-4 bg-gray-200 rounded animate-pulse" />
        </div>
        {[0, 1].map((section) => (
          <section key={section} className="bg-white rounded-xl shadow-md p-4 sm:p-6 mb-6">
            <div className="w-24 h-6 bg-gray-200 rounded animate-pulse mb-4" />
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
                <div className="flex-1">
                  <div className="w-32 h-4 bg-gray-200 rounded animate-pulse mb-1" />
                  <div className="w-20 h-3 bg-gray-200 rounded animate-pulse" />
                </div>
                <div className="w-16 h-5 bg-gray-200 rounded animate-pulse" />
              </div>
            ))}
          </section>
        ))}
      </>
    )
  }

  if (!data || (data.gainers.length === 0 && data.losers.length === 0)) {
    return (
      <>
        <BackButton href="/dashboard" label="ダッシュボード" />
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
            値上がり・値下がりランキング
          </h1>
        </div>
        <div className="bg-white rounded-xl shadow-md p-6 text-center">
          <div className="text-4xl mb-3">📊</div>
          <p className="text-gray-600">データがまだありません</p>
          <p className="text-xs text-gray-400 mt-1">場後（15:30頃）に自動生成されます</p>
        </div>
      </>
    )
  }

  const dateLabel = data.date
    ? new Date(data.date).toLocaleDateString("ja-JP", {
        month: "long",
        day: "numeric",
      })
    : "最新"

  return (
    <>
      <BackButton href="/dashboard" label="ダッシュボード" />

      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
          値上がり・値下がりランキング
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {dateLabel}の前日比ランキング
          {!data.isToday && (
            <span className="text-xs text-gray-400 ml-1">（最新データ）</span>
          )}
        </p>
      </div>

      {/* 値上がりランキング */}
      {data.gainers.length > 0 && (
        <section className="bg-white rounded-xl shadow-md p-4 sm:p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl">🔺</span>
            <h2 className="text-lg sm:text-xl font-bold text-red-600">
              値上がりトップ{data.gainers.length}
            </h2>
          </div>

          <div className="space-y-0">
            {data.gainers.map((mover) => (
              <MoverCard
                key={`gainer-${mover.position}`}
                mover={mover}
                type="gainer"
                isExpanded={expandedId === `gainer-${mover.position}`}
                onToggle={() => toggleExpand(`gainer-${mover.position}`)}
                onAddStock={handleAddStock}
              />
            ))}
          </div>
        </section>
      )}

      {/* 値下がりランキング */}
      {data.losers.length > 0 && (
        <section className="bg-white rounded-xl shadow-md p-4 sm:p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl">🔻</span>
            <h2 className="text-lg sm:text-xl font-bold text-blue-600">
              値下がりトップ{data.losers.length}
            </h2>
          </div>

          <div className="space-y-0">
            {data.losers.map((mover) => (
              <MoverCard
                key={`loser-${mover.position}`}
                mover={mover}
                type="loser"
                isExpanded={expandedId === `loser-${mover.position}`}
                onToggle={() => toggleExpand(`loser-${mover.position}`)}
                onAddStock={handleAddStock}
              />
            ))}
          </div>
        </section>
      )}

      <p className="text-xs text-gray-400 text-center mt-4">
        ※ 出来高10万株以上の銘柄が対象です。場後に毎日更新されます。
      </p>

      {/* ウォッチリスト / 追跡 追加ダイアログ */}
      {dialogType && dialogStock && (
        <AddStockDialog
          isOpen={true}
          onClose={() => {
            setDialogType(null)
            setDialogStock(null)
          }}
          onSuccess={() => {
            setDialogType(null)
            setDialogStock(null)
            toast.success(
              dialogType === "watchlist"
                ? "ウォッチリストに追加しました"
                : "追跡リストに追加しました"
            )
          }}
          defaultType={dialogType}
          initialStock={dialogStock}
        />
      )}
    </>
  )
}

function MoverCard({
  mover,
  type,
  isExpanded,
  onToggle,
  onAddStock,
}: {
  mover: MoverStock
  type: "gainer" | "loser"
  isExpanded: boolean
  onToggle: () => void
  onAddStock: (type: "watchlist" | "tracked", stock: MoverStock["stock"]) => void
}) {
  const isGainer = type === "gainer"
  const changeColor = isGainer ? "text-red-600" : "text-blue-600"
  const news = (mover.relatedNews as RelatedNewsItem[] | null) || []

  return (
    <div className="border-b border-gray-100 last:border-0">
      {/* サマリー行（タップで展開） */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between py-3 sm:py-4 hover:bg-gray-50/50 transition-colors text-left"
      >
        <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
          <span className="text-sm font-bold text-gray-400 w-5 text-center shrink-0">
            {mover.position}
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-sm sm:text-base font-semibold text-gray-900 truncate">
              {mover.stock.name}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <span>{mover.stock.tickerCode}</span>
              {mover.stock.sector && (
                <>
                  <span>•</span>
                  <span className="truncate">{mover.stock.sector}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="text-right">
            <div className={`text-sm sm:text-base font-bold ${changeColor}`}>
              {isGainer ? "+" : ""}{mover.changeRate.toFixed(2)}%
            </div>
            {mover.stock.latestPrice && (
              <div className="text-xs text-gray-500">
                ¥{mover.stock.latestPrice.toLocaleString()}
              </div>
            )}
          </div>
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* 展開時の詳細 */}
      {isExpanded && (
        <div className="pb-4 pl-7 sm:pl-8 pr-2">
          {/* AI原因分析 */}
          <div className={`rounded-lg p-3 sm:p-4 mb-3 ${isGainer ? "bg-red-50 border border-red-100" : "bg-blue-50 border border-blue-100"}`}>
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-sm">🤖</span>
              <span className="text-xs font-semibold text-gray-700">AI原因分析</span>
            </div>
            <p className="text-sm text-gray-800 leading-relaxed">
              {mover.analysis}
            </p>
          </div>

          {/* 関連ニュース */}
          {news.length > 0 && (
            <div className="mb-3">
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-sm">📰</span>
                <span className="text-xs font-semibold text-gray-700">関連ニュース</span>
              </div>
              <div className="space-y-2">
                {news.map((item, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      {item.url ? (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-gray-800 hover:text-blue-600 transition-colors line-clamp-2"
                        >
                          {item.title}
                        </a>
                      ) : (
                        <p className="text-xs text-gray-800 line-clamp-2">
                          {item.title}
                        </p>
                      )}
                      {item.sentiment && (
                        <span
                          className={`inline-block mt-0.5 px-1.5 py-0.5 text-[10px] rounded ${
                            item.sentiment === "positive"
                              ? "bg-green-100 text-green-700"
                              : item.sentiment === "negative"
                              ? "bg-red-100 text-red-700"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {item.sentiment === "positive"
                            ? "好材料"
                            : item.sentiment === "negative"
                            ? "悪材料"
                            : "中立"}
                        </span>
                      )}
                    </div>
                    {item.url && (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-shrink-0 p-1 text-gray-400 hover:text-blue-500"
                      >
                        <svg
                          className="w-3.5 h-3.5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                          />
                        </svg>
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* アクションボタン（ウォッチリスト詳細と同じパターン） */}
          <div className="flex gap-2 pt-2 border-t border-gray-100">
            <button
              onClick={() => onAddStock("watchlist", mover.stock)}
              className="px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded transition-colors"
            >
              +気になる
            </button>
            <button
              onClick={() => onAddStock("tracked", mover.stock)}
              className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded transition-colors"
            >
              +追跡
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
