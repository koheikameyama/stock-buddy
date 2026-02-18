# 移動平均乖離率による推奨補正

## 概要

AIが「上がりきっている銘柄」を推奨してしまう問題を防ぐため、25日移動平均線からの乖離率を購入判断と日次おすすめの両システムに組み込む。

## 背景

現在の強制補正ルール:
1. 週間変動率 >= 30% の急騰銘柄 → buy→stay
2. 赤字 + ボラティリティ > 50% → buy→stay
3. 市場全体が急落中（日経225 週間 -5%以下） → buy→stay

これらは短期的な急変動を捕捉するが、「じわじわ上がり続けて移動平均線から大きく乖離した銘柄」は検出できない。

## 乖離率テーブル

| 乖離率の状態 | AIの判断 (Confidence) | 戦略的な意味 |
|---|---|---|
| +20% 以上 | 強制的に下げる | 「上がりきっている（天井）」ため、高値づかみを防ぐ |
| -20% 以下 | 条件付きで上げる | 「暴落しすぎ（底）」であり、リバウンド狙いのチャンス |
| ±5% 以内 | 通常評価 | トレンドに沿った安定した状態 |

## 設計

### 1. 乖離率の計算

**場所:** `lib/technical-indicators.ts`

新規関数 `calculateDeviationRate(prices, period)` を追加。

- 入力: 終値の配列（新しい順）、期間（デフォルト25日）
- 出力: 乖離率（%）。例: +22.5 や -18.3
- 計算式: `(現在価格 - SMA) / SMA × 100`
- pricesが期間未満の場合は `null` を返す

### 2. 定数定義

**場所:** `lib/constants.ts`

```typescript
export const MA_DEVIATION = {
  PERIOD: 25,                    // 移動平均の期間
  UPPER_THRESHOLD: 20,           // 上方乖離の閾値（%）
  LOWER_THRESHOLD: -20,          // 下方乖離の閾値（%）
  CONFIDENCE_PENALTY: -0.15,     // 上方乖離時のconfidenceペナルティ
  CONFIDENCE_BONUS: 0.1,         // 下方乖離時のconfidenceボーナス
  SCORE_PENALTY: -20,            // 日次おすすめのスコアペナルティ
  SCORE_BONUS: 10,               // 日次おすすめのスコアボーナス
  LOW_VOLATILITY_THRESHOLD: 30,  // 低ボラティリティの閾値（%）
}
```

### 3. DBスキーマ変更

**場所:** `prisma/schema.prisma` の `Stock` モデル

```prisma
maDeviationRate  Decimal?  @db.Decimal(10, 2)  // 25日移動平均乖離率(%)
```

バッチ処理（`fetch_stocks.py`）で計算・保存し、スコアリング時はDB値を参照する。

### 4. 購入判断APIへの適用

**場所:** `app/api/stocks/[stockId]/purchase-recommendation/route.ts`

#### 4a. LLMプロンプトに乖離率コンテキストを追加

乖離率の値と状態を注釈付きでプロンプトに含める:
- +20%以上: 「過熱圏。高値づかみリスクに注意」
- -20%以下: 「売られすぎ圏。リバウンドの可能性あり（業績確認推奨）」
- ±5%以内: 「移動平均線に沿った安定した値動き」
- その他: 乖離率の数値のみ表示

#### 4b. 後処理での強制補正

既存の強制補正ルールの後に2つのルールを追加:

**ルール4: 上方乖離 (+20%以上)**
- `recommendation === "buy"` → `"stay"` に変更
- `confidence` に -0.15 ペナルティ（下限0）
- cautionメッセージ追加

**ルール5: 下方乖離 (-20%以下) + 黒字 + 低ボラ**
- `confidence` に +0.1 ボーナス（上限1.0）
- recommendationは変更しない

### 5. 日次おすすめスコアリングへの適用

**場所:** `lib/recommendation-scoring.ts`

既存のペナルティの後に追加:
- 乖離率 >= +20%: スコア -20
- 乖離率 <= -20% かつ 黒字 かつ 低ボラ: スコア +10

### 6. バッチ処理での乖離率計算

**場所:** `scripts/fetch_stocks.py`

株価更新処理の最後に乖離率計算を追加:
1. 各銘柄の直近25日分の終値を `StockPrice` テーブルから一括取得
2. SMA(25)を計算
3. 乖離率を算出
4. `Stock.maDeviationRate` を一括更新

N+1問題を回避するため、一括取得・一括更新で実装する。

## 影響範囲

| ファイル | 変更内容 |
|---|---|
| `lib/constants.ts` | MA_DEVIATION定数追加 |
| `lib/technical-indicators.ts` | calculateDeviationRate関数追加 |
| `prisma/schema.prisma` | Stock.maDeviationRateカラム追加 |
| `prisma/migrations/` | マイグレーションファイル |
| `scripts/fetch_stocks.py` | 乖離率計算・保存処理追加 |
| `app/api/stocks/[stockId]/purchase-recommendation/route.ts` | 強制補正ルール追加 + LLMプロンプト更新 |
| `lib/recommendation-scoring.ts` | スコアペナルティ/ボーナス追加 |
| `lib/stock-analysis-context.ts` | 乖離率コンテキスト生成 |
