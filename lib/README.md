# Stock Buddy ライブラリ

プロジェクト全体で使用する共通モジュール

## ティッカーコード関連

### `ticker-utils.ts`

東京証券取引所のティッカーコード（`.T` サフィックス）を扱うユーティリティ

**`.T` とは？**
- `.T` = Tokyo Stock Exchange（東京証券取引所）
- 国際的な株価データプロバイダー（Yahoo Finance など）では、取引所を識別するためにサフィックスが必要
- 例: `7203.T` = 東京証券取引所のトヨタ自動車

**主な関数:**

```typescript
import { normalizeTickerCode } from "@/lib/ticker-utils"

// .T サフィックスを確実に付与
normalizeTickerCode("7203")   // "7203.T"
normalizeTickerCode("7203.T") // "7203.T"

// .T サフィックスを削除
removeTickerSuffix("7203.T")  // "7203"
removeTickerSuffix("7203")    // "7203"

// 配列を一括正規化
normalizeTickerCodes(["7203", "9432.T"]) // ["7203.T", "9432.T"]
```

### `stock-price-fetcher.ts`

株価をリアルタイム取得するモジュール（yfinance/Python経由）

**特徴:**
- ティッカーコードの `.T` サフィックスを自動で正規化
- タイムゾーンエラー対策済み
- エラーハンドリング完備

**使い方:**

```typescript
import { fetchStockPrices } from "@/lib/stock-price-fetcher"

// .T の有無を気にせず使える
const prices = await fetchStockPrices(["7203", "9432.T", "9434"])

// 戻り値
// [
//   {
//     tickerCode: "7203.T",
//     currentPrice: 3504,
//     previousClose: 3448,
//     change: 56,
//     changePercent: 1.62,
//     volume: 12345678,
//     high: 3510,
//     low: 3490
//   },
//   ...
// ]
```

**内部実装:**
- Python/yfinance を使用（Railway の本番環境で動作確認済み）
- タイムゾーン設定: `TZ=Asia/Tokyo`
- `tzdata` パッケージが Dockerfile に含まれている

## ポートフォリオ・ウォッチリスト

### `portfolio.ts`

ポートフォリオへの銘柄登録（5銘柄制限、平均取得単価計算、トランザクション記録）

```typescript
import { addStockToPortfolio } from "@/lib/portfolio"

const result = await addStockToPortfolio({
  userId: user.id,
  stockId: stock.id,
  quantity: 100,
  price: 1500,
})
```

### `watchlist.ts`

ウォッチリストへの銘柄登録（5銘柄制限）

```typescript
import { addStockToWatchlist } from "@/lib/watchlist"

const result = await addStockToWatchlist({
  userId: user.id,
  stockId: stock.id,
  recommendedPrice: 1500,
  recommendedQty: 100,
})
```

## Prisma

### `prisma.ts`

グローバル Prisma Client インスタンス（接続プール枯渇対策）

```typescript
import { prisma } from "@/lib/prisma"

// ❌ 悪い例
const prisma = new PrismaClient()

// ✅ 良い例
import { prisma } from "@/lib/prisma"
```

## 注意事項

### ティッカーコードは必ず正規化する

**❌ 悪い例:**
```typescript
// .T の有無を手動でチェック
const ticker = code.endsWith('.T') ? code : `${code}.T`
```

**✅ 良い例:**
```typescript
import { normalizeTickerCode } from "@/lib/ticker-utils"
const ticker = normalizeTickerCode(code)
```

### 株価取得は必ずモジュールを使う

**❌ 悪い例:**
```typescript
// Pythonスクリプトを直接書く
const pythonScript = `
import yfinance as yf
...
`
```

**✅ 良い例:**
```typescript
import { fetchStockPrices } from "@/lib/stock-price-fetcher"
const prices = await fetchStockPrices(tickerCodes)
```

### ポートフォリオ登録は必ずモジュールを使う

**❌ 悪い例:**
```typescript
// 直接 Prisma を使うと制限チェックやトランザクション記録が漏れる
await prisma.portfolioStock.create({...})
```

**✅ 良い例:**
```typescript
import { addStockToPortfolio } from "@/lib/portfolio"
await addStockToPortfolio({...})
```
