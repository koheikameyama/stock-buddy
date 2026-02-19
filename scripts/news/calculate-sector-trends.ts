#!/usr/bin/env npx tsx
/**
 * セクタートレンド計算スクリプト
 *
 * 機能:
 * - 直近7日間のMarketNewsをセクター別に集計（3日窓・7日窓）
 * - USニュースをJPセクターにマッピング（0.7倍の重み）
 * - 株価モメンタム（セクター内全銘柄の平均）を取得
 * - ニュース + 株価 + 出来高の総合スコア（compositeScore）を算出
 * - SectorTrendテーブルにUPSERT
 */

import { PrismaClient } from "@prisma/client"
import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"

dayjs.extend(utc)
dayjs.extend(timezone)

const prisma = new PrismaClient()

const JST = "Asia/Tokyo"

// --- 定数（standalone script 用にインライン定義） ---

const JP_SECTORS = [
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

const US_INFLUENCE_WEIGHT = 0.7
const NEWS_WEIGHT = 0.4
const PRICE_WEIGHT = 0.4
const VOLUME_WEIGHT = 0.2
const PRICE_CLAMP = 10
const VOLUME_CLAMP = 1
const UP_THRESHOLD = 20
const DOWN_THRESHOLD = -20

// --- 型定義 ---

interface SectorNewsAgg {
  positive: number
  negative: number
  neutral: number
  total: number
  usNewsCount: number
}

interface SectorPriceMomentum {
  avgWeekChangeRate: number | null
  avgDailyChangeRate: number | null
  avgMaDeviationRate: number | null
  avgVolumeRatio: number | null
  avgVolatility: number | null
  stockCount: number
}

// --- ユーティリティ ---

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * ニューススコア算出（JP + US重み付き）
 * JPニュースは重み1.0、USニュースは重み US_INFLUENCE_WEIGHT (0.7)
 *
 * weighted_positive = jp_positive + us_positive * 0.7
 * weighted_negative = jp_negative + us_negative * 0.7
 * weighted_total = jp_total + us_total * 0.7
 * newsScore = ((weighted_positive - weighted_negative) / weighted_total) * 100 * log2(weighted_total + 1)
 */
function calcNewsScore(agg: SectorNewsAgg): number {
  if (agg.total === 0) return 0

  // JP/US比率から各センチメントの内訳を推定
  // usNewsCount はUSニュースの総数。JP/USの比率でpositive/negativeを按分
  const jpTotal = agg.total - agg.usNewsCount
  const usTotal = agg.usNewsCount

  if (jpTotal + usTotal === 0) return 0

  // JP/US比率
  const jpRatio = jpTotal > 0 ? jpTotal / agg.total : 0
  const usRatio = usTotal > 0 ? usTotal / agg.total : 0

  // 各センチメントをJP/US比率で按分してから重み付け
  const weightedPositive = agg.positive * jpRatio + agg.positive * usRatio * US_INFLUENCE_WEIGHT
  const weightedNegative = agg.negative * jpRatio + agg.negative * usRatio * US_INFLUENCE_WEIGHT
  const weightedTotal = jpTotal + usTotal * US_INFLUENCE_WEIGHT

  if (weightedTotal === 0) return 0

  return ((weightedPositive - weightedNegative) / weightedTotal) * 100 * Math.log2(weightedTotal + 1)
}

/**
 * USニュースのセクターをJPセクターにマッピング
 * 1つのUSニュースが複数のJPセクターにマッピングされる場合がある
 */
function mapUSNewsToJPSectors(usSector: string | null): string[] {
  if (!usSector) return []
  const matched: string[] = []
  for (const [jpSector, usSectors] of Object.entries(US_TO_JP_SECTOR_MAP)) {
    if (usSectors.some((s) => usSector.includes(s))) {
      matched.push(jpSector)
    }
  }
  return matched
}

// --- メイン処理 ---

async function main(): Promise<void> {
  console.log("=".repeat(60))
  console.log("セクタートレンド計算スクリプト")
  console.log("=".repeat(60))

  const today = dayjs().tz(JST).startOf("day").utc().toDate()
  const threeDaysAgo = dayjs().tz(JST).subtract(3, "day").startOf("day").utc().toDate()
  const sevenDaysAgo = dayjs().tz(JST).subtract(7, "day").startOf("day").utc().toDate()

  console.log(`\n対象期間: ${dayjs(sevenDaysAgo).format("YYYY-MM-DD")} 〜 ${dayjs(today).format("YYYY-MM-DD")}`)

  // -------------------------------------------------------
  // 1. 直近7日間のニュースを一括取得
  // -------------------------------------------------------
  console.log("\n[1/4] ニュースデータ取得中...")
  const allNews = await prisma.marketNews.findMany({
    where: {
      publishedAt: { gte: sevenDaysAgo },
    },
    select: {
      sector: true,
      sentiment: true,
      market: true,
      publishedAt: true,
    },
  })
  console.log(`  取得件数: ${allNews.length}件`)

  // -------------------------------------------------------
  // 2. セクター別にニュースを集計（3日窓・7日窓）
  // -------------------------------------------------------
  console.log("\n[2/4] セクター別ニュース集計中...")

  // 初期化
  const agg3d: Record<string, SectorNewsAgg> = {}
  const agg7d: Record<string, SectorNewsAgg> = {}
  for (const sector of JP_SECTORS) {
    agg3d[sector] = { positive: 0, negative: 0, neutral: 0, total: 0, usNewsCount: 0 }
    agg7d[sector] = { positive: 0, negative: 0, neutral: 0, total: 0, usNewsCount: 0 }
  }

  for (const news of allNews) {
    const isWithin3d = news.publishedAt >= threeDaysAgo
    const sentiment = news.sentiment as string | null

    if (news.market === "JP") {
      // JPニュース: セクターが直接一致するものを集計
      const sector = news.sector
      if (sector && sector in agg7d) {
        addSentiment(agg7d[sector], sentiment, false)
        if (isWithin3d) {
          addSentiment(agg3d[sector], sentiment, false)
        }
      }
    } else if (news.market === "US") {
      // USニュース: JPセクターにマッピング（重み 0.7）
      const jpSectors = mapUSNewsToJPSectors(news.sector)
      for (const jpSector of jpSectors) {
        if (jpSector in agg7d) {
          addSentiment(agg7d[jpSector], sentiment, true)
          if (isWithin3d) {
            addSentiment(agg3d[jpSector], sentiment, true)
          }
        }
      }
    }
  }

  for (const sector of JP_SECTORS) {
    const a7 = agg7d[sector]
    const a3 = agg3d[sector]
    console.log(
      `  ${sector}: 7d=${a7.total}件(+${a7.positive}/-${a7.negative}/=${a7.neutral}, US=${a7.usNewsCount}), 3d=${a3.total}件(+${a3.positive}/-${a3.negative}/=${a3.neutral}, US=${a3.usNewsCount})`
    )
  }

  // -------------------------------------------------------
  // 3. 株価モメンタム取得（セクター別 groupBy）
  // -------------------------------------------------------
  console.log("\n[3/4] 株価モメンタム取得中...")

  const stockGroupBy = await prisma.stock.groupBy({
    by: ["sector"],
    where: {
      sector: { in: [...JP_SECTORS] },
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

  // セクター別にマッピング
  const priceMomentum: Record<string, SectorPriceMomentum> = {}
  for (const sector of JP_SECTORS) {
    priceMomentum[sector] = {
      avgWeekChangeRate: null,
      avgDailyChangeRate: null,
      avgMaDeviationRate: null,
      avgVolumeRatio: null,
      avgVolatility: null,
      stockCount: 0,
    }
  }

  for (const row of stockGroupBy) {
    const sector = row.sector as string
    if (sector in priceMomentum) {
      priceMomentum[sector] = {
        avgWeekChangeRate: row._avg.weekChangeRate !== null ? Number(row._avg.weekChangeRate) : null,
        avgDailyChangeRate: row._avg.dailyChangeRate !== null ? Number(row._avg.dailyChangeRate) : null,
        avgMaDeviationRate: row._avg.maDeviationRate !== null ? Number(row._avg.maDeviationRate) : null,
        avgVolumeRatio: row._avg.volumeRatio !== null ? Number(row._avg.volumeRatio) : null,
        avgVolatility: row._avg.volatility !== null ? Number(row._avg.volatility) : null,
        stockCount: row._count.id,
      }
    }
  }

  for (const sector of JP_SECTORS) {
    const m = priceMomentum[sector]
    console.log(
      `  ${sector}: 銘柄数=${m.stockCount}, 週間=${m.avgWeekChangeRate?.toFixed(2) ?? "N/A"}%, 日次=${m.avgDailyChangeRate?.toFixed(2) ?? "N/A"}%, 出来高比=${m.avgVolumeRatio?.toFixed(2) ?? "N/A"}`
    )
  }

  // -------------------------------------------------------
  // 4. 総合スコア算出 & UPSERT
  // -------------------------------------------------------
  console.log("\n[4/4] 総合スコア算出・保存中...")

  const upsertPromises = JP_SECTORS.map((sector) => {
    const a3 = agg3d[sector]
    const a7 = agg7d[sector]
    const m = priceMomentum[sector]

    // ニューススコア（7d窓をベースに総合スコア算出）
    const newsScore = calcNewsScore(a7)

    // 株価スコア
    const priceScore =
      m.avgWeekChangeRate !== null ? clamp(m.avgWeekChangeRate, -PRICE_CLAMP, PRICE_CLAMP) * 10 : 0

    // 出来高スコア
    const volumeScore =
      m.avgVolumeRatio !== null ? clamp(m.avgVolumeRatio - 1.0, -VOLUME_CLAMP, VOLUME_CLAMP) * 100 : 0

    // 総合スコア
    const compositeScore = newsScore * NEWS_WEIGHT + priceScore * PRICE_WEIGHT + volumeScore * VOLUME_WEIGHT

    // トレンド方向
    let trendDirection: string
    if (compositeScore >= UP_THRESHOLD) {
      trendDirection = "up"
    } else if (compositeScore <= DOWN_THRESHOLD) {
      trendDirection = "down"
    } else {
      trendDirection = "neutral"
    }

    // ニューススコア（3d, 7d個別）
    const score3d = calcNewsScore(a3)
    const score7d = calcNewsScore(a7)

    console.log(
      `  ${sector}: news=${newsScore.toFixed(1)}, price=${priceScore.toFixed(1)}, vol=${volumeScore.toFixed(1)} → composite=${compositeScore.toFixed(1)} (${trendDirection})`
    )

    return prisma.sectorTrend.upsert({
      where: {
        date_sector: {
          date: today,
          sector,
        },
      },
      update: {
        score3d,
        newsCount3d: a3.total,
        positive3d: a3.positive,
        negative3d: a3.negative,
        neutral3d: a3.neutral,
        score7d,
        newsCount7d: a7.total,
        positive7d: a7.positive,
        negative7d: a7.negative,
        neutral7d: a7.neutral,
        usNewsCount3d: a3.usNewsCount,
        usNewsCount7d: a7.usNewsCount,
        avgWeekChangeRate: m.avgWeekChangeRate,
        avgDailyChangeRate: m.avgDailyChangeRate,
        avgMaDeviationRate: m.avgMaDeviationRate,
        avgVolumeRatio: m.avgVolumeRatio,
        avgVolatility: m.avgVolatility,
        stockCount: m.stockCount,
        compositeScore,
        trendDirection,
      },
      create: {
        date: today,
        sector,
        score3d,
        newsCount3d: a3.total,
        positive3d: a3.positive,
        negative3d: a3.negative,
        neutral3d: a3.neutral,
        score7d,
        newsCount7d: a7.total,
        positive7d: a7.positive,
        negative7d: a7.negative,
        neutral7d: a7.neutral,
        usNewsCount3d: a3.usNewsCount,
        usNewsCount7d: a7.usNewsCount,
        avgWeekChangeRate: m.avgWeekChangeRate,
        avgDailyChangeRate: m.avgDailyChangeRate,
        avgMaDeviationRate: m.avgMaDeviationRate,
        avgVolumeRatio: m.avgVolumeRatio,
        avgVolatility: m.avgVolatility,
        stockCount: m.stockCount,
        compositeScore,
        trendDirection,
      },
    })
  })

  await Promise.all(upsertPromises)

  console.log(`\n${"=".repeat(60)}`)
  console.log(`セクタートレンド計算完了: ${JP_SECTORS.length}セクター保存`)
  console.log("=".repeat(60))
}

/**
 * センチメントを集計に加算する
 * USニュースの場合は usNewsCount もカウント
 */
function addSentiment(agg: SectorNewsAgg, sentiment: string | null, isUS: boolean): void {
  agg.total++
  if (isUS) agg.usNewsCount++

  switch (sentiment) {
    case "positive":
      agg.positive++
      break
    case "negative":
      agg.negative++
      break
    case "neutral":
      agg.neutral++
      break
    // sentiment が null の場合は total のみカウント（neutral 扱いにはしない）
  }
}

main()
  .catch((error) => {
    console.error("Error:", error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

export {}
