# 売りタイミング判断 実装計画

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 売り推奨時に「成り行き売却OK」か「戻り売り推奨」かを乖離率+RSI+損益状況でルールベース判定し、UIに表示する。

**Architecture:** ポートフォリオ分析APIとウォッチリスト購入判断APIの後処理に売りタイミング判定を追加。ポートフォリオは損益率も加味。乖離率-20%以下はsell→holdに強制補正（パニック売り防止）。

**Tech Stack:** Next.js 15 (App Router), Prisma, PostgreSQL, TypeScript

**設計ドキュメント:** `docs/plans/2026-02-19-sell-timing-design.md`

---

## 既存実装の状況

**利用可能（既に実装済み）:**
- `calculateDeviationRate()`: `lib/technical-indicators.ts` L198（newest-first配列を期待）
- `calculateRSI()`: `lib/technical-indicators.ts` L13（newest-first配列を期待）
- `calculateSMA()`: `lib/technical-indicators.ts` L37
- `MA_DEVIATION` 定数: `lib/constants.ts` L86-98
- `Stock.maDeviationRate`: バッチ処理で計算済み
- `buildDeviationRateContext()` / `buildMADeviationContext()`: `lib/stock-analysis-context.ts`

**ポートフォリオ分析API固有の状況:**
- `profitPercent` はL256-263で計算済み
- `calculateDeviationRate` / `calculateRSI` は**未インポート**
- ルールベースの後処理は**存在しない**（AI結果を直接DB保存）
- `prices` 配列（oldest-first）はL195-196で取得済み

**ウォッチリスト購入判断API固有の状況:**
- `calculateDeviationRate` / `calculateRSI` / `calculateSMA` はL20でインポート済み
- `deviationRate` / `pricesNewestFirst` はL543-545で計算済み
- `buyTiming` 判定はL565-584に実装済み → 同じパターンで `sellTiming` を追加

---

## Task 1: SELL_TIMING定数を追加

**Files:**
- Modify: `lib/constants.ts`（L98付近、`MA_DEVIATION` の後）

**Step 1: 定数を追加**

```typescript
// 売りタイミング判断の閾値
export const SELL_TIMING = {
  DEVIATION_LOWER_THRESHOLD: -5,   // 乖離率がこれ未満で戻り売り推奨
  RSI_OVERSOLD_THRESHOLD: 30,      // RSIがこれ未満で戻り売り推奨
  PANIC_SELL_THRESHOLD: -20,       // 乖離率がこれ以下でsell→hold強制補正
  PROFIT_TAKING_THRESHOLD: 10,     // 利益率(%)がこれ以上で利確優先
  STOP_LOSS_THRESHOLD: -15,        // 損失率(%)がこれ以下で損切り優先
} as const
```

**Step 2: ビルド確認**

Run: `npx next build`
Expected: PASS

**Step 3: コミット**

```bash
git add lib/constants.ts
git commit -m "feat: 売りタイミング判断の定数SELL_TIMINGを追加"
```

---

## Task 2: DBスキーマ変更

**Files:**
- Modify: `prisma/schema.prisma`（PortfolioStock: L340付近, PurchaseRecommendation: L403付近）
- Create: `prisma/migrations/YYYYMMDDHHMMSS_add_sell_timing/migration.sql`

**Step 1: PortfolioStockモデルにカラム追加**

`sellReason` の後（L340付近）に追加:

```prisma
  sellTiming         String?                         // "market" | "rebound" | null
  sellTargetPrice    Decimal? @db.Decimal(12, 2)     // 戻り売り時の目安価格（SMA25）
```

**Step 2: PurchaseRecommendationモデルにカラム追加**

`dipTargetPrice` の後（L403付近）に追加:

```prisma
  sellTiming         String?                         // "market" | "rebound" | null（avoid時のみ）
  sellTargetPrice    Decimal? @db.Decimal(10, 2)     // 戻り売り時の目安価格（SMA25）
```

**Step 3: マイグレーション作成**

```bash
mkdir -p prisma/migrations/$(date +%Y%m%d%H%M%S)_add_sell_timing
```

`migration.sql`:

```sql
-- PortfolioStock: 売りタイミング判断
ALTER TABLE "PortfolioStock" ADD COLUMN IF NOT EXISTS "sellTiming" TEXT;
ALTER TABLE "PortfolioStock" ADD COLUMN IF NOT EXISTS "sellTargetPrice" DECIMAL(12, 2);

-- PurchaseRecommendation: 売りタイミング判断（avoid時）
ALTER TABLE "PurchaseRecommendation" ADD COLUMN IF NOT EXISTS "sellTiming" TEXT;
ALTER TABLE "PurchaseRecommendation" ADD COLUMN IF NOT EXISTS "sellTargetPrice" DECIMAL(10, 2);
```

**Step 4: マイグレーション適用**

```bash
npx prisma migrate resolve --applied <マイグレーション名>
npx prisma generate
```

**Step 5: ビルド確認**

Run: `npx next build`
Expected: PASS

**Step 6: コミット**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: PortfolioStock/PurchaseRecommendationにsellTiming/sellTargetPrice追加"
```

---

## Task 3: ポートフォリオ分析APIに強制補正 + 売りタイミング判定を追加

**Files:**
- Modify: `app/api/stocks/[stockId]/portfolio-analysis/route.ts`

**これが最も重要なTask。** 現在このAPIにはルールベースの後処理が一切ないため、新規追加。

**Step 1: importを追加**

既存のimportに追加:

```typescript
import { calculateDeviationRate, calculateRSI, calculateSMA } from "@/lib/technical-indicators"
import { MA_DEVIATION } from "@/lib/constants"
import { SELL_TIMING } from "@/lib/constants"
```

**Step 2: 乖離率・RSIの計算を追加**

L497-498（OpenAI結果のparse）の後、L504（prisma.$transaction）の前に追加:

```typescript
// 乖離率・RSI計算（売りタイミング判定用）
const pricesNewestFirst = [...prices].reverse().map(p => ({ close: p.close }))
const deviationRate = calculateDeviationRate(pricesNewestFirst, MA_DEVIATION.PERIOD)
const rsiValue = calculateRSI(pricesNewestFirst)
const sma25 = calculateSMA(pricesNewestFirst, MA_DEVIATION.PERIOD)
```

**Step 3: 強制補正ルール（パニック売り防止）を追加**

乖離率計算の後に追加:

```typescript
// 強制補正: 乖離率-20%以下 → sell→hold（パニック売り防止）
if (
  deviationRate !== null &&
  deviationRate <= SELL_TIMING.PANIC_SELL_THRESHOLD &&
  result.recommendation === "sell"
) {
  result.recommendation = "hold"
  result.simpleStatus = "neutral"
  result.sellReason = null
  result.suggestedSellPercent = null
  result.sellCondition = `25日移動平均線から${deviationRate.toFixed(1)}%下方乖離しており異常な売られすぎです。大底で手放すリスクが高いため、自律反発を待つことを推奨します。`
}
```

**Step 4: 売りタイミング判定ロジックを追加**

強制補正の後に追加:

```typescript
// 売りタイミング判定（sell推奨時のみ）
let sellTiming: string | null = null
let sellTargetPrice: number | null = null

if (result.recommendation === "sell") {
  // 優先順位2: 損切り優先（損失率-15%以下）
  if (profitPercent !== null && profitPercent <= SELL_TIMING.STOP_LOSS_THRESHOLD) {
    sellTiming = "market"
  }
  // 優先順位3: 利確優先（利益率+10%以上）
  else if (profitPercent !== null && profitPercent >= SELL_TIMING.PROFIT_TAKING_THRESHOLD) {
    sellTiming = "market"
  }
  // 優先順位4,5: テクニカル判断
  else {
    const isDeviationOk = deviationRate === null || deviationRate >= SELL_TIMING.DEVIATION_LOWER_THRESHOLD
    const isRsiOk = rsiValue === null || rsiValue >= SELL_TIMING.RSI_OVERSOLD_THRESHOLD

    if (deviationRate === null && rsiValue === null) {
      sellTiming = null
    } else if (isDeviationOk && isRsiOk) {
      sellTiming = "market"
    } else {
      sellTiming = "rebound"
      sellTargetPrice = sma25
    }
  }
}
```

**Step 5: DB保存に sellTiming/sellTargetPrice を追加**

L506-522の `prisma.portfolioStock.update` の `data` に追加:

```typescript
sellTiming: sellTiming,
sellTargetPrice: sellTargetPrice,
```

**Step 6: GETレスポンスに sellTiming/sellTargetPrice を追加**

GET handler（L31-179）のレスポンスオブジェクトに追加:

```typescript
sellTiming: portfolioStock.sellTiming,
sellTargetPrice: portfolioStock.sellTargetPrice ? Number(portfolioStock.sellTargetPrice) : null,
```

**Step 7: ビルド確認**

Run: `npx next build`
Expected: PASS

**Step 8: コミット**

```bash
git add app/api/stocks/\[stockId\]/portfolio-analysis/route.ts
git commit -m "feat: ポートフォリオ分析APIに売りタイミング判定と強制補正を追加"
```

---

## Task 4: ウォッチリスト購入判断APIにavoid時の強制補正 + 売りタイミング判定を追加

**Files:**
- Modify: `app/api/stocks/[stockId]/purchase-recommendation/route.ts`

`SELL_TIMING` のimportを追加。`deviationRate` / `pricesNewestFirst` / `calculateRSI` / `calculateSMA` は既に利用可能。

**Step 1: importにSELL_TIMINGを追加**

```typescript
import { MA_DEVIATION, SELL_TIMING } from "@/lib/constants"
```

**Step 2: avoid時の強制補正を追加**

L552（MA上方乖離の強制補正）の後に追加:

```typescript
// 下方乖離 (-20%以下) → avoid→stay（パニック売り防止）
if (
  deviationRate !== null &&
  deviationRate <= SELL_TIMING.PANIC_SELL_THRESHOLD &&
  result.recommendation === "avoid"
) {
  result.recommendation = "stay"
  result.caution = `25日移動平均線から${deviationRate.toFixed(1)}%下方乖離しており売られすぎです。大底で見送るのはもったいないため、様子見を推奨します。${result.caution}`
}
```

**Step 3: avoid時の売りタイミング判定を追加**

L584（buyTiming判定）の後に追加:

```typescript
// 売りタイミング判定（avoid推奨時のみ、テクニカルのみ）
let sellTiming: string | null = null
let sellTargetPrice: number | null = null

if (result.recommendation === "avoid") {
  const rsi = calculateRSI(pricesNewestFirst, 14)
  const sma25 = calculateSMA(pricesNewestFirst, MA_DEVIATION.PERIOD)

  const isDeviationOk = deviationRate === null || deviationRate >= SELL_TIMING.DEVIATION_LOWER_THRESHOLD
  const isRsiOk = rsi === null || rsi >= SELL_TIMING.RSI_OVERSOLD_THRESHOLD

  if (deviationRate === null && rsi === null) {
    sellTiming = null
  } else if (isDeviationOk && isRsiOk) {
    sellTiming = "market"
  } else {
    sellTiming = "rebound"
    sellTargetPrice = sma25
  }
}
```

**Step 4: DB保存にsellTiming/sellTargetPriceを追加**

L590-642の `prisma.purchaseRecommendation.upsert` のcreate/updateに追加:

```typescript
sellTiming: sellTiming,
sellTargetPrice: sellTargetPrice,
```

**Step 5: GETレスポンスにsellTimingを追加**

GET handler のレスポンスに `sellTiming` を含める（L98付近、既に `buyTiming` が返されている箇所）:

```typescript
sellTiming: recommendation.sellTiming,
```

**Step 6: ビルド確認**

Run: `npx next build`
Expected: PASS

**Step 7: コミット**

```bash
git add app/api/stocks/\[stockId\]/purchase-recommendation/route.ts
git commit -m "feat: ウォッチリスト購入判断APIにavoid時の売りタイミング判定を追加"
```

---

## Task 5: ポートフォリオ分析カードUIに売りタイミングセクションを追加

**Files:**
- Modify: `app/components/StockAnalysisCard.tsx`

**Step 1: PortfolioAnalysisDataインターフェースにフィールド追加**

L47-64のインターフェースに追加:

```typescript
sellTiming?: string | null        // "market" | "rebound" | null
sellTargetPrice?: number | null   // 戻り売り時のSMA(25)
```

**Step 2: SellTimingSectionコンポーネントを作成**

コンポーネント内（`StockAnalysisCard` 関数の上あたり）に追加:

```tsx
function SellTimingSection({ sellTiming, sellTargetPrice }: {
  sellTiming?: string | null
  sellTargetPrice?: number | null
}) {
  if (!sellTiming) return null

  if (sellTiming === "market") {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-3 mt-2">
        <div className="flex items-center gap-2 mb-1">
          <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-semibold">
            成り行き売却OK
          </span>
        </div>
        <p className="text-sm text-red-800">
          現在の価格帯での売却を検討できます。価格もモメンタムも売却に適した状態です。
        </p>
      </div>
    )
  }

  if (sellTiming === "rebound") {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mt-2">
        <div className="flex items-center gap-2 mb-1">
          <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-xs font-semibold">
            戻り売り推奨
          </span>
        </div>
        <p className="text-sm text-yellow-800">
          {sellTargetPrice
            ? `25日移動平均線の${sellTargetPrice.toLocaleString()}円付近まで反発を待つとより有利です。`
            : "現在売られすぎの状態です。反発を待ってから売却するのがおすすめです。"}
        </p>
        <p className="text-xs text-yellow-600 mt-1">
          戻り売り: 下落後の一時的な反発（リバウンド）を狙って売ること。移動平均線は過去25日間の平均価格で、株価が戻りやすい目安になります。
        </p>
      </div>
    )
  }

  return null
}
```

**Step 3: 売却推奨セクション内にSellTimingSectionを挿入**

L542-608の `statusType === "warning"` セクション内、`sellCondition` 表示（L601-605）の後に追加:

```tsx
<SellTimingSection
  sellTiming={portfolioAnalysis.sellTiming}
  sellTargetPrice={portfolioAnalysis.sellTargetPrice}
/>
```

**Step 4: ビルド確認**

Run: `npx next build`
Expected: PASS

**Step 5: コミット**

```bash
git add app/components/StockAnalysisCard.tsx
git commit -m "feat: ポートフォリオ分析カードに売りタイミングセクションを追加"
```

---

## Task 6: ウォッチリスト購入判断カードにavoid時の売りタイミングを追加

**Files:**
- Modify: `app/components/PurchaseRecommendation.tsx`

**Step 1: RecommendationDataインターフェースにフィールド追加**

L11-55のインターフェースに追加:

```typescript
sellTiming?: "market" | "rebound" | null
sellTargetPrice?: number | null
```

**Step 2: AvoidSellTimingSectionコンポーネントを作成**

```tsx
function AvoidSellTimingSection({ sellTiming, sellTargetPrice }: {
  sellTiming?: string | null
  sellTargetPrice?: number | null
}) {
  if (!sellTiming) return null

  if (sellTiming === "market") {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-semibold">
            即見送り推奨
          </span>
        </div>
        <p className="text-sm text-red-800">
          テクニカル的にも見送りに適したタイミングです。
        </p>
      </div>
    )
  }

  if (sellTiming === "rebound") {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-xs font-semibold">
            反発後に判断
          </span>
        </div>
        <p className="text-sm text-yellow-800">
          {sellTargetPrice
            ? `現在売られすぎの状態です。${sellTargetPrice.toLocaleString()}円付近まで反発を待ってから再判断するのがおすすめです。`
            : "現在売られすぎの状態です。反発を待ってから再判断するのがおすすめです。"}
        </p>
      </div>
    )
  }

  return null
}
```

**Step 3: avoid表示部分にセクションを挿入**

L622-673のavoid表示内、`DeepEvaluationSection` の後に追加:

```tsx
<AvoidSellTimingSection
  sellTiming={data.sellTiming}
  sellTargetPrice={data.sellTargetPrice}
/>
```

**Step 4: ビルド確認**

Run: `npx next build`
Expected: PASS

**Step 5: コミット**

```bash
git add app/components/PurchaseRecommendation.tsx
git commit -m "feat: ウォッチリスト購入判断カードにavoid時の売りタイミングを追加"
```

---

## Task 7: ウォッチリストカードにavoid時のバッジを追加

**Files:**
- Modify: `app/my-stocks/StockCard.tsx`

**Step 1: PurchaseRecommendationインターフェースにフィールド追加**

L39-45のインターフェースに追加:

```typescript
sellTiming?: "market" | "rebound" | null
```

**Step 2: avoid時の戻り待ちバッジを追加**

L123-139のバッジ表示部分で、既存のbuyTimingバッジの後に追加:

```tsx
{isWatchlist && recommendation?.recommendation === "avoid" && recommendation.sellTiming === "rebound" && (
  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700">
    戻り待ち
  </span>
)}
```

**Step 3: ビルド確認**

Run: `npx next build`
Expected: PASS

**Step 4: コミット**

```bash
git add app/my-stocks/StockCard.tsx
git commit -m "feat: ウォッチリストカードにavoid時の戻り待ちバッジを追加"
```

---

## Task 8: 動作確認・最終ビルド

**Step 1: フルビルド確認**

```bash
npx next build
```

**Step 2: 開発サーバーで動作確認**

```bash
npm run dev
```

確認項目:
- ポートフォリオの銘柄詳細で分析を実行
  - sell推奨時に「成り行き売却OK」または「戻り売り推奨」が表示される
  - 損失-15%以下の銘柄で「成り行き売却OK」になる
  - 利益+10%以上の銘柄で「成り行き売却OK」になる
  - 乖離率-20%以下でsell→holdに強制補正される
- ウォッチリストの銘柄詳細で購入判断を実行
  - avoid推奨時に売りタイミングが表示される
  - 乖離率-20%以下でavoid→stayに補正される
  - ウォッチリスト一覧で「戻り待ち」バッジが表示される

**Step 3: 最終コミット（必要な場合のみ）**

---

## 変更ファイル一覧

| Task | ファイル | 変更内容 |
|------|---------|---------|
| 1 | `lib/constants.ts` | SELL_TIMING定数追加 |
| 2 | `prisma/schema.prisma` | PortfolioStock + PurchaseRecommendation にsellTiming/sellTargetPrice追加 |
| 2 | `prisma/migrations/` | マイグレーションファイル作成 |
| 3 | `app/api/stocks/[stockId]/portfolio-analysis/route.ts` | 強制補正 + 売りタイミング判定 + GET/POST更新 |
| 4 | `app/api/stocks/[stockId]/purchase-recommendation/route.ts` | avoid強制補正 + 売りタイミング判定 |
| 5 | `app/components/StockAnalysisCard.tsx` | SellTimingSectionコンポーネント追加 |
| 6 | `app/components/PurchaseRecommendation.tsx` | AvoidSellTimingSection追加 |
| 7 | `app/my-stocks/StockCard.tsx` | 戻り待ちバッジ追加 |
