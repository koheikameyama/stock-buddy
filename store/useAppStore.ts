"use client"

// store/useAppStore.ts
import { create } from "zustand"
import { CACHE_TTL, STOCK_PRICE_BATCH_SIZE } from "@/lib/constants"
import { isCacheValid, createCacheEntry } from "./cache-utils"
import {
  CacheEntry,
  UserStock,
  TrackedStock,
  SoldStock,
  StockPrice,
  PortfolioSummary,
  NikkeiData,
} from "./types"

interface AppState {
  // キャッシュデータ
  userStocks: CacheEntry<UserStock[]> | null
  trackedStocks: CacheEntry<TrackedStock[]> | null
  soldStocks: CacheEntry<SoldStock[]> | null
  stockPrices: Map<string, CacheEntry<StockPrice>>
  staleTickers: Set<string>
  portfolioSummary: CacheEntry<PortfolioSummary> | null
  nikkei: CacheEntry<NikkeiData> | null

  // フェッチアクション
  fetchUserStocks: () => Promise<UserStock[]>
  fetchTrackedStocks: () => Promise<TrackedStock[]>
  fetchSoldStocks: () => Promise<SoldStock[]>
  fetchStockPrices: (tickers: string[]) => Promise<Map<string, StockPrice>>
  fetchPortfolioSummary: () => Promise<PortfolioSummary | null>
  fetchNikkei: () => Promise<NikkeiData | null>

  // キャッシュ無効化
  invalidateUserStocks: () => void
  invalidateTrackedStocks: () => void
  invalidateSoldStocks: () => void
  invalidatePortfolioSummary: () => void
  invalidateAll: () => void

  // ローカル状態更新（APIを呼ばずにキャッシュを直接更新）
  addUserStock: (stock: UserStock) => void
  updateUserStock: (stock: UserStock) => void
  removeUserStock: (id: string) => void
  addTrackedStock: (stock: TrackedStock) => void
  removeTrackedStock: (stockId: string) => void
}

export const useAppStore = create<AppState>((set, get) => ({
  // 初期状態
  userStocks: null,
  trackedStocks: null,
  soldStocks: null,
  stockPrices: new Map(),
  staleTickers: new Set(),
  portfolioSummary: null,
  nikkei: null,

  // フェッチ: userStocks
  fetchUserStocks: async () => {
    const cached = get().userStocks
    if (isCacheValid(cached, CACHE_TTL.USER_STOCKS)) {
      return cached.data
    }

    const response = await fetch("/api/user-stocks?mode=all")
    if (!response.ok) throw new Error("Failed to fetch user stocks")
    const data: UserStock[] = await response.json()
    set({ userStocks: createCacheEntry(data) })
    return data
  },

  // フェッチ: trackedStocks
  fetchTrackedStocks: async () => {
    const cached = get().trackedStocks
    if (isCacheValid(cached, CACHE_TTL.TRACKED_STOCKS)) {
      return cached.data
    }

    const response = await fetch("/api/tracked-stocks")
    if (!response.ok) throw new Error("Failed to fetch tracked stocks")
    const data: TrackedStock[] = await response.json()
    set({ trackedStocks: createCacheEntry(data) })
    return data
  },

  // フェッチ: soldStocks
  fetchSoldStocks: async () => {
    const cached = get().soldStocks
    if (isCacheValid(cached, CACHE_TTL.SOLD_STOCKS)) {
      return cached.data
    }

    const response = await fetch("/api/sold-stocks")
    if (!response.ok) throw new Error("Failed to fetch sold stocks")
    const data: SoldStock[] = await response.json()
    set({ soldStocks: createCacheEntry(data) })
    return data
  },

  // フェッチ: stockPrices
  fetchStockPrices: async (tickers: string[]) => {
    if (tickers.length === 0) return new Map()

    const currentPrices = get().stockPrices
    const tickersToFetch: string[] = []
    const result = new Map<string, StockPrice>()

    // キャッシュ有効なものは再利用
    for (const ticker of tickers) {
      const cached = currentPrices.get(ticker) ?? null
      if (isCacheValid(cached, CACHE_TTL.STOCK_PRICES)) {
        result.set(ticker, cached.data)
      } else {
        tickersToFetch.push(ticker)
      }
    }

    // 新規取得が必要なもの（バッチ分割で並列リクエスト）
    if (tickersToFetch.length > 0) {
      const batches: string[][] = []
      for (let i = 0; i < tickersToFetch.length; i += STOCK_PRICE_BATCH_SIZE) {
        batches.push(tickersToFetch.slice(i, i + STOCK_PRICE_BATCH_SIZE))
      }

      const responses = await Promise.allSettled(
        batches.map((batch) =>
          fetch(`/api/stocks/prices?tickers=${batch.join(",")}`)
            .then((res) => (res.ok ? res.json() : null))
        )
      )

      const newPrices = new Map(currentPrices)
      const newStaleTickers = new Set(get().staleTickers)
      for (const res of responses) {
        if (res.status === "fulfilled" && res.value) {
          if (res.value.prices) {
            for (const price of res.value.prices as StockPrice[]) {
              newPrices.set(price.tickerCode, createCacheEntry(price))
              result.set(price.tickerCode, price)
            }
          }
          if (res.value.staleTickers) {
            for (const ticker of res.value.staleTickers as string[]) {
              newStaleTickers.add(ticker)
            }
          }
        }
      }
      set({ stockPrices: newPrices, staleTickers: newStaleTickers })
    }

    return result
  },

  // フェッチ: portfolioSummary
  fetchPortfolioSummary: async () => {
    const cached = get().portfolioSummary
    if (isCacheValid(cached, CACHE_TTL.PORTFOLIO_SUMMARY)) {
      return cached.data
    }

    const response = await fetch("/api/portfolio/summary")
    if (!response.ok) return null
    const json = await response.json()
    if (!json.summary) return null
    const data: PortfolioSummary = json.summary
    set({ portfolioSummary: createCacheEntry(data) })
    return data
  },

  // フェッチ: nikkei
  fetchNikkei: async () => {
    const cached = get().nikkei
    if (isCacheValid(cached, CACHE_TTL.PORTFOLIO_SUMMARY)) {
      return cached.data
    }

    const response = await fetch("/api/market/nikkei")
    if (!response.ok) return null
    const data: NikkeiData = await response.json()
    set({ nikkei: createCacheEntry(data) })
    return data
  },

  // キャッシュ無効化
  invalidateUserStocks: () => set({ userStocks: null }),
  invalidateTrackedStocks: () => set({ trackedStocks: null }),
  invalidateSoldStocks: () => set({ soldStocks: null }),
  invalidatePortfolioSummary: () => set({ portfolioSummary: null, nikkei: null }),
  invalidateAll: () =>
    set({
      userStocks: null,
      trackedStocks: null,
      soldStocks: null,
      stockPrices: new Map(),
      staleTickers: new Set(),
      portfolioSummary: null,
      nikkei: null,
    }),

  // ローカル状態更新
  addUserStock: (stock) => {
    const current = get().userStocks
    if (current) {
      set({ userStocks: createCacheEntry([...current.data, stock]) })
    }
  },

  updateUserStock: (stock) => {
    const current = get().userStocks
    if (current) {
      set({
        userStocks: createCacheEntry(
          current.data.map((s) => (s.id === stock.id ? stock : s))
        ),
      })
    }
  },

  removeUserStock: (id) => {
    const current = get().userStocks
    if (current) {
      set({
        userStocks: createCacheEntry(current.data.filter((s) => s.id !== id)),
      })
    }
  },

  addTrackedStock: (stock) => {
    const current = get().trackedStocks
    if (current) {
      set({ trackedStocks: createCacheEntry([...current.data, stock]) })
    }
  },

  removeTrackedStock: (stockId) => {
    const current = get().trackedStocks
    if (current) {
      set({
        trackedStocks: createCacheEntry(
          current.data.filter((s) => s.stockId !== stockId)
        ),
      })
    }
  },
}))
