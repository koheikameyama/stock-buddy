# 売りタイミング判断（成り行き売却 / 戻り売り推奨）

## 概要

売り推奨時に「成り行きで即売却すべきか」「戻り売り（リバウンド待ち）がおすすめか」を、乖離率・RSI・損益状況を組み合わせたルールベースで提供する。

買いタイミング判断（成り行き/押し目買い）と対称の機能。

## 背景

現在の問題:
- AIが「売り」と判断しても、**いつ売るべきか**のガイダンスがない
- 売られすぎ圏（乖離率-20%以下）でAIが売り推奨 → 大底で手放すリスク
- 利益が出ているのに「まだ上がるかも」と持ち続け → 利益消滅

買い側は乖離率+RSIで「成り行き/押し目」の判断を実装済み。売り側にも同等のルールが必要。

## 設計思想

プロジェクトの基本原則に従う:
- **AIの役割**: 売り/ホールドの判断
- **ルールの役割**: 売りタイミングの判定 + パニック売り防止

## 強制補正ルール

| 条件 | 補正 | 理由 |
|------|------|------|
| 乖離率 ≤ -20% かつ sell推奨 | **sell → hold に強制変更** | 異常な売られすぎ。大底で手放すリスクが高いため自律反発を待つ |

買い側の「乖離率+20%以上 → buy→stay」と完全に対称。

## 売りタイミング判定ルール

### 判定の優先順位

sell/avoid 推奨時のみ適用:

```
1. 乖離率 ≤ -20%
   → sell→hold 強制補正（sellTimingなし）

2. ポートフォリオ限定: 損失率 ≤ -15%
   → sellTiming = "market"（損切り優先・成り行き売却推奨）

3. ポートフォリオ限定: 利益率 ≥ +10%
   → sellTiming = "market"（利確優先・成り行き売却推奨）

4. 乖離率 ≥ -5% かつ RSI ≥ 30
   → sellTiming = "market"（成り行き売却OK）

5. 乖離率 < -5% または RSI < 30
   → sellTiming = "rebound"（戻り売り推奨）
```

### 判定の意味

| sellTiming | 意味 | アドバイス |
|-----------|------|-----------|
| `"market"` | 成り行き売却OK | 今が売り時。価格もモメンタムも適正圏、または損益的に即売りが最善 |
| `"rebound"` | 戻り売り推奨 | 短期的に売られすぎ。SMA25付近まで反発を待って売る方が有利 |

### 適用対象

| 対象 | API | 損益考慮 |
|------|-----|---------|
| ポートフォリオ（sell推奨） | `app/api/stocks/[stockId]/portfolio-analysis/route.ts` | あり（損益率を参照） |
| ウォッチリスト（avoid推奨） | `app/api/stocks/[stockId]/purchase-recommendation/route.ts` | なし（テクニカルのみ） |

## DBスキーマ変更

### PortfolioStockモデル

```prisma
sellTiming       String?              // "market" | "rebound" | null
sellTargetPrice  Decimal? @db.Decimal(12, 2)  // 戻り売り時の目安価格（SMA25）
```

### PurchaseRecommendationモデル

```prisma
sellTiming       String?              // "market" | "rebound" | null（avoid時のみ）
sellTargetPrice  Decimal? @db.Decimal(10, 2)  // 戻り売り時の目安価格（SMA25）
```

## 定数定義

**場所:** `lib/constants.ts`

```typescript
export const SELL_TIMING = {
  DEVIATION_LOWER_THRESHOLD: -5,   // 乖離率がこれ未満で戻り売り推奨
  RSI_OVERSOLD_THRESHOLD: 30,      // RSIがこれ未満で戻り売り推奨
  PANIC_SELL_THRESHOLD: -20,       // 乖離率がこれ以下でsell→hold強制補正
  PROFIT_TAKING_THRESHOLD: 10,     // 利益率(%)がこれ以上で利確優先（成り行き推奨）
  STOP_LOSS_THRESHOLD: -15,        // 損失率(%)がこれ以下で損切り優先（成り行き推奨）
} as const
```

## ポートフォリオ分析APIへの適用

**場所:** `app/api/stocks/[stockId]/portfolio-analysis/route.ts`

### 後処理での強制補正

現在ポートフォリオ分析にはルールベースの後処理がない。新規追加:

**ルール: 下方乖離 (-20%以下) → sell→hold**
- `recommendation === "sell"` かつ `deviationRate <= -20%` → `"hold"` に変更
- `statusType` を `"warning"` → `"neutral"` に変更
- cautionメッセージ追加

### 売りタイミング判定

強制補正の後、`recommendation === "sell"` の場合にのみ判定:

1. 損益率を計算（既に `profitPercent` が利用可能）
2. 乖離率を計算（`calculateDeviationRate` で算出）
3. RSIを計算（`calculateRSI` で算出）
4. 優先順位に従い `sellTiming` を決定
5. 戻り売り時は `sellTargetPrice` = SMA(25)

### 売りタイミングの理由表示

`sellTiming` の理由をUIに渡すため、理由テキストも生成:
- 損切り優先: 「損失率が-X%に達しており、これ以上の損失拡大を防ぐため即売りを推奨します」
- 利確優先: 「利益率+X%で利確タイミングです。利益を確実に確保しましょう」
- テクニカル（成り行き）: 「移動平均線に近く、売られすぎの状態ではありません」
- テクニカル（戻り売り）: 「RSIが売られすぎ圏（X）/ 乖離率が-X%のため、SMA25付近への反発を待つのが有利です」

## ウォッチリスト購入判断APIへの適用

**場所:** `app/api/stocks/[stockId]/purchase-recommendation/route.ts`

既存の強制補正の後に追加:

**ルール: 下方乖離 (-20%以下) → avoid→stay**
- `recommendation === "avoid"` かつ `deviationRate <= -20%` → `"stay"` に変更
- cautionメッセージ追加

**売りタイミング判定:**
- `recommendation === "avoid"` の場合のみ
- 損益データなし → テクニカルルールのみで判定（優先順位4,5）
- `sellTiming` と `sellTargetPrice` を保存

## UI表示

### ポートフォリオ分析カード（`StockAnalysisCard.tsx`）

売却推奨セクション（`statusType === "warning"`）内に追加:

**成り行き売却OK** (`"market"`):
- 赤バッジ「成り行き売却OK」
- 理由テキスト（損切り/利確/テクニカル）
- 「現在の価格帯での売却を検討できます」

**戻り売り推奨** (`"rebound"`):
- 黄バッジ「戻り売り推奨」
- 「25日移動平均線のX円付近まで反発を待つとより有利です」
- 用語解説（「戻り売りとは…」「RSIとは…」）

### ウォッチリストカード（`StockCard.tsx`）

avoid判定時にバッジ追加:
- `"market"` → 既存の「見送り推奨」バッジのまま
- `"rebound"` → 黄系バッジ「戻り待ち」追加

### 購入判断カード（`PurchaseRecommendation.tsx`）

avoid表示部分にセクション追加:
- 成り行き: 「現在が売却に適したタイミングです」
- 戻り売り: 「反発を待ってから手放す方が有利です」

## 影響範囲

| ファイル | 変更内容 |
|---|---|
| `lib/constants.ts` | SELL_TIMING定数追加 |
| `prisma/schema.prisma` | PortfolioStock.sellTiming/sellTargetPrice + PurchaseRecommendation.sellTiming/sellTargetPrice追加 |
| `prisma/migrations/` | マイグレーションファイル |
| `app/api/stocks/[stockId]/portfolio-analysis/route.ts` | 強制補正ルール追加 + 売りタイミング判定追加 |
| `app/api/stocks/[stockId]/purchase-recommendation/route.ts` | avoid時の強制補正 + 売りタイミング判定追加 |
| `app/components/StockAnalysisCard.tsx` | 売りタイミングセクション追加 |
| `app/components/PurchaseRecommendation.tsx` | avoid時の売りタイミングセクション追加 |
| `app/my-stocks/StockCard.tsx` | 戻り待ちバッジ追加 |
