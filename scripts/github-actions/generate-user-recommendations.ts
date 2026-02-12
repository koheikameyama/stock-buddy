#!/usr/bin/env npx tsx
/**
 * ユーザーごとのAIおすすめ銘柄生成スクリプト
 *
 * 各ユーザーの投資スタイル（期間・リスク許容度）と投資資金に基づき、
 * APIから取得した株価データを使って、パーソナライズされたおすすめ3銘柄を生成する。
 *
 * 前場終了後（11:35 JST）と後場終了後（15:35 JST）に実行。
 */

import { PrismaClient } from "@prisma/client"
import OpenAI from "openai"
import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"

dayjs.extend(utc)

const prisma = new PrismaClient()
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// 環境変数からセッションを取得
const SESSION = process.env.SESSION || "for_next_day"

// 絞り込み設定
const CONFIG = {
  // 各セクターからの最大銘柄数
  MAX_PER_SECTOR: 5,
  // AIに渡す最大銘柄数
  MAX_STOCKS_FOR_AI: 30,
}

// 時間帯別のプロンプト設定
const SESSION_PROMPTS: Record<string, { intro: string; focus: string }> = {
  for_afternoon: {
    intro: "前場の動きを踏まえたおすすめです。",
    focus: "後場に注目したい銘柄",
  },
  for_next_day: {
    intro: "本日の取引を踏まえた明日へのおすすめです。",
    focus: "明日以降に注目したい銘柄",
  },
}

interface StockWithPrice {
  id: string
  tickerCode: string
  name: string
  sector: string | null
  latestPrice: number
  weekChangeRate: number
  volume: number
}

interface UserWithSettings {
  userId: string
  investmentPeriod: string | null
  riskTolerance: string | null
  investmentBudget: number | null
}

interface Recommendation {
  tickerCode: string
  reason: string
}

async function getUsersWithSettings(): Promise<UserWithSettings[]> {
  const userSettings = await prisma.userSettings.findMany({
    select: {
      userId: true,
      investmentPeriod: true,
      riskTolerance: true,
      investmentBudget: true,
    },
  })
  console.log(`Found ${userSettings.length} users with settings`)
  return userSettings
}

/**
 * DBから株価データを読み込む（Pythonスクリプトで事前に更新済み）
 */
async function getStocksWithPrices(): Promise<StockWithPrice[]> {
  // DBから株価データを取得（priceUpdatedAtがあるもののみ）
  const stocks = await prisma.stock.findMany({
    where: {
      priceUpdatedAt: { not: null },
      latestPrice: { not: null },
      latestVolume: { not: null },
    },
    select: {
      id: true,
      tickerCode: true,
      name: true,
      sector: true,
      latestPrice: true,
      latestVolume: true,
      weekChangeRate: true,
    },
    orderBy: {
      latestVolume: "desc",
    },
  })

  const stocksWithPrices: StockWithPrice[] = stocks.map((s) => ({
    id: s.id,
    tickerCode: s.tickerCode,
    name: s.name,
    sector: s.sector,
    latestPrice: Number(s.latestPrice),
    weekChangeRate: Number(s.weekChangeRate || 0),
    volume: Number(s.latestVolume),
  }))

  console.log(`Found ${stocksWithPrices.length} stocks with price data`)

  // セクター分散フィルタ
  const sectorCounts = new Map<string, number>()
  const diversifiedStocks: StockWithPrice[] = []

  // 出来高順でソート（流動性が高い銘柄を優先）
  stocksWithPrices.sort((a, b) => b.volume - a.volume)

  for (const stock of stocksWithPrices) {
    const sector = stock.sector || "その他"
    const count = sectorCounts.get(sector) || 0

    if (count < CONFIG.MAX_PER_SECTOR) {
      diversifiedStocks.push(stock)
      sectorCounts.set(sector, count + 1)
    }
  }

  console.log(`After sector diversification: ${diversifiedStocks.length} stocks`)

  return diversifiedStocks
}

function filterStocksByBudget(stocks: StockWithPrice[], budget: number | null): StockWithPrice[] {
  if (!budget) return stocks
  // 100株購入を前提
  return stocks.filter((s) => s.latestPrice * 100 <= budget)
}

async function generateRecommendationsForUser(
  user: UserWithSettings,
  stocks: StockWithPrice[]
): Promise<Recommendation[] | null> {
  const prompts = SESSION_PROMPTS[SESSION] || SESSION_PROMPTS.for_next_day

  const periodLabel: Record<string, string> = {
    short: "短期（1年以内）",
    medium: "中期（1〜3年）",
    long: "長期（3年以上）",
  }

  const riskLabel: Record<string, string> = {
    low: "低い（安定重視）",
    medium: "普通（バランス）",
    high: "高い（成長重視）",
  }

  const budgetLabel = user.investmentBudget ? `${user.investmentBudget.toLocaleString()}円` : "未設定"

  // 銘柄リスト（最大30件）
  const stockList = stocks.slice(0, CONFIG.MAX_STOCKS_FOR_AI)
  const stockSummaries = stockList.map(
    (s) =>
      `- ${s.name}（${s.tickerCode}）: 株価${s.latestPrice.toLocaleString()}円, 1週間${s.weekChangeRate >= 0 ? "+" : ""}${s.weekChangeRate}%, ${s.sector || "不明"}`
  )

  const prompt = `あなたは投資初心者を優しくサポートするAIコーチです。
${prompts.intro}
以下のユーザーの投資スタイルに合った${prompts.focus}を3つ選んでください。

【ユーザーの投資スタイル】
- 投資期間: ${periodLabel[user.investmentPeriod || ""] || "不明"}
- リスク許容度: ${riskLabel[user.riskTolerance || ""] || "不明"}
- 投資資金: ${budgetLabel}

【選べる銘柄一覧】
${stockSummaries.join("\n")}

【回答ルール】
- 必ず3銘柄を選んでください（候補が3未満なら全て選ぶ）
- セクターが偏らないようにしてください
- 理由は中学生でも分かる言葉で書いてください
- 専門用語（ROE、PER、ボラティリティ等）は使わないでください
- 「安定している」「成長が期待できる」「みんなが知ってる会社」のような表現を使ってください

【回答形式】
以下のJSON配列で回答してください。JSON以外のテキストは含めないでください。

[
  {
    "tickerCode": "銘柄コード",
    "reason": "おすすめ理由（1〜2文）"
  },
  ...
]`

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a helpful investment coach for beginners. Always respond in valid JSON format only.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 500,
    })

    let content = response.choices[0].message.content?.trim() || ""

    // マークダウンコードブロックを削除
    if (content.startsWith("```json")) {
      content = content.slice(7)
    } else if (content.startsWith("```")) {
      content = content.slice(3)
    }
    if (content.endsWith("```")) {
      content = content.slice(0, -3)
    }
    content = content.trim()

    const result = JSON.parse(content) as Recommendation[]

    if (!Array.isArray(result)) {
      throw new Error("Response is not a JSON array")
    }

    // バリデーション
    return result.filter((item) => item.tickerCode && item.reason).slice(0, 3)
  } catch (error) {
    console.log(`  Error generating recommendations: ${error}`)
    return null
  }
}

async function saveUserRecommendations(
  userId: string,
  recommendations: Recommendation[],
  stockMap: Map<string, string>
): Promise<number> {
  const today = dayjs.utc().startOf("day").toDate()

  // 既存データを削除
  await prisma.userDailyRecommendation.deleteMany({
    where: { userId, date: today },
  })

  // 新しいデータを挿入
  let saved = 0
  for (let idx = 0; idx < recommendations.length; idx++) {
    const rec = recommendations[idx]
    const stockId = stockMap.get(rec.tickerCode)

    if (!stockId) {
      console.log(`  Warning: Stock not found for ticker ${rec.tickerCode}`)
      continue
    }

    await prisma.userDailyRecommendation.create({
      data: {
        userId,
        date: today,
        stockId,
        position: idx + 1,
        reason: rec.reason,
      },
    })
    saved++
  }

  return saved
}

async function main(): Promise<void> {
  console.log("=".repeat(60))
  console.log("User Daily Recommendation Generation (AI)")
  console.log("=".repeat(60))
  console.log(`Time: ${new Date().toISOString()}`)
  console.log(`Session: ${SESSION}`)
  console.log(`Config:`)
  console.log(`  - MAX_PER_SECTOR: ${CONFIG.MAX_PER_SECTOR}`)
  console.log(`  - MAX_STOCKS_FOR_AI: ${CONFIG.MAX_STOCKS_FOR_AI}`)

  if (!process.env.OPENAI_API_KEY) {
    console.error("Error: OPENAI_API_KEY environment variable not set")
    process.exit(1)
  }

  try {
    // ユーザーと銘柄データ取得
    const users = await getUsersWithSettings()
    const allStocks = await getStocksWithPrices()

    if (users.length === 0) {
      console.log("No users with settings. Exiting.")
      return
    }

    if (allStocks.length === 0) {
      console.log("No stocks with price data. Exiting.")
      return
    }

    // ticker → stockId のマップ
    const stockMap = new Map(allStocks.map((s) => [s.tickerCode, s.id]))

    let successCount = 0
    let errorCount = 0

    for (const user of users) {
      console.log(
        `\n--- User: ${user.userId} (budget: ${user.investmentBudget}, period: ${user.investmentPeriod}, risk: ${user.riskTolerance}) ---`
      )

      // 予算でフィルタ
      const filtered = filterStocksByBudget(allStocks, user.investmentBudget)
      console.log(`  Stocks after budget filter: ${filtered.length}/${allStocks.length}`)

      if (filtered.length === 0) {
        console.log("  No stocks within budget. Skipping.")
        errorCount++
        continue
      }

      // AI生成
      const recommendations = await generateRecommendationsForUser(user, filtered)

      if (!recommendations) {
        console.log("  Failed to generate recommendations.")
        errorCount++
        continue
      }

      // 保存
      const saved = await saveUserRecommendations(user.userId, recommendations, stockMap)
      console.log(`  Saved ${saved} recommendations`)

      if (saved > 0) {
        successCount++
      } else {
        errorCount++
      }
    }

    console.log(`\n${"=".repeat(60)}`)
    console.log(`Completed: ${successCount} users OK, ${errorCount} users failed`)
    console.log("=".repeat(60))

    if (errorCount > 0 && successCount === 0) {
      process.exit(1)
    }
  } catch (error) {
    console.error(`Error: ${error}`)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()

export {}
