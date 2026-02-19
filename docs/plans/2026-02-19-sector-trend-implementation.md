# セクタートレンド分析機能 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** ニュース + 株価データからセクター別トレンドを分析し、おすすめ・購入判断・ポートフォリオ分析・ダッシュボードに統合する。

**Architecture:** 株価予測バッチ（stock-predictions.yml）の後にセクタートレンド計算を実行。MarketNewsのセンチメント + Stockの株価モメンタム（weekChangeRate, volumeRatio等）を統合して compositeScore を算出し、SectorTrendテーブルに保存。各分析APIとダッシュボードから参照する。US→JP連動は既存セクターマッピングで合算。

**Tech Stack:** Next.js, Prisma, TypeScript, GitHub Actions

**設計書:** `docs/plans/2026-02-19-sector-trend-analysis-design.md`

---

## Task 1: Prismaスキーマ - SectorTrendモデル追加

**Files:**
- Modify: `prisma/schema.prisma:191` (MarketNewsモデルの `}` の直後)

**Step 1: スキーマにSectorTrendモデルを追加**

`prisma/schema.prisma` の MarketNews モデル（191行目 `}` の後）に追加:

```prisma
// セクタートレンド分析（ニュース + 株価統合）
model SectorTrend {
  id        String   @id @default(cuid())
  date      DateTime @db.Date
  sector    String

  // 3日窓（短期の勢い）- ニュース
  score3d       Float
  newsCount3d   Int
  positive3d    Int
  negative3d    Int
  neutral3d     Int

  // 7日窓（中期トレンド）- ニュース
  score7d       Float
  newsCount7d   Int
  positive7d    Int
  negative7d    Int
  neutral7d     Int

  // US→JP連動
  usNewsCount3d Int   @default(0)
  usNewsCount7d Int   @default(0)

  // 株価モメンタム（セクター内全銘柄の平均）
  avgWeekChangeRate   Float?   // セクター平均週間変化率（%）
  avgDailyChangeRate  Float?   // セクター平均日次変化率（%）
  avgMaDeviationRate  Float?   // セクター平均MA乖離率（%）
  avgVolumeRatio      Float?   // セクター平均出来高比率
  avgVolatility       Float?   // セクター平均ボラティリティ（%）
  stockCount          Int      @default(0) // 集計対象の銘柄数

  // 総合スコア（ニュース + 株価を統合）
  compositeScore      Float?   // -100 〜 +100

  // メタ
  trendDirection String   // "up" | "down" | "neutral"
  createdAt  DateTime @default(now())

  @@unique([date, sector])
  @@index([date])
  @@index([sector])
}
```

**Step 2: マイグレーション作成**

Run: `npx prisma migrate dev --name add_sector_trend`

シャドウDBエラーが出た場合は手動マイグレーション:
```bash
mkdir -p prisma/migrations/$(date +%Y%m%d%H%M%S)_add_sector_trend
```

migration.sql:
```sql
CREATE TABLE "SectorTrend" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "sector" TEXT NOT NULL,
    "score3d" DOUBLE PRECISION NOT NULL,
    "newsCount3d" INTEGER NOT NULL,
    "positive3d" INTEGER NOT NULL,
    "negative3d" INTEGER NOT NULL,
    "neutral3d" INTEGER NOT NULL,
    "score7d" DOUBLE PRECISION NOT NULL,
    "newsCount7d" INTEGER NOT NULL,
    "positive7d" INTEGER NOT NULL,
    "negative7d" INTEGER NOT NULL,
    "neutral7d" INTEGER NOT NULL,
    "usNewsCount3d" INTEGER NOT NULL DEFAULT 0,
    "usNewsCount7d" INTEGER NOT NULL DEFAULT 0,
    "avgWeekChangeRate" DOUBLE PRECISION,
    "avgDailyChangeRate" DOUBLE PRECISION,
    "avgMaDeviationRate" DOUBLE PRECISION,
    "avgVolumeRatio" DOUBLE PRECISION,
    "avgVolatility" DOUBLE PRECISION,
    "stockCount" INTEGER NOT NULL DEFAULT 0,
    "compositeScore" DOUBLE PRECISION,
    "trendDirection" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SectorTrend_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SectorTrend_date_sector_key" ON "SectorTrend"("date", "sector");
CREATE INDEX "SectorTrend_date_idx" ON "SectorTrend"("date");
CREATE INDEX "SectorTrend_sector_idx" ON "SectorTrend"("sector");
```

```bash
npx prisma migrate resolve --applied YYYYMMDDHHMMSS_add_sector_trend
```

**Step 3: Prisma Client再生成**

Run: `npx prisma generate`

**Step 4: コミット**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: SectorTrendテーブルを追加"
```

---

## Task 2: 定数定義

**Files:**
- Modify: `lib/constants.ts:195` (SELL_TIMING定数の `} as const` の後)

**Step 1: セクタートレンド定数を追加**

`lib/constants.ts` の末尾（195行目の後）に追加:

```typescript
// セクタートレンド分析の閾値・重み
export const SECTOR_TREND = {
  UP_THRESHOLD: 20,           // compositeScore >= 20 → "up"
  DOWN_THRESHOLD: -20,        // compositeScore <= -20 → "down"
  US_INFLUENCE_WEIGHT: 0.7,   // US→JPの影響度係数
  // 総合スコアの重み配分
  NEWS_WEIGHT: 0.4,           // ニューススコアの重み
  PRICE_WEIGHT: 0.4,          // 株価モメンタムの重み
  VOLUME_WEIGHT: 0.2,         // 出来高スコアの重み
  // スケーリング用キャップ
  PRICE_CLAMP: 10,            // weekChangeRate のキャップ（±%）
  VOLUME_CLAMP: 1,            // volumeRatio - 1.0 のキャップ（±）
  // 強弱閾値
  STRONG_UP_THRESHOLD: 40,    // 強い追い風の閾値
  STRONG_DOWN_THRESHOLD: -40, // 強い逆風の閾値
  // おすすめスコアリングへのボーナス/ペナルティ
  STRONG_UP_BONUS: 15,        // compositeScore >= 40 → +15点
  UP_BONUS: 10,               // compositeScore >= 20 → +10点
  DOWN_PENALTY: -5,           // compositeScore <= -20 → -5点
  STRONG_DOWN_PENALTY: -10,   // compositeScore <= -40 → -10点
} as const

// 10セクターの定義
export const SECTORS = [
  "半導体・電子部品",
  "自動車",
  "金融",
  "医薬品",
  "IT・サービス",
  "エネルギー",
  "通信",
  "小売",
  "不動産",
  "素材",
] as const
```

**Step 2: コミット**

```bash
git add lib/constants.ts
git commit -m "feat: セクタートレンド定数を追加"
```

---

## Task 3: セクタートレンド共通ユーティリティ

**Files:**
- Create: `lib/sector-trend.ts`

**Step 1: ユーティリティファイルを作成**

```typescript
/**
 * セクタートレンド取得・フォーマットユーティリティ
 */

import { prisma } from "@/lib/prisma"
import { getTodayForDB } from "@/lib/date-utils"
import { SECTOR_TREND } from "@/lib/constants"

export interface SectorTrendData {
  sector: string
  score3d: number
  score7d: number
  newsCount3d: number
  newsCount7d: number
  positive3d: number
  negative3d: number
  neutral3d: number
  positive7d: number
  negative7d: number
  neutral7d: number
  usNewsCount3d: number
  usNewsCount7d: number
  avgWeekChangeRate: number | null
  avgDailyChangeRate: number | null
  avgMaDeviationRate: number | null
  avgVolumeRatio: number | null
  avgVolatility: number | null
  stockCount: number
  compositeScore: number | null
  trendDirection: string
}

/**
 * 特定セクターのトレンドを取得
 */
export async function getSectorTrend(sector: string): Promise<SectorTrendData | null> {
  const today = getTodayForDB()
  const trend = await prisma.sectorTrend.findUnique({
    where: { date_sector: { date: today, sector } },
  })
  return trend
}

/**
 * 全セクターのトレンドを取得（ダッシュボード用）
 */
export async function getAllSectorTrends(): Promise<SectorTrendData[]> {
  const today = getTodayForDB()
  const trends = await prisma.sectorTrend.findMany({
    where: { date: today },
    orderBy: { compositeScore: "desc" },
  })
  return trends
}

/**
 * トレンド方向の矢印を取得
 */
function getTrendArrow(direction: string): string {
  if (direction === "up") return "▲"
  if (direction === "down") return "▼"
  return "▶"
}

/**
 * トレンド強度のラベルを取得
 */
function getTrendLabel(score: number | null): string {
  if (score === null) return "データ不足"
  if (score >= SECTOR_TREND.STRONG_UP_THRESHOLD) return "強い追い風"
  if (score >= SECTOR_TREND.UP_THRESHOLD) return "追い風"
  if (score <= SECTOR_TREND.STRONG_DOWN_THRESHOLD) return "強い逆風"
  if (score <= SECTOR_TREND.DOWN_THRESHOLD) return "逆風"
  return "中立"
}

/**
 * 特定セクターのトレンドをAIプロンプト用テキストに変換
 */
export function formatSectorTrendForPrompt(trend: SectorTrendData): string {
  const arrow = getTrendArrow(trend.trendDirection)
  const score = trend.compositeScore ?? trend.score3d
  const label = getTrendLabel(trend.compositeScore)
  const usNote = trend.usNewsCount3d > 0
    ? ` / 米国関連ニュース${trend.usNewsCount3d}件`
    : ""
  const priceNote = trend.avgWeekChangeRate !== null
    ? ` / セクター平均週間${trend.avgWeekChangeRate >= 0 ? "+" : ""}${trend.avgWeekChangeRate.toFixed(1)}%`
    : ""
  const volumeNote = trend.avgVolumeRatio !== null
    ? `、出来高${trend.avgVolumeRatio.toFixed(1)}倍`
    : ""

  return `【${trend.sector}】${arrow} ${label}（総合スコア${score >= 0 ? "+" : ""}${score.toFixed(0)}）
  ニュース: ポジティブ${trend.positive3d}件/${trend.newsCount3d}件（スコア${trend.score3d >= 0 ? "+" : ""}${trend.score3d.toFixed(0)}）${usNote}
  株価: ${priceNote ? priceNote.replace(" / ", "") : "データなし"}${volumeNote}`
}

/**
 * 全セクタートレンドをAIプロンプト用テキストに変換（おすすめ生成用）
 */
export function formatAllSectorTrendsForPrompt(trends: SectorTrendData[]): string {
  if (trends.length === 0) return ""

  const lines = trends.map(formatSectorTrendForPrompt)
  return `
## 市場セクター動向
以下は直近のセクター別トレンド（ニュース + 株価統合）です。銘柄選定の参考にしてください。
${lines.join("\n")}
`
}

/**
 * おすすめスコアリング用のセクターボーナスを計算
 */
export function getSectorScoreBonus(trend: SectorTrendData | null): number {
  if (!trend) return 0
  const score = trend.compositeScore ?? trend.score3d

  if (score >= SECTOR_TREND.STRONG_UP_THRESHOLD) return SECTOR_TREND.STRONG_UP_BONUS
  if (score >= SECTOR_TREND.UP_THRESHOLD) return SECTOR_TREND.UP_BONUS
  if (score <= SECTOR_TREND.STRONG_DOWN_THRESHOLD) return SECTOR_TREND.STRONG_DOWN_PENALTY
  if (score <= SECTOR_TREND.DOWN_THRESHOLD) return SECTOR_TREND.DOWN_PENALTY
  return 0
}
```

**Step 2: コミット**

```bash
git add lib/sector-trend.ts
git commit -m "feat: セクタートレンド共通ユーティリティを追加"
```

---

## Task 4: セクタートレンド計算スクリプト

**Files:**
- Create: `scripts/news/calculate-sector-trends.ts`

**Step 1: 計算スクリプトを作成**

`scripts/news/fetch-news.ts` と同じパターンで作成。ニュース集計 + 株価モメンタム集計 → compositeScore算出。

```typescript
#!/usr/bin/env npx tsx
/**
 * セクタートレンド計算スクリプト
 *
 * 1. MarketNewsテーブルから直近7日分のニュースを集計（センチメント×セクター）
 * 2. Stockテーブルからセクター別の株価指標を集計（平均weekChangeRate等）
 * 3. US→JP連動: USニュースのセンチメントを対応するJPセクターに合算（×0.7減衰）
 * 4. compositeScore = newsScore × 0.4 + priceScore × 0.4 + volumeScore × 0.2
 * 5. SectorTrendテーブルにUPSERT
 *
 * 実行タイミング: stock-predictions.yml の stock-predictions ジョブの後
 */

import { PrismaClient, Prisma } from "@prisma/client"
import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"

dayjs.extend(utc)
dayjs.extend(timezone)

const prisma = new PrismaClient()
const JST = "Asia/Tokyo"

// US→JPセクターマッピング（lib/news.tsと同じ）
const US_TO_JP_SECTOR_MAP: Record<string, string[]> = {
  "半導体・電子部品": ["半導体・電子部品", "Technology", "Semiconductor"],
  自動車: ["自動車", "Automotive", "EV"],
  金融: ["金融", "Financial", "Banking"],
  医薬品: ["医薬品", "Healthcare", "Pharma"],
  "IT・サービス": ["IT・サービス", "Technology", "Software"],
  エネルギー: ["エネルギー", "Energy"],
  通信: ["通信", "Telecom"],
  小売: ["小売", "Retail"],
  不動産: ["不動産", "Real Estate"],
  素材: ["素材", "Materials"],
}

const JP_SECTORS = Object.keys(US_TO_JP_SECTOR_MAP)

// 定数（lib/constants.tsと同値 - スクリプトはスタンドアロン実行のため直接定義）
const US_INFLUENCE_WEIGHT = 0.7
const NEWS_WEIGHT = 0.4
const PRICE_WEIGHT = 0.4
const VOLUME_WEIGHT = 0.2
const PRICE_CLAMP = 10  // weekChangeRate のキャップ（±%）
const VOLUME_CLAMP = 1  // volumeRatio - 1.0 のキャップ（±）
const UP_THRESHOLD = 20
const DOWN_THRESHOLD = -20

interface NewsSectorStats {
  positive: number
  negative: number
  neutral: number
  total: number
  usCount: number
}

interface PriceSectorStats {
  avgWeekChangeRate: number | null
  avgDailyChangeRate: number | null
  avgMaDeviationRate: number | null
  avgVolumeRatio: number | null
  avgVolatility: number | null
  stockCount: number
}

/**
 * USセクターをJPセクターにマッピング
 */
function mapToJPSector(usSector: string): string | null {
  for (const [jpSector, aliases] of Object.entries(US_TO_JP_SECTOR_MAP)) {
    if (aliases.some((alias) => usSector.toLowerCase().includes(alias.toLowerCase()))) {
      return jpSector
    }
  }
  return null
}

/**
 * ニューススコアを計算
 * score = ((positive - negative) / total) × 100 × log2(total + 1)
 */
function calculateNewsScore(stats: NewsSectorStats): number {
  if (stats.total === 0) return 0
  const sentimentRatio = (stats.positive - stats.negative) / stats.total
  const volumeWeight = Math.log2(stats.total + 1)
  return Math.round(sentimentRatio * 100 * volumeWeight * 100) / 100
}

/**
 * 株価モメンタムスコアを計算
 * priceScore = clamp(avgWeekChangeRate, -PRICE_CLAMP, +PRICE_CLAMP) × (100/PRICE_CLAMP)
 */
function calculatePriceScore(avgWeekChangeRate: number | null): number {
  if (avgWeekChangeRate === null) return 0
  const clamped = Math.max(-PRICE_CLAMP, Math.min(PRICE_CLAMP, avgWeekChangeRate))
  return clamped * (100 / PRICE_CLAMP)  // -100 〜 +100
}

/**
 * 出来高スコアを計算
 * volumeScore = clamp(avgVolumeRatio - 1.0, -VOLUME_CLAMP, +VOLUME_CLAMP) × 100
 */
function calculateVolumeScore(avgVolumeRatio: number | null): number {
  if (avgVolumeRatio === null) return 0
  const diff = avgVolumeRatio - 1.0
  const clamped = Math.max(-VOLUME_CLAMP, Math.min(VOLUME_CLAMP, diff))
  return clamped * 100  // -100 〜 +100
}

/**
 * 総合スコアを計算
 * compositeScore = newsScore × 0.4 + priceScore × 0.4 + volumeScore × 0.2
 */
function calculateCompositeScore(
  newsScore: number,
  priceScore: number,
  volumeScore: number
): number {
  return Math.round(
    (newsScore * NEWS_WEIGHT + priceScore * PRICE_WEIGHT + volumeScore * VOLUME_WEIGHT) * 100
  ) / 100
}

/**
 * トレンド方向を判定（compositeScoreベース）
 */
function determineTrendDirection(compositeScore: number | null, newsScore: number): string {
  const score = compositeScore ?? newsScore
  if (score >= UP_THRESHOLD) return "up"
  if (score <= DOWN_THRESHOLD) return "down"
  return "neutral"
}

async function main() {
  console.log("📊 セクタートレンド計算を開始...")

  const today = dayjs().tz(JST).startOf("day").utc().toDate()
  const threeDaysAgo = dayjs().tz(JST).subtract(3, "day").startOf("day").utc().toDate()
  const sevenDaysAgo = dayjs().tz(JST).subtract(7, "day").startOf("day").utc().toDate()

  // ===== 1. ニュース集計 =====
  const allNews = await prisma.marketNews.findMany({
    where: {
      publishedAt: { gte: sevenDaysAgo },
      sector: { not: null },
    },
    select: {
      sector: true,
      sentiment: true,
      market: true,
      publishedAt: true,
    },
  })

  console.log(`  ニュース取得: ${allNews.length}件`)

  // セクター × 期間で集計
  const newsStats3d: Record<string, NewsSectorStats> = {}
  const newsStats7d: Record<string, NewsSectorStats> = {}

  for (const sector of JP_SECTORS) {
    newsStats3d[sector] = { positive: 0, negative: 0, neutral: 0, total: 0, usCount: 0 }
    newsStats7d[sector] = { positive: 0, negative: 0, neutral: 0, total: 0, usCount: 0 }
  }

  for (const news of allNews) {
    if (!news.sector) continue

    const isUS = news.market === "US"
    const isWithin3d = news.publishedAt >= threeDaysAgo

    // JPセクターにマッピング
    let jpSector: string | null = null
    if (isUS) {
      jpSector = mapToJPSector(news.sector)
      if (!jpSector) continue
    } else {
      jpSector = JP_SECTORS.includes(news.sector) ? news.sector : null
      if (!jpSector) continue
    }

    // センチメントの重み（USは0.7倍）
    const weight = isUS ? US_INFLUENCE_WEIGHT : 1

    // 7日窓に加算
    if (news.sentiment === "positive") {
      newsStats7d[jpSector].positive += weight
    } else if (news.sentiment === "negative") {
      newsStats7d[jpSector].negative += weight
    } else {
      newsStats7d[jpSector].neutral += weight
    }
    newsStats7d[jpSector].total += weight
    if (isUS) newsStats7d[jpSector].usCount++

    // 3日窓に加算
    if (isWithin3d) {
      if (news.sentiment === "positive") {
        newsStats3d[jpSector].positive += weight
      } else if (news.sentiment === "negative") {
        newsStats3d[jpSector].negative += weight
      } else {
        newsStats3d[jpSector].neutral += weight
      }
      newsStats3d[jpSector].total += weight
      if (isUS) newsStats3d[jpSector].usCount++
    }
  }

  // ===== 2. 株価モメンタム集計 =====
  // セクター別の株価指標を1クエリで集計
  const priceStats: Record<string, PriceSectorStats> = {}

  const sectorAggregations = await prisma.stock.groupBy({
    by: ["sector"],
    where: {
      sector: { in: JP_SECTORS },
      isDelisted: false,
      weekChangeRate: { not: null },
    },
    _avg: {
      weekChangeRate: true,
      dailyChangeRate: true,
      maDeviationRate: true,
      volumeRatio: true,
      volatility: true,
    },
    _count: {
      id: true,
    },
  })

  for (const sector of JP_SECTORS) {
    priceStats[sector] = {
      avgWeekChangeRate: null,
      avgDailyChangeRate: null,
      avgMaDeviationRate: null,
      avgVolumeRatio: null,
      avgVolatility: null,
      stockCount: 0,
    }
  }

  for (const agg of sectorAggregations) {
    if (!agg.sector) continue
    priceStats[agg.sector] = {
      avgWeekChangeRate: agg._avg.weekChangeRate ? Number(agg._avg.weekChangeRate) : null,
      avgDailyChangeRate: agg._avg.dailyChangeRate ? Number(agg._avg.dailyChangeRate) : null,
      avgMaDeviationRate: agg._avg.maDeviationRate ? Number(agg._avg.maDeviationRate) : null,
      avgVolumeRatio: agg._avg.volumeRatio ? Number(agg._avg.volumeRatio) : null,
      avgVolatility: agg._avg.volatility ? Number(agg._avg.volatility) : null,
      stockCount: agg._count.id,
    }
  }

  console.log(`  株価集計: ${sectorAggregations.length}セクター`)

  // ===== 3. 総合スコア計算 & DB保存 =====
  const upsertPromises = JP_SECTORS.map((sector) => {
    const n3 = newsStats3d[sector]
    const n7 = newsStats7d[sector]
    const p = priceStats[sector]

    const newsScore3d = calculateNewsScore(n3)
    const newsScore7d = calculateNewsScore(n7)
    const priceScore = calculatePriceScore(p.avgWeekChangeRate)
    const volumeScore = calculateVolumeScore(p.avgVolumeRatio)
    const compositeScore = calculateCompositeScore(newsScore3d, priceScore, volumeScore)
    const trendDirection = determineTrendDirection(compositeScore, newsScore3d)

    console.log(
      `  ${sector}: composite=${compositeScore.toFixed(1)} (news=${newsScore3d.toFixed(1)}, price=${priceScore.toFixed(1)}, vol=${volumeScore.toFixed(1)}) / 銘柄${p.stockCount}件 → ${trendDirection}`
    )

    const data = {
      score3d: newsScore3d,
      newsCount3d: Math.round(n3.total),
      positive3d: Math.round(n3.positive),
      negative3d: Math.round(n3.negative),
      neutral3d: Math.round(n3.neutral),
      score7d: newsScore7d,
      newsCount7d: Math.round(n7.total),
      positive7d: Math.round(n7.positive),
      negative7d: Math.round(n7.negative),
      neutral7d: Math.round(n7.neutral),
      usNewsCount3d: n3.usCount,
      usNewsCount7d: n7.usCount,
      avgWeekChangeRate: p.avgWeekChangeRate,
      avgDailyChangeRate: p.avgDailyChangeRate,
      avgMaDeviationRate: p.avgMaDeviationRate,
      avgVolumeRatio: p.avgVolumeRatio,
      avgVolatility: p.avgVolatility,
      stockCount: p.stockCount,
      compositeScore,
      trendDirection,
    }

    return prisma.sectorTrend.upsert({
      where: { date_sector: { date: today, sector } },
      create: { date: today, sector, ...data },
      update: data,
    })
  })

  await Promise.all(upsertPromises)

  console.log(`✅ セクタートレンド計算完了（${JP_SECTORS.length}セクター）`)
}

main()
  .catch((error) => {
    console.error("❌ セクタートレンド計算エラー:", error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
```

**Step 2: コミット**

```bash
git add scripts/news/calculate-sector-trends.ts
git commit -m "feat: セクタートレンド計算スクリプトを追加（ニュース+株価統合）"
```

---

## Task 5: GitHub Actionsワークフロー更新

**Files:**
- Modify: `.github/workflows/stock-predictions.yml`

**変更概要:**
- `stock-predictions` の後、`purchase-recommendations` / `portfolio-analysis` の前に `calculate-sector-trends` ジョブを挿入
- `purchase-recommendations` と `portfolio-analysis` の `needs` を `calculate-sector-trends` に変更

**Step 1: calculate-sector-trends ジョブを追加**

`.github/workflows/stock-predictions.yml` の `stock-predictions` ジョブ（70行目 `run: npx tsx scripts/analysis/generate-stock-predictions.ts`）の後、`purchase-recommendations` ジョブ（72行目）の前に追加:

```yaml
  calculate-sector-trends:
    needs: stock-predictions
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Calculate sector trends
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
        run: npx tsx scripts/news/calculate-sector-trends.ts
```

**Step 2: purchase-recommendations の needs を変更**

```yaml
  purchase-recommendations:
    needs: calculate-sector-trends  # 変更: stock-predictions → calculate-sector-trends
```

**Step 3: portfolio-analysis の needs を変更**

```yaml
  portfolio-analysis:
    needs: calculate-sector-trends  # 変更: stock-predictions → calculate-sector-trends
```

**Step 4: gainers-losers / portfolio-snapshots の needs も更新**

```yaml
  gainers-losers:
    needs: [determine-time, calculate-sector-trends]  # 変更: stock-predictions → calculate-sector-trends
```

```yaml
  portfolio-snapshots:
    needs: [determine-time, calculate-sector-trends]  # 変更: stock-predictions → calculate-sector-trends
```

**Step 5: notify の needs に calculate-sector-trends を追加**

```yaml
  notify:
    needs: [calculate-sector-trends, purchase-recommendations, portfolio-analysis, portfolio-overall, gainers-losers, portfolio-snapshots]
```

**Step 6: コミット**

```bash
git add .github/workflows/stock-predictions.yml
git commit -m "feat: stock-predictions後にセクタートレンド計算ジョブを追加"
```

---

## Task 6: セクタートレンドAPI

**Files:**
- Create: `app/api/sector-trends/route.ts`

**Step 1: APIルートを作成**

```typescript
import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { getAllSectorTrends } from "@/lib/sector-trend"

/**
 * GET /api/sector-trends
 * 当日のセクタートレンドを全セクター分取得
 */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const trends = await getAllSectorTrends()
  return NextResponse.json(trends)
}
```

**Step 2: コミット**

```bash
git add app/api/sector-trends/route.ts
git commit -m "feat: セクタートレンドAPIを追加"
```

---

## Task 7: ダッシュボード - ヒートマップコンポーネント

**Files:**
- Create: `app/dashboard/SectorTrendSkeleton.tsx`
- Create: `app/dashboard/SectorTrendHeatmap.tsx`
- Modify: `app/dashboard/page.tsx:193` (ポートフォリオ構成グラフの後)

**Step 1: スケルトンコンポーネント作成**

`app/dashboard/SectorTrendSkeleton.tsx`:

```typescript
export function SectorTrendSkeleton() {
  return (
    <div className="mt-4 sm:mt-6">
      <div className="flex items-center justify-between mb-3">
        <div className="h-5 w-40 bg-muted animate-pulse rounded" />
        <div className="h-8 w-24 bg-muted animate-pulse rounded" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {[...Array(10)].map((_, i) => (
          <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
        ))}
      </div>
    </div>
  )
}
```

**Step 2: ヒートマップコンポーネント作成**

`app/dashboard/SectorTrendHeatmap.tsx`:

```typescript
"use client"

import { useState, useEffect } from "react"
import { SectorTrendSkeleton } from "./SectorTrendSkeleton"

interface SectorTrend {
  sector: string
  score3d: number
  score7d: number
  newsCount3d: number
  newsCount7d: number
  positive3d: number
  negative3d: number
  positive7d: number
  negative7d: number
  usNewsCount3d: number
  usNewsCount7d: number
  avgWeekChangeRate: number | null
  avgVolumeRatio: number | null
  compositeScore: number | null
  trendDirection: string
}

type TimeWindow = "3d" | "7d"

function getTrendColor(score: number): string {
  if (score >= 40) return "bg-green-200 text-green-800"
  if (score >= 20) return "bg-green-50 text-green-700"
  if (score <= -40) return "bg-red-200 text-red-800"
  if (score <= -20) return "bg-red-50 text-red-700"
  return "bg-muted text-muted-foreground"
}

function getTrendArrow(score: number): string {
  if (score >= 20) return "▲"
  if (score <= -20) return "▼"
  return "▶"
}

export function SectorTrendHeatmap() {
  const [trends, setTrends] = useState<SectorTrend[]>([])
  const [loading, setLoading] = useState(true)
  const [window, setWindow] = useState<TimeWindow>("3d")

  useEffect(() => {
    async function fetchTrends() {
      try {
        const res = await fetch("/api/sector-trends")
        if (res.ok) {
          const data = await res.json()
          setTrends(data)
        }
      } catch (error) {
        console.error("セクタートレンド取得エラー:", error)
      } finally {
        setLoading(false)
      }
    }
    fetchTrends()
  }, [])

  if (loading) return <SectorTrendSkeleton />
  if (trends.length === 0) return null

  return (
    <div className="mt-4 sm:mt-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-foreground">セクタートレンド</h2>
        <div className="flex rounded-lg border overflow-hidden text-xs">
          <button
            onClick={() => setWindow("3d")}
            className={`px-3 py-1 transition-colors ${
              window === "3d"
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-muted"
            }`}
          >
            3日
          </button>
          <button
            onClick={() => setWindow("7d")}
            className={`px-3 py-1 transition-colors ${
              window === "7d"
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-muted"
            }`}
          >
            7日
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {trends.map((trend) => {
          // 3dの場合はcompositeScore、7dの場合はnewsScore7d（compositeは3dベース）
          const score = window === "3d"
            ? (trend.compositeScore ?? trend.score3d)
            : trend.score7d
          const newsCount = window === "3d" ? trend.newsCount3d : trend.newsCount7d
          const usCount = window === "3d" ? trend.usNewsCount3d : trend.usNewsCount7d
          const colorClass = getTrendColor(score)
          const arrow = getTrendArrow(score)

          return (
            <div
              key={trend.sector}
              className={`rounded-lg p-2.5 ${colorClass} transition-colors`}
            >
              <div className="text-xs font-medium truncate">{trend.sector}</div>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-sm font-bold">{arrow}</span>
                <span className="text-sm font-bold">
                  {score >= 0 ? "+" : ""}{score.toFixed(0)}
                </span>
              </div>
              {window === "3d" && trend.compositeScore !== null && (
                <div className="flex items-center gap-1.5 mt-0.5 text-[10px] opacity-70">
                  <span>📰{trend.score3d >= 0 ? "+" : ""}{trend.score3d.toFixed(0)}</span>
                  {trend.avgWeekChangeRate !== null && (
                    <span>📈{trend.avgWeekChangeRate >= 0 ? "+" : ""}{trend.avgWeekChangeRate.toFixed(1)}%</span>
                  )}
                </div>
              )}
              <div className="flex items-center gap-1 mt-0.5 text-[10px] opacity-70">
                <span>{newsCount}件</span>
                {usCount > 0 && <span>🇺🇸{usCount}</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

**Step 3: ダッシュボードに組み込み**

`app/dashboard/page.tsx` の192行目（`PortfolioCompositionChart` の `</div>` の後、194行目の `{/* 今日の注目銘柄 */}` の前）に追加:

```tsx
          {/* セクタートレンド */}
          <SectorTrendHeatmap />
```

importも追加（ファイル先頭のimport群に）:
```tsx
import { SectorTrendHeatmap } from "./SectorTrendHeatmap"
```

**Step 4: コミット**

```bash
git add app/dashboard/SectorTrendSkeleton.tsx app/dashboard/SectorTrendHeatmap.tsx app/dashboard/page.tsx
git commit -m "feat: ダッシュボードにセクタートレンドヒートマップを追加"
```

---

## Task 8: おすすめ銘柄スコアリングへのセクターボーナス統合

**Files:**
- Modify: `lib/recommendation-scoring.ts:133` (calculateStockScores関数シグネチャ) + `214` (MA乖離率ボーナスの後)
- Modify: `app/api/recommendations/generate-daily/route.ts:318` (calculateStockScores呼び出し) + `561` (AIプロンプト)

**Step 1: スコアリング関数にセクタートレンド引数を追加**

`lib/recommendation-scoring.ts`:

import追加（7行目の `import { MA_DEVIATION } from "@/lib/constants"` の後）:
```typescript
import { SECTOR_TREND } from "@/lib/constants"
import { getSectorScoreBonus, type SectorTrendData } from "@/lib/sector-trend"
```

関数シグネチャ変更（133行目）:
```typescript
export function calculateStockScores(
  stocks: StockForScoring[],
  period: string | null,
  risk: string | null,
  sectorTrends?: Record<string, SectorTrendData>
): ScoredStock[] {
```

214行目の `}` の後（MA乖離率のif文の閉じ括弧の後、216行目 `scoredStocks.push({` の前）に追加:

```typescript
    // セクタートレンドによるボーナス/ペナルティ
    if (sectorTrends && stock.sector && sectorTrends[stock.sector]) {
      const bonus = getSectorScoreBonus(sectorTrends[stock.sector])
      if (bonus !== 0) {
        totalScore += bonus
        scoreBreakdown["sectorTrendBonus"] = bonus
      }
    }
```

**Step 2: generate-daily/route.ts でセクタートレンドを取得してスコアリングとAIプロンプトに渡す**

`app/api/recommendations/generate-daily/route.ts`:

import追加（23行目 `import { getRelatedNews, formatNewsForPrompt } from "@/lib/news-rag"` の後）:
```typescript
import { getAllSectorTrends, formatAllSectorTrendsForPrompt, type SectorTrendData } from "@/lib/sector-trend"
```

ユーザー処理の前（ルート関数の先頭付近、全ユーザー共通データ取得エリア）にセクタートレンドを一括取得:
```typescript
// セクタートレンドを一括取得（全ユーザー共通）
const sectorTrends = await getAllSectorTrends()
const sectorTrendMap: Record<string, SectorTrendData> = {}
for (const t of sectorTrends) {
  sectorTrendMap[t.sector] = t
}
const sectorTrendContext = formatAllSectorTrendsForPrompt(sectorTrends)
```

318行目の `calculateStockScores` 呼び出しに `sectorTrendMap` を追加:
```typescript
const scored = calculateStockScores(filtered, investmentPeriod, riskTolerance, sectorTrendMap)
```

AIプロンプト（561行目 `${marketContext}` の後、562行目 `【選べる銘柄一覧` の前）に追加:
```
${marketContext}${sectorTrendContext}
【選べる銘柄一覧（詳細分析付き）】
```

**Step 3: コミット**

```bash
git add lib/recommendation-scoring.ts app/api/recommendations/generate-daily/route.ts
git commit -m "feat: おすすめスコアリングにセクタートレンドボーナスを統合"
```

---

## Task 9: 購入判断への統合

**Files:**
- Modify: `app/api/stocks/[stockId]/purchase-recommendation/route.ts:312` (marketContext取得の後)

**Step 1: セクタートレンドコンテキストを追加**

import追加（ファイル先頭のimport群に）:
```typescript
import { getSectorTrend, formatSectorTrendForPrompt } from "@/lib/sector-trend"
```

312行目 `const marketContext = buildMarketContext(marketData)` の後に追加:
```typescript
    // セクタートレンド
    let sectorTrendContext = ""
    if (stock.sector) {
      const sectorTrend = await getSectorTrend(stock.sector)
      if (sectorTrend) {
        sectorTrendContext = `\n【セクタートレンド】\n${formatSectorTrendForPrompt(sectorTrend)}\n`
      }
    }
```

プロンプト内（361行目付近）の `${marketContext}` の後に `${sectorTrendContext}` を追加:
```
${delistingContext}${weekChangeContext}${marketContext}${sectorTrendContext}${patternContext}...
```

**Step 2: コミット**

```bash
git add app/api/stocks/[stockId]/purchase-recommendation/route.ts
git commit -m "feat: 購入判断にセクタートレンドコンテキストを追加"
```

---

## Task 10: ポートフォリオ分析への統合

**Files:**
- Modify: `app/api/stocks/[stockId]/portfolio-analysis/route.ts:316` (marketContext取得の後)

**Step 1: セクタートレンドコンテキストを追加**

import追加（ファイル先頭のimport群に）:
```typescript
import { getSectorTrend, formatSectorTrendForPrompt } from "@/lib/sector-trend"
```

316行目 `const marketContext = buildMarketContext(marketData)` の後に追加:
```typescript
    // セクタートレンド
    let sectorTrendContext = ""
    if (stock.sector) {
      const sectorTrend = await getSectorTrend(stock.sector)
      if (sectorTrend) {
        sectorTrendContext = `\n【セクタートレンド】\n${formatSectorTrendForPrompt(sectorTrend)}\n`
      }
    }
```

プロンプト内（343行目付近）の `${marketContext}` の後に `${sectorTrendContext}` を追加:
```
${newsContext}${marketContext}${sectorTrendContext}
```

**Step 2: コミット**

```bash
git add app/api/stocks/[stockId]/portfolio-analysis/route.ts
git commit -m "feat: ポートフォリオ分析にセクタートレンドコンテキストを追加"
```

---

## Task 11: ビルド確認 & PR作成

**Step 1: ビルド確認**

Run: `npx prisma generate && npx next build`
Expected: ビルド成功（warningのみ、errorなし）

**Step 2: 動作確認**

ローカルで `npm run dev` して:
1. ダッシュボードにセクタートレンドヒートマップが表示されること
2. 3日/7日の切り替えが動作すること
3. `/api/sector-trends` がデータを返すこと

**Step 3: Linearタスク作成 & PR作成**

Linearにタスクを作成し、featureブランチでPRを作成する。PR本文に `Fixes KOH-XX` を記載。
