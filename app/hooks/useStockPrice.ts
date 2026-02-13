"use client"

import { useEffect, useState } from "react"

export interface StockEarnings {
  isProfitable: boolean | null
  profitTrend: string | null
  revenueGrowth: number | null
  netIncomeGrowth: number | null
  eps: number | null
  latestRevenue: number | null
  latestNetIncome: number | null
}

export interface StockPrice {
  currentPrice: number
  previousClose: number
  change: number
  changePercent: number
  earnings?: StockEarnings | null
}

interface UseStockPriceResult {
  price: StockPrice | null
  loading: boolean
  error: Error | null
}

export function useStockPrice(tickerCode: string): UseStockPriceResult {
  const [price, setPrice] = useState<StockPrice | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    async function fetchPrice() {
      setLoading(true)
      setError(null)
      try {
        // 特定の銘柄を指定して取得（追跡銘柄でも確実に取得できる）
        const response = await fetch(`/api/stocks/prices?tickers=${tickerCode}`)
        if (!response.ok) throw new Error("Failed to fetch price")

        const data = await response.json()
        const priceData = data.prices.find(
          (p: any) => p.tickerCode === tickerCode
        )
        if (priceData) {
          setPrice(priceData)
        }
      } catch (err) {
        console.error("Error fetching price:", err)
        setError(err instanceof Error ? err : new Error("Unknown error"))
      } finally {
        setLoading(false)
      }
    }

    fetchPrice()
  }, [tickerCode])

  return { price, loading, error }
}
