# 市場全体の状況をAI分析に組み込む

## 概要

購入推奨のAI分析に日経平均のトレンド情報を追加し、市場全体の状況を考慮した判断を可能にする。

## 背景

現状のAI分析は個別銘柄の情報（テクニカル指標、財務指標、ニュース）のみで判断している。市場全体が急落している局面では、個別銘柄が良好でも買い推奨を控えるべきケースがある。

## 設計方針

**「AIとルールの役割分担」の思想に沿う:**
- AIの参考情報として市場トレンドを提供
- ハードルールで市場急落時の買い推奨を抑制

## 機能仕様

### 1. データ取得

**新規ユーティリティ: `lib/market-index.ts`**

```typescript
export interface MarketIndexData {
  currentPrice: number        // 現在値
  weekChangeRate: number      // 週間変化率（%）
  trend: "up" | "down" | "neutral"  // トレンド
  isMarketCrash: boolean      // 急落フラグ
}

export async function getNikkei225Data(): Promise<MarketIndexData>
```

**取得方法:**
- yfinanceで`^N225`の過去7日間データを取得
- 週間変化率を計算

**トレンド判定基準:**
| 週間変化率 | トレンド |
|-----------|---------|
| >= +3% | up（上昇） |
| <= -3% | down（下落） |
| それ以外 | neutral（横ばい） |

**急落判定基準:**
- 週間変化率 <= -5% → `isMarketCrash: true`

### 2. ハードルール補正

**既存ルールに追加:**

| # | 条件 | 補正 |
|---|------|------|
| 1 | 急騰銘柄（週間+30%以上） | buy → stay |
| 2 | 赤字 + 高ボラティリティ（50%超） | buy → stay |
| 3 | **市場急落（日経平均 週間-5%以下）** | **buy → stay** |

**補正時の挙動:**
- `recommendation`を`stay`に変更
- `reason`の先頭に「市場全体が急落しているため、様子見をおすすめします。」を追加
- `buyCondition`に「市場が落ち着いてから」を設定

### 3. AIプロンプト追加

**プロンプトに市場情報セクションを追加:**

```
【市場全体の状況】
- 日経平均株価: {currentPrice}円
- 週間変化率: {weekChangeRate}%
- トレンド: {trendDescription}

※市場全体の状況を考慮して判断してください。
  市場が弱い中で堅調な銘柄は評価できます。
  市場上昇時は追い風として言及できます。
```

**トレンド説明文:**
- up: 「上昇傾向」
- down: 「下落傾向」
- neutral: 「横ばい」

### 4. エラーハンドリング

**日経平均データ取得失敗時:**
- `marketData`を`null`としてフォールバック
- ハードルール補正はスキップ
- プロンプトの市場情報セクションは省略
- 従来通り個別銘柄のみで判断

**理由:**
- 日経平均取得失敗で全体の処理が止まるのを防ぐ
- 個別銘柄分析だけでも十分な価値がある

## 影響範囲

### 変更ファイル

| ファイル | 変更内容 |
|---------|---------|
| `lib/market-index.ts` | 新規作成 |
| `app/api/stocks/[stockId]/purchase-recommendation/route.ts` | 市場データ取得、ハードルール追加、プロンプト追加 |
| `lib/constants.ts` | 閾値定数追加（MARKET_CRASH_THRESHOLD等） |

### 定数追加

```typescript
// lib/constants.ts
export const MARKET_INDEX = {
  CRASH_THRESHOLD: -5,      // 急落判定（週間変化率%）
  UP_TREND_THRESHOLD: 3,    // 上昇トレンド判定
  DOWN_TREND_THRESHOLD: -3, // 下落トレンド判定
}
```

## 将来の拡張可能性

- 騰落レシオの追加
- セクター別強弱の追加
- VIX（恐怖指数）の追加

これらは同じアーキテクチャで追加可能。
