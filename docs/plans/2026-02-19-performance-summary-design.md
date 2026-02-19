# 運用成績セクション実装計画

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** ダッシュボードに「運用成績」カードを追加し、トータル損益（含み損益+確定損益）と統計情報を表示する。

**Architecture:** 既存の `/api/portfolio/summary` APIを拡張して確定損益・統計情報を返し、ダッシュボードに新しい`PerformanceSummary`コンポーネントを配置する。既存のPortfolioStockとTransactionデータを使い、追加DBクエリなしで計算する。

**Tech Stack:** Next.js, TypeScript, Prisma, Tailwind CSS, Zustand

---

### Task 1: 型定義の拡張

**Files:**
- Modify: `store/types.ts:95-100`

**Step 1: PortfolioSummary型に新フィールドを追加**

```typescript
export interface PortfolioSummary {
  totalValue: number
  totalCost: number
  unrealizedGain: number
  unrealizedGainPercent: number
  // 運用成績
  realizedGain: number
  totalGain: number
  totalGainPercent: number
  winCount: number
  loseCount: number
  winRate: number | null
  averageReturn: number | null
}
```

**Step 2: ビルド確認**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: 型エラーが出る（APIがまだ新フィールドを返さないため）。これは想定通り。

---

### Task 2: API拡張

**Files:**
- Modify: `app/api/portfolio/summary/route.ts`

**Step 1: 確定損益の計算ロジックを追加**

既存の`for`ループ（L46-59）は保有中の銘柄だけを処理している。売却済み銘柄（`quantity === 0`）も処理して確定損益を計算する。

変更後のAPI全体:

```typescript
import { auth } from "@/auth"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { fetchStockPrices } from "@/lib/stock-price-fetcher"
import { calculatePortfolioFromTransactions } from "@/lib/portfolio-calculator"
import { Decimal } from "@prisma/client/runtime/library"

export async function GET() {
  try {
    const session = await auth()

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        portfolioStocks: {
          include: {
            stock: true,
            transactions: {
              orderBy: { transactionDate: "asc" },
            },
          },
        },
      },
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    if (user.portfolioStocks.length === 0) {
      return NextResponse.json({ summary: null })
    }

    // 保有中の銘柄のティッカーコードを取得（株価取得用）
    const holdingTickers: string[] = []
    for (const ps of user.portfolioStocks) {
      const { quantity } = calculatePortfolioFromTransactions(ps.transactions)
      if (quantity > 0) {
        holdingTickers.push(ps.stock.tickerCode)
      }
    }

    // 現在の株価を取得（保有中の銘柄のみ）
    const prices = holdingTickers.length > 0
      ? await fetchStockPrices(holdingTickers)
      : []
    const priceMap = new Map(prices.map((p) => [p.tickerCode, p.currentPrice]))

    let totalValue = 0
    let totalCost = 0

    // 確定損益の計算用
    let realizedGain = 0
    let totalRealizedCost = 0
    let winCount = 0
    let loseCount = 0
    const returnRates: number[] = []

    for (const ps of user.portfolioStocks) {
      const { quantity, averagePurchasePrice } = calculatePortfolioFromTransactions(
        ps.transactions
      )

      if (quantity > 0) {
        // 保有中: 含み損益の計算（既存ロジック）
        const currentPrice = priceMap.get(ps.stock.tickerCode)
        if (currentPrice == null) continue

        totalValue += currentPrice * quantity
        totalCost += averagePurchasePrice.toNumber() * quantity
      } else {
        // 売却済み: 確定損益の計算
        const buyTransactions = ps.transactions.filter((t) => t.type === "buy")
        const sellTransactions = ps.transactions.filter((t) => t.type === "sell")

        if (buyTransactions.length === 0 || sellTransactions.length === 0) continue

        const totalBuyAmount = buyTransactions.reduce(
          (sum, t) => sum.plus(t.totalAmount),
          new Decimal(0)
        )
        const totalSellAmount = sellTransactions.reduce(
          (sum, t) => sum.plus(t.totalAmount),
          new Decimal(0)
        )

        const profit = totalSellAmount.minus(totalBuyAmount).toNumber()
        const buyAmount = totalBuyAmount.toNumber()

        realizedGain += profit
        totalRealizedCost += buyAmount

        if (profit >= 0) {
          winCount++
        } else {
          loseCount++
        }

        if (buyAmount > 0) {
          returnRates.push((profit / buyAmount) * 100)
        }
      }
    }

    // 保有も売却もない場合
    if (totalCost <= 0 && totalRealizedCost <= 0) {
      return NextResponse.json({ summary: null })
    }

    const unrealizedGain = totalValue - totalCost
    const unrealizedGainPercent = totalCost > 0
      ? (unrealizedGain / totalCost) * 100
      : 0

    const totalGain = unrealizedGain + realizedGain
    const totalInvested = totalCost + totalRealizedCost
    const totalGainPercent = totalInvested > 0
      ? (totalGain / totalInvested) * 100
      : 0

    const soldCount = winCount + loseCount
    const winRate = soldCount > 0 ? (winCount / soldCount) * 100 : null
    const averageReturn = returnRates.length > 0
      ? returnRates.reduce((sum, r) => sum + r, 0) / returnRates.length
      : null

    return NextResponse.json({
      summary: {
        totalValue,
        totalCost,
        unrealizedGain,
        unrealizedGainPercent,
        realizedGain,
        totalGain,
        totalGainPercent,
        winCount,
        loseCount,
        winRate,
        averageReturn,
      },
    })
  } catch (error) {
    console.error("Error fetching portfolio summary:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
```

**Step 2: ビルド確認**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: PASS（型エラーなし）

---

### Task 3: 運用成績コンポーネント作成

**Files:**
- Create: `app/dashboard/PerformanceSummary.tsx`

**Step 1: コンポーネントを作成**

```tsx
"use client"

import Link from "next/link"
import type { PortfolioSummary } from "@/store/types"

interface PerformanceSummaryProps {
  summary: PortfolioSummary
}

export default function PerformanceSummary({ summary }: PerformanceSummaryProps) {
  const hasSoldStocks = summary.winCount + summary.loseCount > 0

  return (
    <div className="mt-4 sm:mt-6">
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <span className="text-lg">📈</span>
            </div>
            <span className="text-sm font-semibold text-gray-900">運用成績</span>
          </div>
          {hasSoldStocks && (
            <Link
              href="/my-stocks?tab=sold"
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-500 transition-colors"
            >
              <span>売却履歴</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {/* トータル損益 */}
          <div className="text-center">
            <div className="text-xs text-gray-500 mb-1">トータル損益</div>
            <div
              className={`text-base sm:text-lg font-bold ${
                summary.totalGain >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {summary.totalGain >= 0 ? "+" : ""}
              ¥{Math.round(summary.totalGain).toLocaleString()}
            </div>
            <div className={`text-[10px] ${
              summary.totalGainPercent >= 0 ? "text-green-500" : "text-red-500"
            }`}>
              {summary.totalGainPercent >= 0 ? "+" : ""}
              {summary.totalGainPercent.toFixed(1)}%
            </div>
          </div>

          {/* 含み損益 */}
          <div className="text-center">
            <div className="text-xs text-gray-500 mb-1">含み損益</div>
            <div
              className={`text-base sm:text-lg font-bold ${
                summary.unrealizedGain >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {summary.unrealizedGain >= 0 ? "+" : ""}
              ¥{Math.round(summary.unrealizedGain).toLocaleString()}
            </div>
          </div>

          {/* 確定損益 */}
          <div className="text-center">
            <div className="text-xs text-gray-500 mb-1">確定損益</div>
            {hasSoldStocks ? (
              <div
                className={`text-base sm:text-lg font-bold ${
                  summary.realizedGain >= 0 ? "text-green-600" : "text-red-600"
                }`}
              >
                {summary.realizedGain >= 0 ? "+" : ""}
                ¥{Math.round(summary.realizedGain).toLocaleString()}
              </div>
            ) : (
              <div className="text-base sm:text-lg font-bold text-gray-400">-</div>
            )}
          </div>

          {/* 勝率 */}
          <div className="text-center">
            <div className="text-xs text-gray-500 mb-1">勝率</div>
            {hasSoldStocks ? (
              <>
                <div className="text-base sm:text-lg font-bold text-gray-900">
                  {summary.winRate !== null ? `${summary.winRate.toFixed(0)}%` : "-"}
                </div>
                <div className="text-[10px] text-gray-400">
                  {summary.winCount}勝{summary.loseCount}敗
                </div>
              </>
            ) : (
              <div className="text-base sm:text-lg font-bold text-gray-400">-</div>
            )}
          </div>

          {/* 平均リターン */}
          <div className="text-center">
            <div className="text-xs text-gray-500 mb-1">平均リターン</div>
            {summary.averageReturn !== null ? (
              <div
                className={`text-base sm:text-lg font-bold ${
                  summary.averageReturn >= 0 ? "text-green-600" : "text-red-600"
                }`}
              >
                {summary.averageReturn >= 0 ? "+" : ""}
                {summary.averageReturn.toFixed(1)}%
              </div>
            ) : (
              <div className="text-base sm:text-lg font-bold text-gray-400">-</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
```

---

### Task 4: PortfolioSummaryからPerformanceSummaryにデータを渡す

**Files:**
- Modify: `app/dashboard/PortfolioSummary.tsx`

**Step 1: PerformanceSummaryをインポートして配置**

`PortfolioSummary`コンポーネントは既に`fetchPortfolioSummary()`でAPIデータを取得しているので、そのデータをそのまま`PerformanceSummary`に渡す。

変更点:
- `PerformanceSummary`をインポート
- `return`文の`</Link>`の後に`<PerformanceSummary summary={summary} />`を追加
- Linkの`mb-6`を削除（PerformanceSummaryとの間隔はPerformanceSummary側の`mt-4`で管理）
- ルートのフラグメント`<>`で囲む

```tsx
// ファイル先頭にインポート追加
import PerformanceSummary from "./PerformanceSummary"

// return文を変更（summaryがある場合のみ）
// 既存のLinkをそのまま残し、その後にPerformanceSummaryを追加
return (
  <>
    <Link href="/my-stocks" className="block">
      {/* 既存の資産状況カード（内容変更なし） */}
    </Link>
    <PerformanceSummary summary={summary} />
  </>
)
```

ローディング状態では`PerformanceSummary`は表示しない（summaryがnullのため表示されない）。

---

### Task 5: ダッシュボードの表示条件を調整

**Files:**
- Modify: `app/dashboard/page.tsx:47`

**Step 1: portfolioStocksの存在チェックを調整**

現在は`hasHoldings`（保有中の銘柄あり）で`PortfolioSummary`の表示を制御しているが、売却済みのみの場合もAPIはsummaryを返すようになった。`portfolioStocks.length > 0`（保有中or売却済みのいずれかがある）で判定するので、既存の`hasHoldings`で問題ない（portfolioStocksには売却済みも含まれるため）。

→ 実際には`hasHoldings`は`user.portfolioStocks.length > 0`で判定しており、売却済みの銘柄もPortfolioStockとしてDBに残っているため、変更不要。

---

### Task 6: ビルド確認

**Step 1: TypeScriptビルド確認**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 2: コミット**

```bash
git add store/types.ts app/api/portfolio/summary/route.ts app/dashboard/PerformanceSummary.tsx app/dashboard/PortfolioSummary.tsx
git commit -m "feat: ダッシュボードに運用成績セクションを追加"
```
