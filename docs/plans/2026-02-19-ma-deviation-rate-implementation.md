# 移動平均乖離率 + 購入タイミング判断 実装計画

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 25日移動平均乖離率による推奨補正と、買い推奨時の購入タイミング判断（成り行き/押し目買い）を実装する。

**Architecture:** 乖離率はバッチ処理（fetch_stock_prices.py）で計算しStockテーブルに保存。購入判断APIの後処理で乖離率による強制補正と購入タイミング判定をルールベースで行う。日次おすすめスコアリングでも乖離率ペナルティ/ボーナスを適用。

**Tech Stack:** Next.js 15 (App Router), Prisma, PostgreSQL, Python (バッチ), TypeScript

**設計ドキュメント:** `docs/plans/2026-02-19-ma-deviation-rate-design.md`

---

## 既存実装の状況

以下は**既に実装済み**（コード確認済み）:

- `MA_DEVIATION` 定数: `lib/constants.ts` L86-96（ただし `DIP_BUY_THRESHOLD`, `RSI_OVERBOUGHT_THRESHOLD` は未追加）
- `calculateDeviationRate()`: `lib/technical-indicators.ts` L198-205（newest-first配列を期待）
- `calculateRSI()`: `lib/technical-indicators.ts` L13（newest-first配列を期待）
- `calculateSMA()`: `lib/technical-indicators.ts` L37

以下は**未実装**:

- DBカラム（Stock.maDeviationRate, PurchaseRecommendation.buyTiming/dipTargetPrice）
- バッチ処理での乖離率計算・保存
- 購入判断APIでの強制補正・タイミング判定
- 日次おすすめスコアリングでの乖離率反映
- UI表示

## 重要な注意点

- 購入判断API内の `prices` 配列は **oldest-first**（古い順）
- `calculateDeviationRate` / `calculateRSI` / `calculateSMA` は **newest-first** を期待
- API内で使う際は必ず `[...prices].reverse()` してから渡すこと
- `RSI_THRESHOLDS` が `lib/constants.ts` L17-22 に既にあるが、購入タイミング判断用の閾値は `MA_DEVIATION` に統合する

---

## Task 1: 定数に購入タイミング閾値を追加

**Files:**
- Modify: `lib/constants.ts:86-96`

**Step 1: MA_DEVIATION定数にDIP_BUY_THRESHOLDとRSI_OVERBOUGHT_THRESHOLDを追加**

`lib/constants.ts` の既存 `MA_DEVIATION` オブジェクト（L86-96）に2つの定数を追加:

```typescript
export const MA_DEVIATION = {
  PERIOD: 25,                    // 移動平均の期間（日）
  UPPER_THRESHOLD: 20,           // 上方乖離の閾値（%）
  LOWER_THRESHOLD: -20,          // 下方乖離の閾値（%）
  CONFIDENCE_PENALTY: -0.15,     // 上方乖離時のconfidenceペナルティ
  CONFIDENCE_BONUS: 0.1,         // 下方乖離時のconfidenceボーナス
  SCORE_PENALTY: -20,            // 日次おすすめのスコアペナルティ
  SCORE_BONUS: 10,               // 日次おすすめのスコアボーナス
  LOW_VOLATILITY_THRESHOLD: 30,  // 低ボラティリティの閾値（%）
  DIP_BUY_THRESHOLD: 5,          // 乖離率(%)がこれを超えたら押し目買い推奨
  RSI_OVERBOUGHT_THRESHOLD: 70,  // RSIがこれを超えたら押し目買い推奨
} as const
```

**Step 2: ビルド確認**

Run: `npx next build`
Expected: PASS

**Step 3: コミット**

```bash
git add lib/constants.ts
git commit -m "feat: MA_DEVIATIONに購入タイミング判断の閾値を追加"
```

---

## Task 2: DBスキーマ変更（Stockモデル + PurchaseRecommendationモデル）

**Files:**
- Modify: `prisma/schema.prisma`（Stock: L125付近, PurchaseRecommendation: L413付近）
- Create: `prisma/migrations/YYYYMMDDHHMMSS_add_ma_deviation_and_buy_timing/migration.sql`

**Step 1: Stockモデルにカラム追加**

`prisma/schema.prisma` の Stock モデル、`volumeRatio`（L125）の後に追加:

```prisma
  maDeviationRate   Decimal?           @db.Decimal(8, 2)   // 25日移動平均乖離率(%)
```

**Step 2: PurchaseRecommendationモデルにカラム追加**

`prisma/schema.prisma` の PurchaseRecommendation モデル、`analysisData`（L413）の後に追加:

```prisma
  buyTiming         String?                                 // "market" | "dip" | null
  dipTargetPrice    Decimal?           @db.Decimal(10, 2)   // 押し目買い時の目安価格（SMA25）
```

**Step 3: マイグレーション作成**

手動マイグレーション作成（シャドウDBエラー回避）:

```bash
mkdir -p prisma/migrations/$(date +%Y%m%d%H%M%S)_add_ma_deviation_and_buy_timing
```

`migration.sql`:

```sql
-- Stock: 25日移動平均乖離率
ALTER TABLE "Stock" ADD COLUMN IF NOT EXISTS "maDeviationRate" DECIMAL(8, 2);

-- PurchaseRecommendation: 購入タイミング判断
ALTER TABLE "PurchaseRecommendation" ADD COLUMN IF NOT EXISTS "buyTiming" TEXT;
ALTER TABLE "PurchaseRecommendation" ADD COLUMN IF NOT EXISTS "dipTargetPrice" DECIMAL(10, 2);
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
git commit -m "feat: Stock.maDeviationRate, PurchaseRecommendation.buyTiming/dipTargetPrice追加"
```

---

## Task 3: バッチ処理で乖離率を計算・保存

**Files:**
- Modify: `scripts/github-actions/fetch_stock_prices.py`
  - `_compute_price_data()` L129-196: 乖離率計算を追加
  - `update_stock_prices()` L199-236: UPDATE SQLにカラム追加

**注意:** `_compute_price_data` の `close_prices` は oldest-first（`yf.download()` のデフォルト）。

**Step 1: yfinance のダウンロード期間を確認**

`download_batch()` 関数内の `period` パラメータを確認。SMA(25)に25営業日分必要。`1mo`（約22日）では不足するので `2mo` に変更が必要な場合がある。

**Step 2: `_compute_price_data` に乖離率計算を追加**

L159付近の `close_prices` が利用可能な箇所の後に追加:

```python
# 25日移動平均乖離率
ma_deviation_rate = None
if len(close_prices) >= 25:
    sma25 = float(close_prices[-25:].mean())
    if sma25 > 0:
        ma_deviation_rate = round(((latest_price - sma25) / sma25) * 100, 2)
```

returnのdictに追加:

```python
"maDeviationRate": ma_deviation_rate,
```

**Step 3: `update_stock_prices` のSQLとデータタプルを更新**

dataタプルに `u.get("maDeviationRate")` を追加し、UPDATE SQLに `"maDeviationRate" = %s` を追加:

```python
data = [
    (
        u["latestPrice"],
        u["latestVolume"],
        u["dailyChangeRate"],
        u["weekChangeRate"],
        u.get("volatility"),
        u.get("volumeRatio"),
        u.get("maDeviationRate"),  # 追加
        now,
        u["id"]
    )
    for u in updates
]
```

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

**Step 4: コミット**

```bash
git add scripts/github-actions/fetch_stock_prices.py
git commit -m "feat: バッチ処理で25日移動平均乖離率を計算・保存"
```

---

## Task 4: LLMプロンプトに乖離率コンテキストを追加

**Files:**
- Modify: `lib/stock-analysis-context.ts`（末尾に新関数を追加）
- Modify: `app/api/stocks/[stockId]/purchase-recommendation/route.ts`（プロンプト組み立て部分）

**Step 1: `lib/stock-analysis-context.ts` に `buildMADeviationContext` を追加**

ファイル末尾に追加:

```typescript
export function buildMADeviationContext(maDeviationRate: number | null): string {
  if (maDeviationRate === null) return ""

  let status: string
  if (maDeviationRate >= 20) {
    status = "過熱圏。高値づかみリスクに注意"
  } else if (maDeviationRate <= -20) {
    status = "売られすぎ圏。リバウンドの可能性あり（業績確認推奨）"
  } else if (Math.abs(maDeviationRate) <= 5) {
    status = "移動平均線に沿った安定した値動き"
  } else {
    status = maDeviationRate > 0 ? "やや上方乖離" : "やや下方乖離"
  }

  return `25日移動平均乖離率: ${maDeviationRate > 0 ? "+" : ""}${maDeviationRate.toFixed(1)}%（${status}）`
}
```

**Step 2: 購入判断APIで乖離率を計算しプロンプトに含める**

`app/api/stocks/[stockId]/purchase-recommendation/route.ts` で:

1. import追加:

```typescript
import { buildMADeviationContext } from "@/lib/stock-analysis-context"
import { calculateDeviationRate, calculateRSI, calculateSMA } from "@/lib/technical-indicators"
import { MA_DEVIATION } from "@/lib/constants"
```

2. L272付近（`buildWeekChangeContext` の後）で乖離率・RSIを計算（後のTaskでも使う）:

```typescript
// MA乖離率を計算（pricesはoldest-first → reverseしてnewest-firstに）
const pricesNewestFirst = [...prices].reverse().map(p => ({ close: p.close }))
const maDeviationRate = calculateDeviationRate(pricesNewestFirst, MA_DEVIATION.PERIOD)
const maDeviationContext = buildMADeviationContext(maDeviationRate)

// RSI計算（購入タイミング判定でも使う）
const rsiValue = calculateRSI(pricesNewestFirst)
```

3. プロンプト文字列に `maDeviationContext` を追加（既存のtechnicalContextの近く）

**Step 3: ビルド確認**

Run: `npx next build`
Expected: PASS

**Step 4: コミット**

```bash
git add lib/stock-analysis-context.ts app/api/stocks/\[stockId\]/purchase-recommendation/route.ts
git commit -m "feat: 購入判断APIのLLMプロンプトに乖離率コンテキストを追加"
```

---

## Task 5: 購入判断APIの後処理に強制補正ルールを追加

**Files:**
- Modify: `app/api/stocks/[stockId]/purchase-recommendation/route.ts:507-533`（強制補正ルール部分）

既存の強制補正ルール（L507-533）の後に追加。`volatility` 変数はL519で既に定義済み。

**Step 1: ルール4（上方乖離 → stay）を追加**

L533（市場急落チェック）の後に追加:

```typescript
// ルール4: MA上方乖離 (+20%以上) → buy→stay
if (
  maDeviationRate !== null &&
  maDeviationRate >= MA_DEVIATION.UPPER_THRESHOLD &&
  result.recommendation === "buy"
) {
  result.recommendation = "stay"
  result.confidence = Math.max(0, result.confidence + MA_DEVIATION.CONFIDENCE_PENALTY)
  result.caution = `25日移動平均から+${maDeviationRate.toFixed(1)}%上方乖離しており割高感があるため、様子見を推奨します。${result.caution}`
}
```

**Step 2: ルール5（下方乖離 + 黒字 + 低ボラ → confidence bonus）を追加**

```typescript
// ルール5: MA下方乖離 (-20%以下) + 黒字 + 低ボラ → confidenceボーナス
if (
  maDeviationRate !== null &&
  maDeviationRate <= MA_DEVIATION.LOWER_THRESHOLD &&
  stock.isProfitable === true &&
  volatility !== null &&
  volatility <= MA_DEVIATION.LOW_VOLATILITY_THRESHOLD
) {
  result.confidence = Math.min(1.0, result.confidence + MA_DEVIATION.CONFIDENCE_BONUS)
}
```

**Step 3: ビルド確認**

Run: `npx next build`
Expected: PASS

**Step 4: コミット**

```bash
git add app/api/stocks/\[stockId\]/purchase-recommendation/route.ts
git commit -m "feat: 乖離率による強制補正ルール（上方乖離→stay、下方乖離→bonus）を追加"
```

---

## Task 6: 購入タイミング判定ロジックを追加

**Files:**
- Modify: `app/api/stocks/[stockId]/purchase-recommendation/route.ts`（強制補正の後、DB保存の前）

**Step 1: タイミング判定ロジックを追加**

強制補正ルールの後（Task 5の後）、`prisma.purchaseRecommendation.upsert`（L539付近）の前に追加:

```typescript
// 購入タイミング判定（buy推奨時のみ）
let buyTiming: string | null = null
let dipTargetPrice: number | null = null

if (result.recommendation === "buy") {
  const deviationOverThreshold = maDeviationRate !== null && maDeviationRate > MA_DEVIATION.DIP_BUY_THRESHOLD
  const rsiOverThreshold = rsiValue !== null && rsiValue > MA_DEVIATION.RSI_OVERBOUGHT_THRESHOLD

  if (maDeviationRate === null && rsiValue === null) {
    // 両方取得不可 → 判定なし
    buyTiming = null
  } else if (deviationOverThreshold || rsiOverThreshold) {
    buyTiming = "dip"
    // SMA(25)を目安価格として算出
    const sma = calculateSMA(pricesNewestFirst, MA_DEVIATION.PERIOD)
    dipTargetPrice = sma
  } else {
    buyTiming = "market"
  }
}
```

**Step 2: DB保存にbuyTiming/dipTargetPriceを追加**

`prisma.purchaseRecommendation.upsert` のcreate/updateブロックに追加:

```typescript
buyTiming,
dipTargetPrice,
```

**Step 3: ビルド確認**

Run: `npx next build`
Expected: PASS

**Step 4: コミット**

```bash
git add app/api/stocks/\[stockId\]/purchase-recommendation/route.ts
git commit -m "feat: 買い推奨時の購入タイミング判定（成り行き/押し目買い）を追加"
```

---

## Task 7: 日次おすすめスコアリングに乖離率反映

**Files:**
- Modify: `lib/recommendation-scoring.ts`
  - `StockForScoring` インターフェース（L72-83）に `maDeviationRate` を追加
  - `calculateStockScores` 関数（L196付近）にペナルティ/ボーナスを追加
- Modify: `app/api/recommendations/generate-daily/route.ts`（stock取得クエリ）

**Step 1: StockForScoringインターフェースにフィールド追加**

```typescript
maDeviationRate?: number | null
```

**Step 2: import追加**

```typescript
import { MA_DEVIATION } from "@/lib/constants"
```

**Step 3: スコアリングロジックにペナルティ/ボーナスを追加**

L194（`unknownEarningsPenalty`）の後に追加:

```typescript
// MA乖離率ペナルティ/ボーナス
if (stock.maDeviationRate !== null && stock.maDeviationRate !== undefined) {
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

**Step 4: スコアリング呼び出し元でmaDeviationRateを渡す**

`app/api/recommendations/generate-daily/route.ts` でStockをクエリしている箇所に `maDeviationRate: true` を追加し、マッピング時に `Number()` 変換する。

**Step 5: ビルド確認**

Run: `npx next build`
Expected: PASS

**Step 6: コミット**

```bash
git add lib/recommendation-scoring.ts app/api/recommendations/generate-daily/route.ts
git commit -m "feat: 日次おすすめスコアリングに乖離率ペナルティ/ボーナスを追加"
```

---

## Task 8: 購入判断カードUIに購入タイミングセクションを追加

**Files:**
- Modify: `app/components/PurchaseRecommendation.tsx`
  - `RecommendationData` インターフェース（L11-52）にフィールド追加
  - `buy` の表示部分（L524-571）にタイミングセクション追加

**Step 1: RecommendationDataインターフェースにフィールド追加**

```typescript
buyTiming?: string | null       // "market" | "dip" | null
dipTargetPrice?: number | null  // 押し目買い時のSMA(25)
```

**Step 2: 購入タイミングセクションコンポーネントを作成**

`PurchaseRecommendation.tsx` 内にヘルパーコンポーネントを追加:

```tsx
function BuyTimingSection({ buyTiming, dipTargetPrice }: {
  buyTiming?: string | null
  dipTargetPrice?: number | null
}) {
  if (!buyTiming) return null

  if (buyTiming === "market") {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-semibold">
            成り行き購入OK
          </span>
        </div>
        <p className="text-sm text-green-800">
          移動平均線に近く、過熱感もありません。現在の価格帯で購入を検討できます。
        </p>
      </div>
    )
  }

  if (buyTiming === "dip") {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-xs font-semibold">
            押し目買い推奨
          </span>
        </div>
        <p className="text-sm text-yellow-800">
          {dipTargetPrice
            ? `25日移動平均線の${dipTargetPrice.toLocaleString()}円付近まで待つとより有利です。`
            : "現在やや割高圏のため、下がったタイミングでの購入がおすすめです。"}
        </p>
        <p className="text-xs text-yellow-600 mt-1">
          押し目買い: 上昇トレンドの一時的な下落を狙って買うこと。移動平均線は過去25日間の平均価格で、株価の「適正な位置」の目安になります。
        </p>
      </div>
    )
  }

  return null
}
```

**Step 3: buy表示部分にセクションを挿入**

L524-571の `recommendation === "buy"` ブロック内、`PersonalizedSection` の後に追加:

```tsx
<BuyTimingSection
  buyTiming={recommendation.buyTiming}
  dipTargetPrice={recommendation.dipTargetPrice}
/>
```

**Step 4: APIレスポンスにフィールドを含める**

購入判断データを取得している箇所で `buyTiming` と `dipTargetPrice` が返されるよう確認。Prismaのselect/includeに含める。

**Step 5: ビルド確認**

Run: `npx next build`
Expected: PASS

**Step 6: コミット**

```bash
git add app/components/PurchaseRecommendation.tsx
git commit -m "feat: 購入判断カードに成り行き/押し目買いタイミングセクションを追加"
```

---

## Task 9: ウォッチリストカードにタイミングバッジを追加

**Files:**
- Modify: `app/my-stocks/StockCard.tsx`（L122-127付近、バッジ表示部分）

**Step 1: バッジ表示部分にタイミングバッジを追加**

L122-127のAI推奨バッジの下に、buyの場合のみタイミングバッジを追加:

```tsx
{/* 購入タイミングバッジ - AI推奨バッジの下 */}
{aiJudgment && recommendation?.recommendation === "buy" && recommendation?.buyTiming && (
  <span className={`absolute top-10 right-3 sm:top-11 sm:right-4 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
    recommendation.buyTiming === "market"
      ? "bg-green-100 text-green-700"
      : "bg-yellow-100 text-yellow-700"
  }`}>
    {recommendation.buyTiming === "market" ? "成り行きOK" : "押し目待ち"}
  </span>
)}
```

**Step 2: データ取得にbuyTimingを含める**

StockCardにデータを渡す親コンポーネント（`MyStocksClient.tsx`等）で、recommendation取得時に `buyTiming` をselectに含める。

**Step 3: ビルド確認**

Run: `npx next build`
Expected: PASS

**Step 4: コミット**

```bash
git add app/my-stocks/StockCard.tsx
git commit -m "feat: ウォッチリストカードに成り行きOK/押し目待ちバッジを追加"
```

---

## Task 10: 動作確認・最終ビルド

**Step 1: ローカルビルド確認**

```bash
npx next build
```

**Step 2: 開発サーバーで表示確認**

```bash
npm run dev
```

確認項目:
- ウォッチリストの銘柄詳細ページで購入判断を実行
- `buyTiming` / `dipTargetPrice` がDBに保存されること
- 「成り行き購入OK」または「押し目買い推奨」セクションが表示されること
- ウォッチリスト一覧で「成り行きOK」/「押し目待ち」バッジが表示されること
- 乖離率+20%以上の銘柄でbuy→stayに強制補正されること

**Step 3: 最終コミット（必要な場合のみ）**

修正があればコミット。

---

## 変更ファイル一覧

| Task | ファイル | 変更内容 |
|------|---------|---------|
| 1 | `lib/constants.ts` | MA_DEVIATION に DIP_BUY_THRESHOLD, RSI_OVERBOUGHT_THRESHOLD 追加 |
| 2 | `prisma/schema.prisma` | Stock.maDeviationRate + PurchaseRecommendation.buyTiming/dipTargetPrice |
| 2 | `prisma/migrations/` | マイグレーションファイル作成 |
| 3 | `scripts/github-actions/fetch_stock_prices.py` | 乖離率計算・保存処理追加 |
| 4 | `lib/stock-analysis-context.ts` | buildMADeviationContext関数追加 |
| 4 | `app/api/stocks/[stockId]/purchase-recommendation/route.ts` | 乖離率計算 + LLMプロンプト更新 |
| 5 | `app/api/stocks/[stockId]/purchase-recommendation/route.ts` | 強制補正ルール4,5追加 |
| 6 | `app/api/stocks/[stockId]/purchase-recommendation/route.ts` | 購入タイミング判定 + DB保存 |
| 7 | `lib/recommendation-scoring.ts` | スコアペナルティ/ボーナス追加 |
| 7 | `app/api/recommendations/generate-daily/route.ts` | maDeviationRateのクエリ追加 |
| 8 | `app/components/PurchaseRecommendation.tsx` | 購入タイミングセクション追加 |
| 9 | `app/my-stocks/StockCard.tsx` | 成り行きOK/押し目待ちバッジ追加 |
