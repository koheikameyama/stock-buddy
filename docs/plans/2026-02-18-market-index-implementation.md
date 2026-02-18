# 市場全体の状況をAI分析に組み込む - 実装計画

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 購入推奨のAI分析に日経平均のトレンド情報を追加し、市場急落時は買い推奨を抑制する

**Architecture:** yfinanceで日経平均(^N225)を取得し、週間変化率からトレンドと急落を判定。AIプロンプトに市場情報を追加し、ハードルールで急落時の買い推奨をstayに補正する。

**Tech Stack:** TypeScript, yfinance (既存のstock-price-fetcher経由), OpenAI API

---

## Task 1: 定数を追加

**Files:**
- Modify: `lib/constants.ts:78` (末尾に追加)

**Step 1: 市場指標の定数を追加**

`lib/constants.ts` の末尾に以下を追加:

```typescript
// 市場指標の閾値
export const MARKET_INDEX = {
  CRASH_THRESHOLD: -5,      // 急落判定（週間変化率%）
  UP_TREND_THRESHOLD: 3,    // 上昇トレンド判定（週間変化率%）
  DOWN_TREND_THRESHOLD: -3, // 下落トレンド判定（週間変化率%）
} as const
```

**Step 2: ビルド確認**

Run: `npm run build`
Expected: ビルド成功

**Step 3: コミット**

```bash
git add lib/constants.ts
git commit -m "feat: 市場指標の閾値定数を追加"
```

---

## Task 2: 日経平均データ取得ユーティリティを作成

**Files:**
- Create: `lib/market-index.ts`

**Step 1: ユーティリティを作成**

`lib/market-index.ts` を以下の内容で作成:

```typescript
import { fetchHistoricalPrices } from "@/lib/stock-price-fetcher"
import { MARKET_INDEX } from "@/lib/constants"

export interface MarketIndexData {
  currentPrice: number
  weekChangeRate: number
  trend: "up" | "down" | "neutral"
  isMarketCrash: boolean
}

/**
 * 日経平均のトレンドデータを取得
 * @returns MarketIndexData または取得失敗時は null
 */
export async function getNikkei225Data(): Promise<MarketIndexData | null> {
  try {
    // yfinanceで日経平均を取得（^N225）
    const prices = await fetchHistoricalPrices("^N225", "1w")

    if (prices.length < 2) {
      console.warn("日経平均の価格データが不足しています")
      return null
    }

    // 最新と1週間前の終値
    const latestPrice = prices[0].close
    const weekAgoPrice = prices[Math.min(4, prices.length - 1)].close

    // 週間変化率を計算
    const weekChangeRate = ((latestPrice - weekAgoPrice) / weekAgoPrice) * 100

    // トレンド判定
    let trend: "up" | "down" | "neutral"
    if (weekChangeRate >= MARKET_INDEX.UP_TREND_THRESHOLD) {
      trend = "up"
    } else if (weekChangeRate <= MARKET_INDEX.DOWN_TREND_THRESHOLD) {
      trend = "down"
    } else {
      trend = "neutral"
    }

    // 急落判定
    const isMarketCrash = weekChangeRate <= MARKET_INDEX.CRASH_THRESHOLD

    return {
      currentPrice: latestPrice,
      weekChangeRate,
      trend,
      isMarketCrash,
    }
  } catch (error) {
    console.error("日経平均データの取得に失敗:", error)
    return null
  }
}

/**
 * トレンドを日本語に変換
 */
export function getTrendDescription(trend: "up" | "down" | "neutral"): string {
  switch (trend) {
    case "up":
      return "上昇傾向"
    case "down":
      return "下落傾向"
    case "neutral":
      return "横ばい"
  }
}
```

**Step 2: ビルド確認**

Run: `npm run build`
Expected: ビルド成功

**Step 3: コミット**

```bash
git add lib/market-index.ts
git commit -m "feat: 日経平均データ取得ユーティリティを追加"
```

---

## Task 3: 購入推奨APIに市場データを統合

**Files:**
- Modify: `app/api/stocks/[stockId]/purchase-recommendation/route.ts`

**Step 1: インポートを追加**

ファイル先頭のインポートに追加:

```typescript
import { getNikkei225Data, getTrendDescription, MarketIndexData } from "@/lib/market-index"
```

**Step 2: 市場データ取得を追加**

POST関数内、`// リアルタイム株価を取得` の前（約309行目付近）に以下を追加:

```typescript
    // 市場全体の状況を取得
    let marketData: MarketIndexData | null = null
    try {
      marketData = await getNikkei225Data()
    } catch (error) {
      console.error("市場データ取得失敗（フォールバック）:", error)
    }
```

**Step 3: プロンプトに市場情報セクションを追加**

`weekChangeContext` の後（約338行目付近）に以下を追加:

```typescript
    // 市場全体の状況コンテキスト
    let marketContext = ""
    if (marketData) {
      const trendDesc = getTrendDescription(marketData.trend)
      marketContext = `
【市場全体の状況】
- 日経平均株価: ${marketData.currentPrice.toLocaleString()}円
- 週間変化率: ${marketData.weekChangeRate >= 0 ? "+" : ""}${marketData.weekChangeRate.toFixed(1)}%
- トレンド: ${trendDesc}

※市場全体の状況を考慮して判断してください。
  市場が弱い中で堅調な銘柄は評価できます。
  市場上昇時は追い風として言及できます。
`
    }
```

**Step 4: プロンプト文字列に市場コンテキストを追加**

プロンプト文字列内の `${weekChangeContext}` の後に `${marketContext}` を追加:

変更前:
```typescript
${weekChangeContext}${patternContext}${technicalContext}${chartPatternContext}${newsContext}
```

変更後:
```typescript
${weekChangeContext}${marketContext}${patternContext}${technicalContext}${chartPatternContext}${newsContext}
```

**Step 5: ハードルール補正を追加**

既存のハードルール補正（危険銘柄の強制補正、約634行目付近）の後に以下を追加:

```typescript
    // 市場急落時の強制補正: 日経平均が週間-5%以下でbuyの場合はstayに変更
    if (marketData?.isMarketCrash && result.recommendation === "buy") {
      result.recommendation = "stay"
      result.reason = `市場全体が急落しているため、様子見をおすすめします。${result.reason}`
      result.buyCondition = result.buyCondition || "市場が落ち着いてから検討してください"
    }
```

**Step 6: ビルド確認**

Run: `npm run build`
Expected: ビルド成功

**Step 7: コミット**

```bash
git add app/api/stocks/[stockId]/purchase-recommendation/route.ts
git commit -m "feat: 購入推奨に市場全体の状況を組み込み"
```

---

## Task 4: 動作確認

**Step 1: 開発サーバー起動**

Run: `npm run dev`

**Step 2: APIテスト**

任意の銘柄IDで購入推奨APIを呼び出し、市場情報が反映されていることを確認:

```bash
curl -X POST http://localhost:3000/api/stocks/{stockId}/purchase-recommendation \
  -H "Authorization: Bearer {CRON_SECRET}"
```

Expected: レスポンスに市場状況が反映された判断が返る

**Step 3: ログ確認**

コンソールに日経平均データ取得のログが出力されることを確認

---

## 完了チェックリスト

- [ ] `lib/constants.ts` に MARKET_INDEX 定数を追加
- [ ] `lib/market-index.ts` を作成
- [ ] 購入推奨APIに市場データ取得を追加
- [ ] プロンプトに市場情報セクションを追加
- [ ] 市場急落時のハードルール補正を追加
- [ ] ビルドが通ることを確認
- [ ] 動作確認
