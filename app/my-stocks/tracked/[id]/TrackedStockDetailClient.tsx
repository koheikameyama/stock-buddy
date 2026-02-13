"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import FinancialMetrics from "@/app/components/FinancialMetrics"
import EarningsInfo from "@/app/components/EarningsInfo"
import StockChart from "@/app/components/StockChart"
import PriceHistory from "@/app/components/PriceHistory"
import RelatedNews from "@/app/components/RelatedNews"
import StockDetailLayout from "@/app/components/StockDetailLayout"
import CurrentPriceCard from "@/app/components/CurrentPriceCard"
import DeleteButton from "@/app/components/DeleteButton"
import AddStockDialog from "../../AddStockDialog"
import { useStockPrice } from "@/app/hooks/useStockPrice"

interface TrackedStockData {
  id: string
  stockId: string
  stock: {
    id: string
    tickerCode: string
    name: string
    sector: string | null
    market: string
    currentPrice: number | null
    fiftyTwoWeekHigh: number | null
    fiftyTwoWeekLow: number | null
    pbr: number | null
    per: number | null
    roe: number | null
    operatingCF: number | null
    freeCF: number | null
  }
  createdAt: string
}

export default function TrackedStockDetailClient({ stock }: { stock: TrackedStockData }) {
  const router = useRouter()
  const { price, loading } = useStockPrice(stock.stock.tickerCode)
  const [showPurchaseDialog, setShowPurchaseDialog] = useState(false)
  const [movingToWatchlist, setMovingToWatchlist] = useState(false)

  const currentPrice = price?.currentPrice || stock.stock.currentPrice || 0

  const handleDelete = async () => {
    if (!confirm(`${stock.stock.name}の追跡をやめますか？`)) {
      return
    }

    try {
      const response = await fetch(`/api/tracked-stocks/${stock.id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "削除に失敗しました")
      }

      router.push("/my-stocks")
    } catch (err: any) {
      console.error(err)
      alert(err.message || "削除に失敗しました")
    }
  }

  const handleMoveToWatchlist = async () => {
    setMovingToWatchlist(true)
    try {
      const response = await fetch("/api/user-stocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tickerCode: stock.stock.tickerCode,
          type: "watchlist",
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to add to watchlist")
      }

      await fetch(`/api/tracked-stocks/${stock.id}`, {
        method: "DELETE",
      })

      router.push("/my-stocks")
    } catch (err: any) {
      console.error(err)
      alert(err.message || "追加に失敗しました")
    } finally {
      setMovingToWatchlist(false)
    }
  }

  return (
    <StockDetailLayout
      name={stock.stock.name}
      tickerCode={stock.stock.tickerCode}
      sector={stock.stock.sector}
      badge="追跡中"
    >
      {/* Current Price Section */}
      <CurrentPriceCard
        price={price}
        loading={loading}
        fiftyTwoWeekHigh={stock.stock.fiftyTwoWeekHigh}
        fiftyTwoWeekLow={stock.stock.fiftyTwoWeekLow}
        actions={
          <>
            <button
              onClick={handleMoveToWatchlist}
              disabled={movingToWatchlist}
              className="px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded transition-colors disabled:opacity-50"
            >
              {movingToWatchlist ? "移動中..." : "気になるへ"}
            </button>
            <button
              onClick={() => setShowPurchaseDialog(true)}
              className="px-2 py-1 text-xs font-medium text-green-600 hover:bg-green-50 rounded transition-colors"
            >
              +購入
            </button>
          </>
        }
      />

      {/* Info Box - No AI Analysis */}
      <section className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
        <div className="flex items-start gap-3">
          <span className="text-xl">👁️</span>
          <div>
            <p className="text-sm text-blue-800 font-semibold mb-1">
              追跡モード
            </p>
            <p className="text-xs text-blue-700">
              この銘柄はAI分析なしで株価を追跡しています。AI分析を利用するには「気になる」へ移動してください。
            </p>
          </div>
        </div>
      </section>

      {/* Earnings Info Section */}
      {price?.earnings && <EarningsInfo earnings={price.earnings} />}

      {/* Related News Section */}
      <RelatedNews stockId={stock.stockId} />

      {/* Chart Section */}
      <StockChart stockId={stock.stockId} />

      {/* Price History Section */}
      <PriceHistory stockId={stock.stockId} />

      {/* Financial Metrics Section */}
      <FinancialMetrics stock={stock.stock} />

      {/* Delete Button */}
      <DeleteButton label="追跡をやめる" onClick={handleDelete} />

      {/* Purchase Dialog */}
      <AddStockDialog
        isOpen={showPurchaseDialog}
        onClose={() => setShowPurchaseDialog(false)}
        onSuccess={async () => {
          await fetch(`/api/tracked-stocks/${stock.id}`, {
            method: "DELETE",
          })
          setShowPurchaseDialog(false)
          router.push("/my-stocks")
        }}
        defaultType="portfolio"
        initialStock={{
          id: stock.stock.id,
          tickerCode: stock.stock.tickerCode,
          name: stock.stock.name,
          market: stock.stock.market,
          sector: stock.stock.sector,
          latestPrice: currentPrice || null,
        }}
      />
    </StockDetailLayout>
  )
}
