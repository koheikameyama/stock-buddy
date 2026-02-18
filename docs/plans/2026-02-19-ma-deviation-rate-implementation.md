# 移動平均乖離率による推奨補正 実装計画

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 25日移動平均線からの乖離率を購入判断と日次おすすめの両システムに組み込み、過熱銘柄の推奨を防ぐ

**Architecture:** バッチ処理で乖離率を計算しStockテーブルに保存。購入判断APIでは強制補正ルールとLLMプロンプトの両方に適用。日次おすすめではスコアリングにペナルティ/ボーナスを追加。

**Tech Stack:** TypeScript (Next.js), Python (yfinance + psycopg2), Prisma, PostgreSQL

---

## Task 1: 定数定義の追加

**Files:**
- Modify: `lib/constants.ts:84` (末尾に追加)

**Step 1: `lib/constants.ts` に MA_DEVIATION 定数を追加**

`MARKET_INDEX` の後に追加:

```typescript
// 移動平均乖離率の閾値
export const MA_DEVIATION = {
  PERIOD: 25,                    // 移動平均の期間（日）
  UPPER_THRESHOLD: 20,           // 上方乖離の閾値（%）
  LOWER_THRESHOLD: -20,          // 下方乖離の閾値（%）
  CONFIDENCE_PENALTY: -0.15,     // 上方乖離時のconfidenceペナルティ
  CONFIDENCE_BONUS: 0.1,         // 下方乖離時のconfidenceボーナス
  SCORE_PENALTY: -20,            // 日次おすすめのスコアペナルティ
  SCORE_BONUS: 10,               // 日次おすすめのスコアボーナス
  LOW_VOLATILITY_THRESHOLD: 30,  // 低ボラティリティの閾値（%）
} as const
```

**Step 2: ビルド確認**

Run: `npx next build`
Expected: 正常にビルドが通る

**Step 3: コミット**

```bash
git add lib/constants.ts
git commit -m "feat: 移動平均乖離率の定数定義を追加"
```

---

## Task 2: 乖離率計算関数の追加

**Files:**
- Modify: `lib/technical-indicators.ts:188` (末尾に追加)

**Step 1: `calculateDeviationRate` 関数を追加**

`getTechnicalSignal` 関数の後に追加:

```typescript
/**
 * 移動平均線からの乖離率（%）を計算
 * 乖離率 = (現在価格 - SMA) / SMA × 100
 *
 * @param prices - 価格データ（新しい順）
 * @param period - 移動平均の期間（デフォルト25日）
 * @returns 乖離率（%）。データ不足の場合は null
 */
export function calculateDeviationRate(prices: PriceData[], period: number = 25): number | null {
  const sma = calculateSMA(prices, period)
  if (sma === null || sma === 0) return null

  const currentPrice = prices[0].close
  const rate = ((currentPrice - sma) / sma) * 100
  return Math.round(rate * 100) / 100
}
```

注意: `prices` は新しい順（index 0 = 最新）。既存の `calculateSMA` は `prices.slice(0, period)` で最新N件を取るので、そのまま使える。

**Step 2: ビルド確認**

Run: `npx next build`
Expected: 正常にビルドが通る

**Step 3: コミット**

```bash
git add lib/technical-indicators.ts
git commit -m "feat: 移動平均乖離率の計算関数を追加"
```

---

## Task 3: DBスキーマ変更 + マイグレーション

**Files:**
- Modify: `prisma/schema.prisma:126` (priceUpdatedAt の前に追加)
- Create: `prisma/migrations/YYYYMMDDHHMMSS_add_ma_deviation_rate/migration.sql`

**Step 1: `prisma/schema.prisma` の Stock モデルに `maDeviationRate` カラムを追加**

`volumeRatio` と `priceUpdatedAt` の間に追加:

```prisma
  volumeRatio       Decimal?           @db.Decimal(8, 2)  // 出来高比率（直近3日/4-30日前）
  maDeviationRate   Decimal?           @db.Decimal(8, 2)  // 25日移動平均乖離率（%）
  priceUpdatedAt    DateTime?          // 株価更新日時
```

**Step 2: マイグレーションファイルを手動作成**

ディレクトリ名: `YYYYMMDDHHMMSS_add_ma_deviation_rate`（YYYYMMDDHHMMSSは現在時刻）

```sql
-- AlterTable
ALTER TABLE "Stock" ADD COLUMN IF NOT EXISTS "maDeviationRate" DECIMAL(8, 2);
```

**Step 3: マイグレーションを適用済みとしてマーク**

Run: `npx prisma migrate resolve --applied YYYYMMDDHHMMSS_add_ma_deviation_rate`

**Step 4: Prisma Client を再生成**

Run: `npx prisma generate`

**Step 5: ビルド確認**

Run: `npx next build`
Expected: 正常にビルドが通る

**Step 6: コミット**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: Stockテーブルに移動平均乖離率カラムを追加"
```

---

## Task 4: バッチ処理での乖離率計算

**Files:**
- Modify: `scripts/github-actions/fetch_stock_prices.py`

**Step 1: yfinance のダウンロード期間を `1mo` → `2mo` に変更**

`download_batch()` 関数内（Line 88）:

```python
# 変更前
period="1mo",
# 変更後
period="2mo",
```

理由: SMA(25)の計算に25営業日分（約5週間）のデータが必要。`1mo` では約22営業日しか取れない。

**Step 2: `_compute_price_data()` に乖離率計算を追加**

Line 157付近（volatility計算の後）に追加:

```python
    # 移動平均乖離率（25日SMA）
    ma_deviation_rate = None
    if len(hist) >= 25:
        close_prices_25 = hist["Close"].values.astype(float)[-25:]
        sma_25 = float(close_prices_25.mean())
        if sma_25 > 0:
            ma_deviation_rate = round(((latest_price - sma_25) / sma_25) * 100, 2)
```

**Step 3: return dict に `maDeviationRate` を追加**

```python
    return {
        "latestPrice": latest_price,
        "latestVolume": volume,
        "dailyChangeRate": clamp_rate(round(daily_change_rate, 2)),
        "weekChangeRate": clamp_rate(round(change_rate, 2)),
        "volatility": clamp_rate(volatility),
        "volumeRatio": clamp_rate(volume_ratio),
        "maDeviationRate": clamp_rate(ma_deviation_rate),
    }
```

**Step 4: `update_stock_prices()` の UPDATE文に `maDeviationRate` を追加**

data リスト（Line 206-218）に `maDeviationRate` を追加:

```python
        data = [
            (
                u["latestPrice"],
                u["latestVolume"],
                u["dailyChangeRate"],
                u["weekChangeRate"],
                u.get("volatility"),
                u.get("volumeRatio"),
                u.get("maDeviationRate"),
                now,
                u["id"]
            )
            for u in updates
        ]
```

SQL文（Line 221-230）に追加:

```sql
            UPDATE "Stock"
            SET "latestPrice" = %s,
                "latestVolume" = %s,
                "dailyChangeRate" = %s,
                "weekChangeRate" = %s,
                "volatility" = %s,
                "volumeRatio" = %s,
                "maDeviationRate" = %s,
                "priceUpdatedAt" = %s
            WHERE id = %s
```

**Step 5: コミット**

```bash
git add scripts/github-actions/fetch_stock_prices.py
git commit -m "feat: 株価バッチ処理に移動平均乖離率の計算を追加"
```

---

## Task 5: 乖離率コンテキスト生成関数の追加

**Files:**
- Modify: `lib/stock-analysis-context.ts`

**Step 1: `calculateDeviationRate` を import に追加**

Line 12（既存の import）:

```typescript
// 変更前
import { calculateRSI, calculateMACD } from "@/lib/technical-indicators"
// 変更後
import { calculateRSI, calculateMACD, calculateDeviationRate } from "@/lib/technical-indicators"
```

**Step 2: MA_DEVIATION 定数を import**

```typescript
import { MA_DEVIATION } from "@/lib/constants"
```

**Step 3: `buildDeviationRateContext` 関数を追加**

`buildTechnicalContext` 関数の後（Line 262 付近）に追加:

```typescript
/**
 * 移動平均乖離率コンテキスト文字列を生成する
 * @param prices - OHLCV データ（oldest-first）
 */
export function buildDeviationRateContext(prices: OHLCVData[]): string {
  if (prices.length < MA_DEVIATION.PERIOD) return ""

  // oldest-first → newest-first に変換して乖離率を計算
  const pricesForCalc = [...prices].reverse().map(p => ({ close: p.close }))
  const rate = calculateDeviationRate(pricesForCalc, MA_DEVIATION.PERIOD)
  if (rate === null) return ""

  let interpretation = ""
  if (rate >= MA_DEVIATION.UPPER_THRESHOLD) {
    interpretation = `${rate.toFixed(1)}%（過熱圏。高値づかみリスクに注意）`
  } else if (rate <= MA_DEVIATION.LOWER_THRESHOLD) {
    interpretation = `${rate.toFixed(1)}%（売られすぎ圏。リバウンドの可能性あり）`
  } else if (Math.abs(rate) <= 5) {
    interpretation = `${rate >= 0 ? "+" : ""}${rate.toFixed(1)}%（移動平均線に沿った安定した値動き）`
  } else {
    interpretation = `${rate >= 0 ? "+" : ""}${rate.toFixed(1)}%`
  }

  return `
【移動平均乖離率】
- 25日移動平均線からの乖離率: ${interpretation}
`
}
```

注意: `prices` 引数は oldest-first（古い順）なので、`calculateDeviationRate` に渡す前に reverse する。

**Step 4: ビルド確認**

Run: `npx next build`
Expected: 正常にビルドが通る

**Step 5: コミット**

```bash
git add lib/stock-analysis-context.ts
git commit -m "feat: 移動平均乖離率のLLMプロンプトコンテキスト生成を追加"
```

---

## Task 6: 購入判断APIへの適用

**Files:**
- Modify: `app/api/stocks/[stockId]/purchase-recommendation/route.ts`

**Step 1: import を追加**

既存の import に追加:

```typescript
import { buildDeviationRateContext } from "@/lib/stock-analysis-context"
import { MA_DEVIATION } from "@/lib/constants"
import { calculateDeviationRate } from "@/lib/technical-indicators"
```

**Step 2: LLMプロンプトに乖離率コンテキストを追加**

購入判断APIでコンテキストを組み立てている箇所（`patternContext`, `technicalContext`, `chartPatternContext` 等を生成している付近、Line 206-212）に追加:

```typescript
    // 移動平均乖離率
    const deviationRateContext = buildDeviationRateContext(prices)
```

プロンプト文字列に `deviationRateContext` を組み込む（他のテクニカルコンテキストと同じ場所）。

**Step 3: 後処理の強制補正ルールを追加**

既存の市場急落補正（Line 529-533）の後に追加:

```typescript
    // 移動平均乖離率による補正
    const pricesNewestFirst = [...prices].reverse().map(p => ({ close: p.close }))
    const deviationRate = calculateDeviationRate(pricesNewestFirst, MA_DEVIATION.PERIOD)

    // ルール4: 上方乖離 (+20%以上) でbuyの場合はstayに変更
    if (deviationRate !== null && deviationRate >= MA_DEVIATION.UPPER_THRESHOLD && result.recommendation === "buy") {
      result.recommendation = "stay"
      result.confidence = Math.max(0, result.confidence + MA_DEVIATION.CONFIDENCE_PENALTY)
      result.caution = `25日移動平均線から+${deviationRate.toFixed(1)}%乖離しており過熱圏のため、様子見を推奨します。${result.caution}`
    }

    // ルール5: 下方乖離 (-20%以下) + 黒字 + 低ボラティリティ → confidenceボーナス
    const isLowVolatility = volatility !== null && volatility <= MA_DEVIATION.LOW_VOLATILITY_THRESHOLD
    if (
      deviationRate !== null &&
      deviationRate <= MA_DEVIATION.LOWER_THRESHOLD &&
      stock.isProfitable === true &&
      isLowVolatility
    ) {
      result.confidence = Math.min(1.0, result.confidence + MA_DEVIATION.CONFIDENCE_BONUS)
    }
```

注意:
- `volatility` 変数は Line 519 で既に定義されている
- `stock.isProfitable` は既にクエリに含まれている
- `prices` は oldest-first なので reverse して newest-first にする

**Step 4: ビルド確認**

Run: `npx next build`
Expected: 正常にビルドが通る

**Step 5: コミット**

```bash
git add app/api/stocks/[stockId]/purchase-recommendation/route.ts
git commit -m "feat: 購入判断APIに移動平均乖離率の強制補正を追加"
```

---

## Task 7: 日次おすすめスコアリングへの適用

**Files:**
- Modify: `lib/recommendation-scoring.ts`

**Step 1: `StockForScoring` インターフェースに `maDeviationRate` を追加**

Line 83 付近:

```typescript
export interface StockForScoring {
  id: string
  tickerCode: string
  name: string
  sector: string | null
  latestPrice: number | null
  weekChangeRate: number | null
  volatility: number | null
  volumeRatio: number | null
  marketCap: number | null
  isProfitable: boolean | null
  maDeviationRate: number | null  // 追加
}
```

**Step 2: MA_DEVIATION を import**

```typescript
import { MA_DEVIATION } from "@/lib/constants"
```

**Step 3: `calculateStockScores` にペナルティ/ボーナスを追加**

Line 191-195（業績不明ペナルティ）の後に追加:

```typescript
    // 移動平均乖離率によるペナルティ/ボーナス
    if (stock.maDeviationRate !== null) {
      if (stock.maDeviationRate >= MA_DEVIATION.UPPER_THRESHOLD) {
        totalScore += MA_DEVIATION.SCORE_PENALTY
        scoreBreakdown["maDeviationPenalty"] = MA_DEVIATION.SCORE_PENALTY
      } else if (
        stock.maDeviationRate <= MA_DEVIATION.LOWER_THRESHOLD &&
        stock.isProfitable === true &&
        stock.volatility !== null &&
        stock.volatility <= MA_DEVIATION.LOW_VOLATILITY_THRESHOLD
      ) {
        totalScore += MA_DEVIATION.SCORE_BONUS
        scoreBreakdown["maDeviationBonus"] = MA_DEVIATION.SCORE_BONUS
      }
    }
```

**Step 4: スコアリング呼び出し元で `maDeviationRate` を渡すように更新**

`app/api/recommendations/generate-daily/route.ts` でStockをクエリしている箇所に `maDeviationRate` を追加する。

Prismaの `select` 句に `maDeviationRate: true` を追加し、`StockForScoring` にマッピングする際に `maDeviationRate: stock.maDeviationRate ? Number(stock.maDeviationRate) : null` を含める。

**Step 5: ビルド確認**

Run: `npx next build`
Expected: 正常にビルドが通る

**Step 6: コミット**

```bash
git add lib/recommendation-scoring.ts app/api/recommendations/generate-daily/route.ts
git commit -m "feat: 日次おすすめスコアリングに移動平均乖離率のペナルティ/ボーナスを追加"
```

---

## Task 8: 最終ビルド確認 + 動作確認

**Step 1: フルビルド**

Run: `npx next build`
Expected: エラーなし

**Step 2: ローカルで動作確認**

1. `npx prisma db push` でローカルDBに反映
2. ローカルサーバー起動
3. 購入判断API を1銘柄でテスト

**Step 3: 全変更をまとめてコミット確認**

`git log --oneline` で全コミットが揃っているか確認。

---

## 変更ファイル一覧

| Task | ファイル | 変更内容 |
|------|---------|---------|
| 1 | `lib/constants.ts` | MA_DEVIATION定数追加 |
| 2 | `lib/technical-indicators.ts` | calculateDeviationRate関数追加 |
| 3 | `prisma/schema.prisma` | Stock.maDeviationRateカラム追加 |
| 3 | `prisma/migrations/` | マイグレーションファイル作成 |
| 4 | `scripts/github-actions/fetch_stock_prices.py` | 乖離率計算・保存処理追加、period 1mo→2mo |
| 5 | `lib/stock-analysis-context.ts` | buildDeviationRateContext関数追加 |
| 6 | `app/api/stocks/[stockId]/purchase-recommendation/route.ts` | 強制補正ルール追加+プロンプト更新 |
| 7 | `lib/recommendation-scoring.ts` | スコアペナルティ/ボーナス追加 |
| 7 | `app/api/recommendations/generate-daily/route.ts` | maDeviationRateのクエリ追加 |
