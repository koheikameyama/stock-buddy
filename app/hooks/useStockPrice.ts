"use client"

import { useEffect, useState } from "react"

export interface StockPrice {
  currentPrice: number
  previousClose: number
  change: number
  changePercent: number
  marketTime: number | null
}

interface UseStockPriceResult {
  price: StockPrice | null
  loading: boolean
  error: Error | null
  isStale: boolean
}

export function useStockPrice(tickerCode: string): UseStockPriceResult {
  const [price, setPrice] = useState<StockPrice | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [isStale, setIsStale] = useState(false)

  useEffect(() => {
    async function fetchPrice() {
      setLoading(true)
      setError(null)
      setIsStale(false)
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
        // staleチェック
        if (data.staleTickers?.includes(tickerCode)) {
          setIsStale(true)
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

  return { price, loading, error, isStale }
}
