# セクタートレンド分析機能 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** ニュースデータからセクター別トレンドを分析し、おすすめ・購入判断・ポートフォリオ分析・ダッシュボードに統合する。

**Architecture:** ニュース取得後にセクター×センチメントを集計してSectorTrendテーブルに保存。各分析APIとダッシュボードから参照する。US→JP連動は既存セクターマッピングで合算。

**Tech Stack:** Next.js, Prisma, TypeScript, Recharts, OpenAI (gpt-4o-mini), GitHub Actions

---

## Task 1: Prismaスキーマ - SectorTrendモデル追加

**Files:**
- Modify: `prisma/schema.prisma:191` (MarketNewsモデルの直後)

**Step 1: スキーマにSectorTrendモデルを追加**

`prisma/schema.prisma` の MarketNews モデル（191行目 `}` の後）に追加:

```prisma
// セクタートレンド分析（ニュースベース）
model SectorTrend {
  id        String   @id @default(cuid())
  date      DateTime @db.Date
  sector    String

  // 3日窓（短期の勢い）
  score3d       Float
  newsCount3d   Int
  positive3d    Int
  negative3d    Int
  neutral3d     Int

  // 7日窓（中期トレンド）
  score7d       Float
  newsCount7d   Int
  positive7d    Int
  negative7d    Int
  neutral7d     Int

  // US→JP連動
  usNewsCount3d Int   @default(0)
  usNewsCount7d Int   @default(0)

  // メタ
  trendDirection String  // "up" | "down" | "neutral"
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
- Modify: `lib/constants.ts:192` (SELL_TIMING定数の後)

**Step 1: セクタートレンド定数を追加**

`lib/constants.ts` の末尾（193行目の後）に追加:

```typescript
// セクタートレンド分析の閾値
export const SECTOR_TREND = {
  UP_THRESHOLD: 20,           // score3d >= 20 → "up"
  DOWN_THRESHOLD: -20,        // score3d <= -20 → "down"
  US_INFLUENCE_WEIGHT: 0.7,   // US→JPの影響度係数
  STRONG_UP_THRESHOLD: 40,    // 強い追い風の閾値
  STRONG_DOWN_THRESHOLD: -40, // 強い逆風の閾値
  // おすすめスコアリングへのボーナス/ペナルティ
  STRONG_UP_BONUS: 15,        // score3d >= 40 → +15点
  UP_BONUS: 10,               // score3d >= 20 → +10点
  DOWN_PENALTY: -5,           // score3d <= -20 → -5点
  STRONG_DOWN_PENALTY: -10,   // score3d <= -40 → -10点
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
    orderBy: { score3d: "desc" },
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
function getTrendLabel(score: number): string {
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
  const label = getTrendLabel(trend.score3d)
  const usNote = trend.usNewsCount3d > 0
    ? ` / 米国関連ニュース${trend.usNewsCount3d}件`
    : ""

  return `【${trend.sector}】${arrow} ${label}（スコア${trend.score3d >= 0 ? "+" : ""}${trend.score3d.toFixed(0)}、ニュース${trend.newsCount3d}件中ポジティブ${trend.positive3d}件${usNote}）`
}

/**
 * 全セクタートレンドをAIプロンプト用テキストに変換（おすすめ生成用）
 */
export function formatAllSectorTrendsForPrompt(trends: SectorTrendData[]): string {
  if (trends.length === 0) return ""

  const lines = trends.map(formatSectorTrendForPrompt)
  return `
## 市場セクター動向
以下は直近のセクター別ニューストレンドです。銘柄選定の参考にしてください。
${lines.join("\n")}
`
}

/**
 * おすすめスコアリング用のセクターボーナスを計算
 */
export function getSectorScoreBonus(trend: SectorTrendData | null): number {
  if (!trend) return 0
  const score = trend.score3d

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

`scripts/news/fetch-news.ts` と同じパターンで作成。

```typescript
#!/usr/bin/env npx tsx
/**
 * セクタートレンド計算スクリプト
 *
 * MarketNewsテーブルから直近7日分のニュースを集計し、
 * セクター別のトレンドスコアを計算してSectorTrendテーブルに保存する。
 *
 * US→JP連動: USニュースのセンチメントを対応するJPセクターに合算（×0.7減衰）
 */

import { PrismaClient } from "@prisma/client"
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

const US_INFLUENCE_WEIGHT = 0.7
const UP_THRESHOLD = 20
const DOWN_THRESHOLD = -20

interface SectorStats {
  positive: number
  negative: number
  neutral: number
  total: number
  usCount: number
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
 * スコアを計算
 * score = ((positive - negative) / total) × 100 × log2(total + 1)
 */
function calculateScore(stats: SectorStats): number {
  if (stats.total === 0) return 0
  const sentimentRatio = (stats.positive - stats.negative) / stats.total
  const volumeWeight = Math.log2(stats.total + 1)
  return Math.round(sentimentRatio * 100 * volumeWeight * 100) / 100
}

/**
 * トレンド方向を判定
 */
function determineTrendDirection(score3d: number): string {
  if (score3d >= UP_THRESHOLD) return "up"
  if (score3d <= DOWN_THRESHOLD) return "down"
  return "neutral"
}

async function main() {
  console.log("📊 セクタートレンド計算を開始...")

  const today = dayjs().tz(JST).startOf("day").utc().toDate()
  const threeDaysAgo = dayjs().tz(JST).subtract(3, "day").startOf("day").utc().toDate()
  const sevenDaysAgo = dayjs().tz(JST).subtract(7, "day").startOf("day").utc().toDate()

  // 直近7日分のニュースを一括取得
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

  console.log(`  取得ニュース数: ${allNews.length}件`)

  // セクター × 期間で集計
  const stats3d: Record<string, SectorStats> = {}
  const stats7d: Record<string, SectorStats> = {}

  // 初期化
  for (const sector of JP_SECTORS) {
    stats3d[sector] = { positive: 0, negative: 0, neutral: 0, total: 0, usCount: 0 }
    stats7d[sector] = { positive: 0, negative: 0, neutral: 0, total: 0, usCount: 0 }
  }

  for (const news of allNews) {
    if (!news.sector) continue

    const isUS = news.market === "US"
    const isWithin3d = news.publishedAt >= threeDaysAgo

    // JPセクターにマッピング
    let jpSector: string | null = null
    if (isUS) {
      jpSector = mapToJPSector(news.sector)
      if (!jpSector) continue // マッピングできないUSニュースはスキップ
    } else {
      jpSector = JP_SECTORS.includes(news.sector) ? news.sector : null
      if (!jpSector) continue
    }

    // センチメントの重みを計算（USは0.7倍）
    const weight = isUS ? US_INFLUENCE_WEIGHT : 1

    // 7日窓に加算
    if (news.sentiment === "positive") {
      stats7d[jpSector].positive += weight
    } else if (news.sentiment === "negative") {
      stats7d[jpSector].negative += weight
    } else {
      stats7d[jpSector].neutral += weight
    }
    stats7d[jpSector].total += weight
    if (isUS) stats7d[jpSector].usCount++

    // 3日窓に加算
    if (isWithin3d) {
      if (news.sentiment === "positive") {
        stats3d[jpSector].positive += weight
      } else if (news.sentiment === "negative") {
        stats3d[jpSector].negative += weight
      } else {
        stats3d[jpSector].neutral += weight
      }
      stats3d[jpSector].total += weight
      if (isUS) stats3d[jpSector].usCount++
    }
  }

  // スコア計算 & DB保存
  const upsertPromises = JP_SECTORS.map((sector) => {
    const s3 = stats3d[sector]
    const s7 = stats7d[sector]
    const score3d = calculateScore(s3)
    const score7d = calculateScore(s7)
    const trendDirection = determineTrendDirection(score3d)

    console.log(
      `  ${sector}: 3d=${score3d.toFixed(1)} (${s3.total.toFixed(0)}件) / 7d=${score7d.toFixed(1)} (${s7.total.toFixed(0)}件) → ${trendDirection}`
    )

    return prisma.sectorTrend.upsert({
      where: { date_sector: { date: today, sector } },
      create: {
        date: today,
        sector,
        score3d,
        newsCount3d: Math.round(s3.total),
        positive3d: Math.round(s3.positive),
        negative3d: Math.round(s3.negative),
        neutral3d: Math.round(s3.neutral),
        score7d,
        newsCount7d: Math.round(s7.total),
        positive7d: Math.round(s7.positive),
        negative7d: Math.round(s7.negative),
        neutral7d: Math.round(s7.neutral),
        usNewsCount3d: s3.usCount,
        usNewsCount7d: s7.usCount,
        trendDirection,
      },
      update: {
        score3d,
        newsCount3d: Math.round(s3.total),
        positive3d: Math.round(s3.positive),
        negative3d: Math.round(s3.negative),
        neutral3d: Math.round(s3.neutral),
        score7d,
        newsCount7d: Math.round(s7.total),
        positive7d: Math.round(s7.positive),
        negative7d: Math.round(s7.negative),
        neutral7d: Math.round(s7.neutral),
        usNewsCount3d: s3.usCount,
        usNewsCount7d: s7.usCount,
        trendDirection,
      },
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
git commit -m "feat: セクタートレンド計算スクリプトを追加"
```

---

## Task 5: GitHub Actionsワークフロー更新

**Files:**
- Modify: `.github/workflows/fetch-news.yml:89` (fetch-us-news jobの後)

**Step 1: calculate-sector-trends ジョブを追加**

`.github/workflows/fetch-news.yml` の `fetch-us-news` ジョブ（88行目）と `notify` ジョブ（90行目）の間に追加:

```yaml
  calculate-sector-trends:
    needs: [fetch-jp-news, fetch-us-news]
    if: always() && needs.fetch-jp-news.result == 'success'
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

**Step 2: notifyジョブのneedsを更新**

`notify` ジョブの `needs` を更新:

```yaml
  notify:
    needs: [fetch-jp-news, fetch-us-news, calculate-sector-trends]
    if: always()
```

成功判定も更新:

```yaml
      - name: Notify Slack on success
        if: needs.fetch-jp-news.result == 'success' && (needs.fetch-us-news.result == 'success' || needs.fetch-us-news.result == 'skipped') && (needs.calculate-sector-trends.result == 'success' || needs.calculate-sector-trends.result == 'skipped')
```

**Step 3: コミット**

```bash
git add .github/workflows/fetch-news.yml
git commit -m "feat: ニュース取得ワークフローにセクタートレンド計算を追加"
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
          <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />
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
          const score = window === "3d" ? trend.score3d : trend.score7d
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
- Modify: `lib/recommendation-scoring.ts:214` (MA乖離率ボーナスの後)
- Modify: `app/api/recommendations/generate-daily/route.ts` (スコアリング呼び出し部分とAIプロンプト)

**Step 1: スコアリング関数にセクタートレンド引数を追加**

`lib/recommendation-scoring.ts` の `calculateStockScores` 関数のシグネチャにセクタートレンドマップ引数を追加。

214行目の MA乖離率ボーナス/ペナルティの後（`}` の後、216行目 `scoredStocks.push({` の前）に追加:

```typescript
    // セクタートレンドによるボーナス/ペナルティ
    if (sectorTrends && stock.sector && sectorTrends[stock.sector]) {
      const trend = sectorTrends[stock.sector]
      const bonus = getSectorScoreBonus(trend)
      if (bonus !== 0) {
        totalScore += bonus
        scoreBreakdown["sectorTrendBonus"] = bonus
      }
    }
```

関数シグネチャの変更: `calculateStockScores` の引数に `sectorTrends?: Record<string, SectorTrendData>` を追加。

importに追加:
```typescript
import { SECTOR_TREND } from "@/lib/constants"
import { getSectorScoreBonus, SectorTrendData } from "@/lib/sector-trend"
```

**Step 2: generate-daily/route.ts でセクタートレンドを取得してスコアリングとAIプロンプトに渡す**

`app/api/recommendations/generate-daily/route.ts` にimport追加:
```typescript
import { getAllSectorTrends, formatAllSectorTrendsForPrompt, SectorTrendData } from "@/lib/sector-trend"
```

ユーザー処理の前にセクタートレンドを一括取得（全ユーザー共通なので1回だけ）:
```typescript
// セクタートレンドを一括取得
const sectorTrends = await getAllSectorTrends()
const sectorTrendMap: Record<string, SectorTrendData> = {}
for (const t of sectorTrends) {
  sectorTrendMap[t.sector] = t
}
const sectorTrendContext = formatAllSectorTrendsForPrompt(sectorTrends)
```

`calculateStockScores` 呼び出し時に `sectorTrendMap` を渡す。

AIプロンプト（553行目付近）の `${marketContext}` の後に `${sectorTrendContext}` を追加:

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

import追加:
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

プロンプト内の `${marketContext}` の後に `${sectorTrendContext}` を追加（361行目付近）:
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

import追加:
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

プロンプト内の `${marketContext}` の後に `${sectorTrendContext}` を追加（343行目付近）:
```
${newsContext}${marketContext}${sectorTrendContext}
```

**Step 2: コミット**

```bash
git add app/api/stocks/[stockId]/portfolio-analysis/route.ts
git commit -m "feat: ポートフォリオ分析にセクタートレンドコンテキストを追加"
```

---

## Task 11: ビルド確認 & 最終コミット

**Step 1: ビルド確認**

Run: `npx prisma generate && npx next build`
Expected: ビルド成功（warningのみ、errorなし）

**Step 2: 動作確認**

ローカルで `npm run dev` して:
1. ダッシュボードにセクタートレンドヒートマップが表示されること
2. 3日/7日の切り替えが動作すること
3. `/api/sector-trends` がデータを返すこと

**Step 3: Linearタスク作成 & ブランチ作成**

Linearにタスクを作成し、featureブランチでPRを作成する。
