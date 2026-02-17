# Zustand キャッシュ導入 実装計画

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 画面遷移時のローディングを削減するため、Zustandでクライアントサイドキャッシュを導入する

**Architecture:** Zustandストアで各種データをTTL付きでキャッシュ。セッション中のみ有効。ユーザー操作（売買等）時はキャッシュを即時破棄して再取得。

**Tech Stack:** Zustand, TypeScript, Next.js App Router

---

## Task 1: Zustandのインストールと定数追加

**Files:**
- Modify: `package.json`
- Modify: `lib/constants.ts`

**Step 1: Zustandをインストール**

```bash
npm install zustand
```

**Step 2: インストール確認**

```bash
grep zustand package.json
```

Expected: `"zustand": "^x.x.x"`

**Step 3: TTL定数を追加**

`lib/constants.ts` の末尾に追加:

```typescript
// キャッシュTTL（ミリ秒）
export const CACHE_TTL = {
  USER_STOCKS: 5 * 60 * 1000,       // 5分
  TRACKED_STOCKS: 5 * 60 * 1000,    // 5分
  SOLD_STOCKS: 5 * 60 * 1000,       // 5分
  STOCK_PRICES: 2 * 60 * 1000,      // 2分
  PORTFOLIO_SUMMARY: 2 * 60 * 1000, // 2分
} as const
```

**Step 4: ビルド確認**

```bash
npm run build
```

Expected: ビルド成功

**Step 5: コミット**

```bash
git add package.json package-lock.json lib/constants.ts
git commit -m "feat: Zustandをインストール、キャッシュTTL定数を追加"
```

---

## Task 2: Zustandストアの型定義

**Files:**
- Create: `store/types.ts`

**Step 1: 型定義ファイルを作成**

```typescript
// store/types.ts

export interface CacheEntry<T> {
  data: T
  fetchedAt: number
}

export interface UserStock {
  id: string
  userId: string
  stockId: string
  type: "watchlist" | "portfolio"
  quantity?: number
  averagePurchasePrice?: number
  purchaseDate?: string
  lastAnalysis?: string | null
  shortTerm?: string | null
  mediumTerm?: string | null
  longTerm?: string | null
  recommendation?: "buy" | "sell" | "hold" | null
  analyzedAt?: string | null
  stock: {
    id: string
    tickerCode: string
    name: string
    sector: string | null
    market: string
    currentPrice: number | null
  }
  createdAt: string
  updatedAt: string
}

export interface TrackedStock {
  id: string
  stockId: string
  stock: {
    id: string
    tickerCode: string
    name: string
    sector: string | null
    market: string
  }
  currentPrice: number | null
  change: number | null
  changePercent: number | null
  createdAt: string
}

export interface SoldStock {
  id: string
  stockId: string
  stock: {
    id: string
    tickerCode: string
    name: string
    sector: string | null
    market: string
  }
  firstPurchaseDate: string
  lastSellDate: string
  totalBuyQuantity: number
  totalBuyAmount: number
  totalSellAmount: number
  totalProfit: number
  profitPercent: number
  transactions: {
    id: string
    type: string
    quantity: number
    price: number
    totalAmount: number
    transactionDate: string
    note: string | null
  }[]
}

export interface StockPrice {
  tickerCode: string
  currentPrice: number
  previousClose: number
  change: number
  changePercent: number
  volume: number
  high: number
  low: number
}

export interface PortfolioSummary {
  totalValue: number
  totalCost: number
  unrealizedGain: number
  unrealizedGainPercent: number
}

export interface NikkeiData {
  changePercent: number
}
```

**Step 2: TypeScript確認**

```bash
npx tsc --noEmit
```

Expected: エラーなし

**Step 3: コミット**

```bash
git add store/types.ts
git commit -m "feat: Zustandストアの型定義を追加"
```

---

## Task 3: キャッシュユーティリティ関数

**Files:**
- Create: `store/cache-utils.ts`

**Step 1: ユーティリティ関数を作成**

```typescript
// store/cache-utils.ts
import { CacheEntry } from "./types"

/**
 * キャッシュが有効かどうかを判定
 */
export function isCacheValid<T>(
  entry: CacheEntry<T> | null,
  ttl: number
): entry is CacheEntry<T> {
  if (!entry) return false
  return Date.now() - entry.fetchedAt < ttl
}

/**
 * キャッシュエントリを作成
 */
export function createCacheEntry<T>(data: T): CacheEntry<T> {
  return {
    data,
    fetchedAt: Date.now(),
  }
}
```

**Step 2: TypeScript確認**

```bash
npx tsc --noEmit
```

Expected: エラーなし

**Step 3: コミット**

```bash
git add store/cache-utils.ts
git commit -m "feat: キャッシュユーティリティ関数を追加"
```

---

## Task 4: Zustandストア本体（データ部分）

**Files:**
- Create: `store/useAppStore.ts`

**Step 1: ストアの基本構造を作成**

```typescript
// store/useAppStore.ts
import { create } from "zustand"
import { CACHE_TTL } from "@/lib/constants"
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
      const cached = currentPrices.get(ticker)
      if (isCacheValid(cached, CACHE_TTL.STOCK_PRICES)) {
        result.set(ticker, cached.data)
      } else {
        tickersToFetch.push(ticker)
      }
    }

    // 新規取得が必要なもの
    if (tickersToFetch.length > 0) {
      const response = await fetch(
        `/api/stocks/prices?tickers=${tickersToFetch.join(",")}`
      )
      if (response.ok) {
        const data = await response.json()
        const newPrices = new Map(currentPrices)
        for (const price of data.prices as StockPrice[]) {
          newPrices.set(price.tickerCode, createCacheEntry(price))
          result.set(price.tickerCode, price)
        }
        set({ stockPrices: newPrices })
      }
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
```

**Step 2: TypeScript確認**

```bash
npx tsc --noEmit
```

Expected: エラーなし

**Step 3: コミット**

```bash
git add store/useAppStore.ts
git commit -m "feat: Zustandストア本体を実装"
```

---

## Task 5: MyStocksClientをストア対応に変更

**Files:**
- Modify: `app/my-stocks/MyStocksClient.tsx`

**Step 1: インポート追加と型をストアから使用**

ファイル先頭のインポートを変更:

```typescript
"use client"

import { useEffect, useState, useMemo, useCallback } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import StockCard from "./StockCard"
import TrackedStockCard from "./TrackedStockCard"
import SoldStockCard from "./SoldStockCard"
import AddStockDialog from "./AddStockDialog"
import AdditionalPurchaseDialog from "./AdditionalPurchaseDialog"
import { UPDATE_SCHEDULES, MAX_PORTFOLIO_STOCKS, MAX_WATCHLIST_STOCKS, CACHE_TTL } from "@/lib/constants"
import { useMarkPageSeen } from "@/app/hooks/useMarkPageSeen"
import { useAppStore } from "@/store/useAppStore"
import type { UserStock, TrackedStock, SoldStock, StockPrice } from "@/store/types"
```

**Step 2: ローカルの型定義を削除**

以下の型定義（14行目〜106行目あたり）を削除:
- `interface UserStock { ... }`
- `interface StockPrice { ... }`
- `interface PurchaseRecommendation { ... }`
- `interface TrackedStock { ... }`
- `interface SoldStock { ... }`

`PurchaseRecommendation`はそのまま残す（ストアに含めていないため）:

```typescript
interface PurchaseRecommendation {
  recommendation: "buy" | "stay"
  confidence: number
  reason: string
  caution: string
  analyzedAt?: string
}
```

**Step 3: useStateをストアに置き換え**

コンポーネント内の状態管理を変更:

```typescript
export default function MyStocksClient() {
  const router = useRouter()
  useMarkPageSeen("my-stocks")

  // ストアから取得
  const {
    fetchUserStocks,
    fetchTrackedStocks,
    fetchSoldStocks,
    fetchStockPrices,
    addUserStock,
    updateUserStock,
    removeTrackedStock,
    invalidateUserStocks,
    invalidatePortfolioSummary,
  } = useAppStore()

  // ローカル状態（キャッシュしないもの）
  const [userStocks, setUserStocks] = useState<UserStock[]>([])
  const [trackedStocks, setTrackedStocks] = useState<TrackedStock[]>([])
  const [soldStocks, setSoldStocks] = useState<SoldStock[]>([])
  const [prices, setPrices] = useState<Record<string, StockPrice>>({})
  const [recommendations, setRecommendations] = useState<Record<string, PurchaseRecommendation>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // ... 他のローカル状態は維持
```

**Step 4: 初回データ取得をストア経由に変更**

最初のuseEffectを変更:

```typescript
  // Fetch all data on initial load
  useEffect(() => {
    async function fetchData() {
      try {
        const [stocksData, trackedData, soldData] = await Promise.all([
          fetchUserStocks(),
          fetchTrackedStocks().catch(() => []),
          fetchSoldStocks().catch(() => []),
        ])

        setUserStocks(stocksData)
        setTrackedStocks(trackedData)
        setSoldStocks(soldData)
      } catch (err) {
        console.error("Error fetching data:", err)
        setError("銘柄の取得に失敗しました")
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [fetchUserStocks, fetchTrackedStocks, fetchSoldStocks])
```

**Step 5: 株価取得をストア経由に変更**

株価取得のuseEffectを変更:

```typescript
  // Fetch stock prices for active tab only
  useEffect(() => {
    async function fetchPricesFromStore() {
      let tickerCodes: string[] = []

      if (activeTab === "portfolio") {
        tickerCodes = userStocks
          .filter((s) => s.type === "portfolio" && (s.quantity ?? 0) > 0)
          .map((s) => s.stock.tickerCode)
      } else if (activeTab === "watchlist") {
        tickerCodes = userStocks
          .filter((s) => s.type === "watchlist")
          .map((s) => s.stock.tickerCode)
      }

      if (tickerCodes.length === 0) return

      try {
        const priceMap = await fetchStockPrices(tickerCodes)
        const priceRecord: Record<string, StockPrice> = {}
        priceMap.forEach((price, ticker) => {
          priceRecord[ticker] = price
        })
        setPrices((prev) => ({ ...prev, ...priceRecord }))
      } catch (err) {
        console.error("Error fetching prices:", err)
      }
    }

    if (userStocks.length > 0 && (activeTab === "portfolio" || activeTab === "watchlist")) {
      fetchPricesFromStore()
      const interval = setInterval(fetchPricesFromStore, 5 * 60 * 1000)
      return () => clearInterval(interval)
    }
  }, [userStocks, activeTab, fetchStockPrices])
```

**Step 6: 追跡銘柄の株価取得も同様に変更**

```typescript
  // Fetch stock prices for tracked stocks
  useEffect(() => {
    async function fetchTrackedPrices() {
      const tickerCodes = trackedStocks.map((s) => s.stock.tickerCode)
      if (tickerCodes.length === 0) return

      try {
        const priceMap = await fetchStockPrices(tickerCodes)

        setTrackedStocks((prev) =>
          prev.map((ts) => {
            const priceData = priceMap.get(ts.stock.tickerCode)
            return priceData
              ? {
                  ...ts,
                  currentPrice: priceData.currentPrice,
                  change: priceData.change,
                  changePercent: priceData.changePercent,
                }
              : ts
          })
        )
      } catch (err) {
        console.error("Error fetching tracked prices:", err)
      }
    }

    if (activeTab === "tracked" && trackedStocks.length > 0) {
      fetchTrackedPrices()
    }
  }, [activeTab, trackedStocks.length, fetchStockPrices])
```

**Step 7: ハンドラー関数でキャッシュ無効化を追加**

売買後のハンドラーにキャッシュ無効化を追加:

```typescript
  const handleTransactionSuccess = (updatedStock: UserStock) => {
    setUserStocks((prev) =>
      prev.map((s) => (s.id === updatedStock.id ? updatedStock : s))
    )
    updateUserStock(updatedStock)
    invalidatePortfolioSummary() // サマリーを再取得させる
    setShowTransactionDialog(false)
    setSelectedStock(null)
  }
```

**Step 8: TypeScript確認**

```bash
npx tsc --noEmit
```

Expected: エラーなし

**Step 9: 動作確認**

```bash
npm run dev
```

ブラウザで http://localhost:3000/my-stocks を開き:
- 初回: ローディング後にデータ表示
- ダッシュボードに移動して戻る: 即座に表示（キャッシュ使用）

**Step 10: コミット**

```bash
git add app/my-stocks/MyStocksClient.tsx
git commit -m "refactor: MyStocksClientをZustandストア対応に変更"
```

---

## Task 6: PortfolioSummaryをストア対応に変更

**Files:**
- Modify: `app/dashboard/PortfolioSummary.tsx`

**Step 1: インポートとストア使用に変更**

```typescript
"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useAppStore } from "@/store/useAppStore"
import type { PortfolioSummary as PortfolioSummaryData, NikkeiData } from "@/store/types"

interface PortfolioSummaryProps {
  hasHoldings: boolean
}

export default function PortfolioSummary({ hasHoldings }: PortfolioSummaryProps) {
  const { fetchPortfolioSummary, fetchNikkei } = useAppStore()
  const [summary, setSummary] = useState<PortfolioSummaryData | null>(null)
  const [nikkei, setNikkei] = useState<NikkeiData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!hasHoldings) {
      setLoading(false)
      return
    }

    const fetchData = async () => {
      try {
        const [summaryData, nikkeiData] = await Promise.all([
          fetchPortfolioSummary(),
          fetchNikkei(),
        ])

        setSummary(summaryData)
        setNikkei(nikkeiData)
      } catch (error) {
        console.error("Error fetching data:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [hasHoldings, fetchPortfolioSummary, fetchNikkei])

  // ... 残りのコードは変更なし（loadingとsummaryの表示部分）
```

**Step 2: ローカル型定義を削除**

元のファイルから以下を削除:
- `interface PortfolioSummaryData { ... }`
- `interface NikkeiData { ... }`

**Step 3: TypeScript確認**

```bash
npx tsc --noEmit
```

Expected: エラーなし

**Step 4: 動作確認**

```bash
npm run dev
```

ダッシュボードで:
- 初回: ローディング後に表示
- マイ銘柄に移動して戻る: 即座に表示

**Step 5: コミット**

```bash
git add app/dashboard/PortfolioSummary.tsx
git commit -m "refactor: PortfolioSummaryをZustandストア対応に変更"
```

---

## Task 7: ストアのエクスポート整理

**Files:**
- Create: `store/index.ts`

**Step 1: index.tsを作成**

```typescript
// store/index.ts
export { useAppStore } from "./useAppStore"
export type {
  CacheEntry,
  UserStock,
  TrackedStock,
  SoldStock,
  StockPrice,
  PortfolioSummary,
  NikkeiData,
} from "./types"
```

**Step 2: インポートパスを更新（任意）**

MyStocksClient, PortfolioSummaryのインポートを簡略化できる:

```typescript
import { useAppStore, UserStock, TrackedStock } from "@/store"
```

**Step 3: コミット**

```bash
git add store/index.ts
git commit -m "refactor: ストアのエクスポートを整理"
```

---

## Task 8: ビルド・動作確認

**Step 1: ビルド**

```bash
npm run build
```

Expected: ビルド成功

**Step 2: 本番モードで動作確認**

```bash
npm run start
```

以下を確認:
- ダッシュボード → マイ銘柄 → ダッシュボード: キャッシュが効いて即表示
- 銘柄の追加・削除: キャッシュ無効化後に再取得
- 5分以上経過後: TTL切れで再取得

**Step 3: 最終コミット**

```bash
git add .
git commit -m "feat: Zustandによるクライアントサイドキャッシュ導入完了"
```

---

## 完了後の確認事項

- [ ] 画面遷移時のローディングが減少している
- [ ] 売買操作後にデータが正しく更新される
- [ ] 5分後（TTL切れ）に再取得される
- [ ] ブラウザリロードでキャッシュがクリアされる
