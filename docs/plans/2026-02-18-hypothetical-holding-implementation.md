# 「今も保有してたら」機能 実装計画

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 売却済み銘柄に「今も保有してたら」の損益を表示し、売却判断の振り返りを可能にする

**Architecture:** sold-stocks APIで現在価格を取得し、hypothetical値を計算してレスポンスに含める。フロントエンドはSoldStockCardと銘柄詳細ページで表示。

**Tech Stack:** Next.js, TypeScript, Prisma, yfinance (Python)

**Linear:** KOH-165

---

### Task 1: SoldStock型に新フィールドを追加

**Files:**
- Modify: `store/types.ts:50-76`

**Step 1: 型定義を更新**

```typescript
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
  // 新規追加
  currentPrice: number | null
  hypotheticalValue: number | null
  hypotheticalProfit: number | null
  hypotheticalProfitPercent: number | null
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
```

**Step 2: Commit**

```bash
git add store/types.ts
git commit -m "feat: SoldStock型にhypotheticalフィールドを追加"
```

---

### Task 2: sold-stocks APIでhypothetical値を計算

**Files:**
- Modify: `app/api/sold-stocks/route.ts`

**Step 1: fetchStockPricesをインポート**

ファイル冒頭にインポートを追加:

```typescript
import { fetchStockPrices } from "@/lib/stock-price-fetcher"
```

**Step 2: 現在価格を取得してhypothetical値を計算**

APIの処理を以下のように変更:

1. まず既存の処理でsoldStocksを抽出
2. ティッカーコードを集めて`fetchStockPrices`で現在価格を取得
3. 各銘柄にhypothetical値を追加

```typescript
// 売却済み銘柄のティッカーコードを収集
const tickerCodes = soldStocks.map((ss) => ss.stock.tickerCode)

// 現在価格を取得
let priceMap: Map<string, number> = new Map()
if (tickerCodes.length > 0) {
  try {
    const prices = await fetchStockPrices(tickerCodes)
    prices.forEach((p) => {
      // .Tを除去してマッピング
      const code = p.tickerCode.replace(/\.T$/, "")
      priceMap.set(code, p.currentPrice)
    })
  } catch (error) {
    console.error("Error fetching current prices:", error)
  }
}

// hypothetical値を計算して追加
const soldStocksWithHypothetical = soldStocks.map((ss) => {
  const currentPrice = priceMap.get(ss.stock.tickerCode) ?? null

  if (currentPrice === null) {
    return {
      ...ss,
      currentPrice: null,
      hypotheticalValue: null,
      hypotheticalProfit: null,
      hypotheticalProfitPercent: null,
    }
  }

  // 今も保有してたらの金額 = 現在価格 × 総購入数
  const hypotheticalValue = currentPrice * ss.totalBuyQuantity
  // 今も保有してたらの損益 = 今も保有してたらの金額 - 購入金額
  const hypotheticalProfit = hypotheticalValue - ss.totalBuyAmount
  // 今も保有してたらの損益% = (損益 / 購入金額) × 100
  const hypotheticalProfitPercent = ss.totalBuyAmount > 0
    ? (hypotheticalProfit / ss.totalBuyAmount) * 100
    : 0

  return {
    ...ss,
    currentPrice,
    hypotheticalValue,
    hypotheticalProfit,
    hypotheticalProfitPercent,
  }
})
```

**Step 3: レスポンスを更新**

```typescript
return NextResponse.json(soldStocksWithHypothetical)
```

**Step 4: 動作確認**

```bash
npm run dev
# ブラウザで /my-stocks にアクセスし、「過去の保有」タブでAPI呼び出しを確認
# DevToolsのNetworkタブで /api/sold-stocks のレスポンスにhypotheticalフィールドがあることを確認
```

**Step 5: Commit**

```bash
git add app/api/sold-stocks/route.ts
git commit -m "feat: sold-stocks APIでhypothetical値を計算"
```

---

### Task 3: SoldStockCardに「今も保有してたら」セクションを追加

**Files:**
- Modify: `app/my-stocks/SoldStockCard.tsx`

**Step 1: interfaceを更新**

SoldStock interfaceに新フィールドを追加:

```typescript
interface SoldStock {
  // ... 既存フィールド
  currentPrice: number | null
  hypotheticalValue: number | null
  hypotheticalProfit: number | null
  hypotheticalProfitPercent: number | null
  transactions: {
    // ...
  }[]
}
```

**Step 2: 評価コメント関数を追加**

コンポーネント外に関数を追加:

```typescript
function getHypotheticalComment(hypotheticalProfitPercent: number, actualProfitPercent: number): string {
  const diff = hypotheticalProfitPercent - actualProfitPercent

  if (diff > 20) {
    return "かなり早めの利確でした"
  } else if (diff > 5) {
    return "早めの利確でした"
  } else if (diff > -5) {
    return "適切なタイミングでした"
  } else if (diff > -20) {
    return "良いタイミングでした"
  } else {
    return "絶好のタイミングでした"
  }
}
```

**Step 3: 「今も保有してたら」セクションをUIに追加**

損益セクションの後、フッターの前に追加:

```tsx
{/* Hypothetical Section */}
{soldStock.hypotheticalProfit !== null && (
  <div className="mt-3 pt-3 border-t border-gray-100">
    <div className="flex items-center gap-1.5 mb-2">
      <span className="text-sm">📊</span>
      <span className="text-xs sm:text-sm font-semibold text-gray-700">
        今も保有してたら
      </span>
    </div>
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-500">
        → {getHypotheticalComment(
            soldStock.hypotheticalProfitPercent ?? 0,
            soldStock.profitPercent
          )}
      </span>
      <div className="text-right">
        <span
          className={`text-sm sm:text-base font-bold ${
            (soldStock.hypotheticalProfit ?? 0) >= 0
              ? "text-green-600"
              : "text-red-600"
          }`}
        >
          {(soldStock.hypotheticalProfit ?? 0) >= 0 ? "+" : ""}
          ¥{(soldStock.hypotheticalProfit ?? 0).toLocaleString()}
        </span>
        <span
          className={`ml-1 text-xs ${
            (soldStock.hypotheticalProfitPercent ?? 0) >= 0
              ? "text-green-600"
              : "text-red-600"
          }`}
        >
          ({(soldStock.hypotheticalProfitPercent ?? 0) >= 0 ? "+" : ""}
          {(soldStock.hypotheticalProfitPercent ?? 0).toFixed(1)}%)
        </span>
      </div>
    </div>
  </div>
)}
```

**Step 4: 動作確認**

```bash
npm run dev
# ブラウザで /my-stocks にアクセスし、「過去の保有」タブで「今も保有してたら」セクションが表示されることを確認
```

**Step 5: Commit**

```bash
git add app/my-stocks/SoldStockCard.tsx
git commit -m "feat: SoldStockCardに「今も保有してたら」セクションを追加"
```

---

### Task 4: 銘柄詳細ページで売却済み情報を取得

**Files:**
- Modify: `app/stocks/[stockId]/page.tsx`

**Step 1: PortfolioStockと売却済み情報を取得**

Promise.allに追加:

```typescript
// Check if user has sold this stock (quantity = 0)
prisma.portfolioStock.findFirst({
  where: { stockId, userId },
  include: {
    transactions: {
      orderBy: { transactionDate: "asc" },
    },
  },
}),
```

**Step 2: 売却済み情報を計算**

calculatePortfolioFromTransactionsをインポートし、売却済みかどうかを判定:

```typescript
import { calculatePortfolioFromTransactions } from "@/lib/portfolio-calculator"
import { fetchStockPrices } from "@/lib/stock-price-fetcher"
import { Decimal } from "@prisma/client/runtime/library"
```

売却済み情報を計算するロジック:

```typescript
// 売却済み情報を計算
let soldStockInfo = null
if (portfolioEntry) {
  const { quantity } = calculatePortfolioFromTransactions(portfolioEntry.transactions)

  // quantity === 0 の場合は売却済み
  if (quantity === 0) {
    const buyTransactions = portfolioEntry.transactions.filter((t) => t.type === "buy")
    const sellTransactions = portfolioEntry.transactions.filter((t) => t.type === "sell")

    if (buyTransactions.length > 0 && sellTransactions.length > 0) {
      const totalBuyAmount = buyTransactions.reduce(
        (sum, t) => sum.plus(t.totalAmount),
        new Decimal(0)
      )
      const totalSellAmount = sellTransactions.reduce(
        (sum, t) => sum.plus(t.totalAmount),
        new Decimal(0)
      )
      const totalBuyQuantity = buyTransactions.reduce((sum, t) => sum + t.quantity, 0)
      const totalProfit = totalSellAmount.minus(totalBuyAmount)
      const profitPercent = totalBuyAmount.gt(0)
        ? totalProfit.div(totalBuyAmount).times(100).toNumber()
        : 0

      // 現在価格を取得
      let currentPrice: number | null = null
      let hypotheticalProfit: number | null = null
      let hypotheticalProfitPercent: number | null = null

      try {
        const prices = await fetchStockPrices([stock.tickerCode])
        if (prices.length > 0) {
          currentPrice = prices[0].currentPrice
          const hypotheticalValue = currentPrice * totalBuyQuantity
          hypotheticalProfit = hypotheticalValue - totalBuyAmount.toNumber()
          hypotheticalProfitPercent = totalBuyAmount.gt(0)
            ? (hypotheticalProfit / totalBuyAmount.toNumber()) * 100
            : 0
        }
      } catch (error) {
        console.error("Error fetching current price:", error)
      }

      soldStockInfo = {
        lastSellDate: sellTransactions[sellTransactions.length - 1].transactionDate.toISOString(),
        totalBuyQuantity,
        totalBuyAmount: totalBuyAmount.toNumber(),
        totalSellAmount: totalSellAmount.toNumber(),
        totalProfit: totalProfit.toNumber(),
        profitPercent,
        currentPrice,
        hypotheticalProfit,
        hypotheticalProfitPercent,
      }
    }
  }
}
```

**Step 3: StockDetailClientにpropsを渡す**

```tsx
<StockDetailClient
  stock={stockData}
  recommendation={recommendation}
  isInWatchlist={!!watchlistEntry}
  isTracked={!!trackedEntry}
  trackedStockId={trackedEntry?.id}
  soldStockInfo={soldStockInfo}
/>
```

**Step 4: Commit**

```bash
git add app/stocks/[stockId]/page.tsx
git commit -m "feat: 銘柄詳細ページで売却済み情報を取得"
```

---

### Task 5: 銘柄詳細ページに売却済みセクションを表示

**Files:**
- Modify: `app/stocks/[stockId]/StockDetailClient.tsx`

**Step 1: Propsにsold情報を追加**

```typescript
interface SoldStockInfo {
  lastSellDate: string
  totalBuyQuantity: number
  totalBuyAmount: number
  totalSellAmount: number
  totalProfit: number
  profitPercent: number
  currentPrice: number | null
  hypotheticalProfit: number | null
  hypotheticalProfitPercent: number | null
}

interface Props {
  stock: StockData
  recommendation: RecommendationData | null
  isInWatchlist: boolean
  isTracked: boolean
  trackedStockId?: string
  soldStockInfo?: SoldStockInfo | null
}
```

**Step 2: 評価コメント関数を追加**

```typescript
function getHypotheticalComment(hypotheticalProfitPercent: number, actualProfitPercent: number): string {
  const diff = hypotheticalProfitPercent - actualProfitPercent

  if (diff > 20) {
    return "かなり早めの利確でした"
  } else if (diff > 5) {
    return "早めの利確でした"
  } else if (diff > -5) {
    return "適切なタイミングでした"
  } else if (diff > -20) {
    return "良いタイミングでした"
  } else {
    return "絶好のタイミングでした"
  }
}
```

**Step 3: 売却済みセクションをUIに追加**

CurrentPriceCardの後、AI Recommendation Sectionの前に追加:

```tsx
{/* Sold Stock Info Section */}
{soldStockInfo && (
  <section className="bg-white rounded-xl shadow-md p-4 sm:p-6 mb-6">
    <div className="flex items-center gap-2 mb-4">
      <span className="text-lg">📦</span>
      <h2 className="text-lg sm:text-xl font-bold text-gray-900">
        売却済み
      </h2>
      <span className="text-xs text-gray-400">
        {new Date(soldStockInfo.lastSellDate).toLocaleDateString("ja-JP")}
      </span>
    </div>

    {/* 売却実績 */}
    <div className="grid grid-cols-2 gap-4 mb-4">
      <div>
        <span className="text-xs text-gray-500 block">購入金額</span>
        <span className="text-base font-bold text-gray-900">
          ¥{soldStockInfo.totalBuyAmount.toLocaleString()}
        </span>
      </div>
      <div>
        <span className="text-xs text-gray-500 block">売却金額</span>
        <span className="text-base font-bold text-gray-900">
          ¥{soldStockInfo.totalSellAmount.toLocaleString()}
        </span>
      </div>
    </div>

    {/* 損益 */}
    <div
      className={`rounded-lg p-4 mb-4 ${
        soldStockInfo.totalProfit >= 0
          ? "bg-gradient-to-r from-green-50 to-emerald-50"
          : "bg-gradient-to-r from-red-50 to-rose-50"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-600">損益</span>
        <div className="text-right">
          <span
            className={`text-lg font-bold ${
              soldStockInfo.totalProfit >= 0 ? "text-green-600" : "text-red-600"
            }`}
          >
            {soldStockInfo.totalProfit >= 0 ? "+" : ""}
            ¥{soldStockInfo.totalProfit.toLocaleString()}
          </span>
          <span
            className={`ml-2 text-sm ${
              soldStockInfo.profitPercent >= 0 ? "text-green-600" : "text-red-600"
            }`}
          >
            ({soldStockInfo.profitPercent >= 0 ? "+" : ""}
            {soldStockInfo.profitPercent.toFixed(1)}%)
          </span>
        </div>
      </div>
    </div>

    {/* 今も保有してたら */}
    {soldStockInfo.hypotheticalProfit !== null && (
      <div className="border-t border-gray-100 pt-4">
        <div className="flex items-center gap-1.5 mb-2">
          <span className="text-sm">📊</span>
          <span className="text-sm font-semibold text-gray-700">
            今も保有してたら
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">
            → {getHypotheticalComment(
                soldStockInfo.hypotheticalProfitPercent ?? 0,
                soldStockInfo.profitPercent
              )}
          </span>
          <div className="text-right">
            <span
              className={`text-base font-bold ${
                (soldStockInfo.hypotheticalProfit ?? 0) >= 0
                  ? "text-green-600"
                  : "text-red-600"
              }`}
            >
              {(soldStockInfo.hypotheticalProfit ?? 0) >= 0 ? "+" : ""}
              ¥{(soldStockInfo.hypotheticalProfit ?? 0).toLocaleString()}
            </span>
            <span
              className={`ml-1 text-xs ${
                (soldStockInfo.hypotheticalProfitPercent ?? 0) >= 0
                  ? "text-green-600"
                  : "text-red-600"
              }`}
            >
              ({(soldStockInfo.hypotheticalProfitPercent ?? 0) >= 0 ? "+" : ""}
              {(soldStockInfo.hypotheticalProfitPercent ?? 0).toFixed(1)}%)
            </span>
          </div>
        </div>
      </div>
    )}
  </section>
)}
```

**Step 4: 動作確認**

```bash
npm run dev
# 売却済み銘柄の詳細ページにアクセスし、売却済みセクションが表示されることを確認
```

**Step 5: Commit**

```bash
git add app/stocks/[stockId]/StockDetailClient.tsx
git commit -m "feat: 銘柄詳細ページに売却済みセクションを表示"
```

---

### Task 6: 最終確認とPR作成

**Step 1: ビルド確認**

```bash
npm run build
```

**Step 2: 動作確認**

- `/my-stocks` の「過去の保有」タブでカードに「今も保有してたら」が表示される
- 売却済み銘柄の詳細ページで売却済みセクションが表示される
- 評価コメントが適切に表示される

**Step 3: PR作成**

```bash
git push origin main
```

PRは自動マージしないので、ユーザーに確認を依頼する。
