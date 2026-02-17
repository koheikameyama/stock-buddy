# Zustand キャッシュ導入設計

## 概要

画面遷移時のローディングを削減するため、Zustandを使ったクライアントサイドキャッシュを導入する。

## 目的

- 画面遷移時のローディング削減（全ページ間）
- 一度取得したデータをセッション中キャッシュ
- ユーザー操作時は即座にキャッシュ破棄して最新データを取得

## 要件

- キャッシュ有効期間: セッション中のみ（ブラウザを閉じたらリセット）
- TTLベースの自動無効化
- ユーザー操作時の即時無効化

## ストア構造

```typescript
// store/useAppStore.ts
import { create } from "zustand"

interface CacheEntry<T> {
  data: T
  fetchedAt: number
}

interface AppState {
  // ポートフォリオ・ウォッチリスト
  userStocks: CacheEntry<UserStock[]> | null

  // 追跡銘柄
  trackedStocks: CacheEntry<TrackedStock[]> | null

  // 売却済み
  soldStocks: CacheEntry<SoldStock[]> | null

  // 株価（tickerCode → price）
  stockPrices: Map<string, CacheEntry<StockPrice>>

  // ポートフォリオサマリー
  portfolioSummary: CacheEntry<PortfolioSummary> | null

  // アクション
  fetchUserStocks: () => Promise<UserStock[]>
  fetchTrackedStocks: () => Promise<TrackedStock[]>
  fetchSoldStocks: () => Promise<SoldStock[]>
  fetchStockPrices: (tickers: string[]) => Promise<StockPrice[]>
  fetchPortfolioSummary: () => Promise<PortfolioSummary>

  // キャッシュ無効化
  invalidateUserStocks: () => void
  invalidateTrackedStocks: () => void
  invalidateSoldStocks: () => void
  invalidatePortfolioSummary: () => void
  invalidateAll: () => void
}
```

## キャッシュ対象とTTL

| データ | TTL | 破棄タイミング |
|--------|-----|---------------|
| userStocks（ポートフォリオ・ウォッチリスト） | 5分 | 売買・登録・削除時 |
| trackedStocks（追跡銘柄） | 5分 | 追加・削除時 |
| soldStocks（売却済み） | 5分 | 売却時 |
| stockPrices（株価） | 2分 | - |
| portfolioSummary（損益サマリー） | 2分 | 売買時 |

## 適用対象コンポーネント

| コンポーネント | 現状 | 変更後 |
|---------------|------|--------|
| MyStocksClient | useEffect + fetch | useAppStore().fetchUserStocks() |
| PortfolioSummary | useEffect + fetch | useAppStore().fetchPortfolioSummary() |
| FeaturedStocksByCategory | useEffect + fetch | useAppStore().fetchStockPrices() |
| 銘柄詳細ページ | Server Component | 株価のみストア経由に変更 |

## データ変更時の処理

```typescript
// 例: 銘柄売却時
const handleSell = async () => {
  await fetch("/api/user-stocks/sell", { method: "POST", ... })

  // キャッシュを破棄して再取得を促す
  useAppStore.getState().invalidateUserStocks()
  useAppStore.getState().invalidatePortfolioSummary()
}
```

## ファイル構成

```
store/
  useAppStore.ts       # メインストア
lib/
  constants.ts         # TTL定数を追加
```

## 定数

```typescript
// lib/constants.ts に追加
export const CACHE_TTL = {
  USER_STOCKS: 5 * 60 * 1000,      // 5分
  TRACKED_STOCKS: 5 * 60 * 1000,   // 5分
  SOLD_STOCKS: 5 * 60 * 1000,      // 5分
  STOCK_PRICES: 2 * 60 * 1000,     // 2分
  PORTFOLIO_SUMMARY: 2 * 60 * 1000, // 2分
}
```

## キャッシュ判定ロジック

```typescript
const isCacheValid = <T>(entry: CacheEntry<T> | null, ttl: number): boolean => {
  if (!entry) return false
  return Date.now() - entry.fetchedAt < ttl
}

// 使用例
fetchUserStocks: async () => {
  const { userStocks } = get()

  if (isCacheValid(userStocks, CACHE_TTL.USER_STOCKS)) {
    return userStocks.data
  }

  const data = await fetch("/api/user-stocks?mode=all").then(r => r.json())
  set({ userStocks: { data, fetchedAt: Date.now() } })
  return data
}
```

## 注意事項

- 株価は現状5分間隔で更新しているため、2分TTLでも問題なし
- Server Componentでの初期データ取得は維持し、Client Component側でのキャッシュを担当
- 既存のBadgeContext, ChatContextはそのまま維持
