#!/usr/bin/env npx tsx
/**
 * ユーザーごとのAIおすすめ銘柄生成スクリプト
 *
 * 各ユーザーの投資スタイル（期間・リスク許容度）と投資資金に基づき、
 * 予算内の銘柄をOpenAI APIに渡して、パーソナライズされたおすすめ3銘柄を生成する。
 *
 * 毎日朝のバッチで実行。
 */

import { PrismaClient } from "@prisma/client"
import OpenAI from "openai"
import { fetchHistoricalPrices } from "../../lib/stock-price-fetcher"

const prisma = new PrismaClient()
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// 時間帯コンテキスト
const TIME_CONTEXT = process.env.TIME_CONTEXT || "morning"

// 時間帯別のプロンプト設定
const TIME_CONTEXT_PROMPTS: Record<string, { intro: string; focus: string }> = {
  morning: {
    intro: "今日の取引開始前のおすすめです。",
    focus: "今日注目すべき銘柄",
  },
  noon: {
    intro: "前場の動きを踏まえたおすすめです。",
    focus: "後場に注目したい銘柄",
  },
  close: {
    intro: "本日の取引を踏まえた明日へのおすすめです。",
    focus: "明日以降に注目したい銘柄",
  },
}

interface StockWithPrice {
  id: string
  tickerCode: string
  name: string
  sector: string | null
  beginnerScore: number
  latestPrice: number
  weekChangeRate: number
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

async function getStocksWithPrices(): Promise<StockWithPrice[]> {
  // 銘柄マスタを取得
  const stocks = await prisma.stock.findMany({
    where: { beginnerScore: { not: null } },
    orderBy: { beginnerScore: "desc" },
    select: {
      id: true,
      tickerCode: true,
      name: true,
      sector: true,
      beginnerScore: true,
    },
  })
  console.log(`Found ${stocks.length} stocks from database`)

  if (stocks.length === 0) return []

  // Stooq APIで株価を取得
  console.log(`Fetching prices for ${stocks.length} stocks from Stooq API...`)

  const stocksWithPrices: StockWithPrice[] = []

  // バッチ処理（並列で取得）
  const batchSize = 50
  for (let i = 0; i < stocks.length; i += batchSize) {
    const batchStocks = stocks.slice(i, i + batchSize)

    const results = await Promise.allSettled(
      batchStocks.map(async (stock) => {
        try {
          // 1ヶ月分のデータを取得（5日分を確保するため）
          const historicalData = await fetchHistoricalPrices(stock.tickerCode, "1m")

          if (!historicalData || historicalData.length < 2) return null

          // 新しい順にソート
          const sorted = [...historicalData].sort((a, b) => b.date.localeCompare(a.date))

          const latest = sorted[0]?.close
          const weekAgo = sorted.length >= 5 ? sorted[4]?.close : sorted[sorted.length - 1]?.close
          if (!latest || !weekAgo) return null

          const changeRate = ((latest - weekAgo) / weekAgo) * 100

          return {
            id: stock.id,
            tickerCode: stock.tickerCode,
            name: stock.name,
            sector: stock.sector,
            beginnerScore: stock.beginnerScore!,
            latestPrice: latest,
            weekChangeRate: Math.round(changeRate * 10) / 10,
          }
        } catch {
          return null
        }
      })
    )

    for (const result of results) {
      if (result.status === "fulfilled" && result.value) {
        stocksWithPrices.push(result.value)
      }
    }
  }

  console.log(`Found ${stocksWithPrices.length} stocks with price data`)
  return stocksWithPrices
}

function filterStocksByBudget(stocks: StockWithPrice[], budget: number | null): StockWithPrice[] {
  if (!budget) return stocks
  return stocks.filter((s) => s.latestPrice * 100 <= budget)
}

async function generateRecommendationsForUser(
  user: UserWithSettings,
  stocks: StockWithPrice[]
): Promise<Recommendation[] | null> {
  const prompts = TIME_CONTEXT_PROMPTS[TIME_CONTEXT] || TIME_CONTEXT_PROMPTS.morning

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
  const stockList = stocks.slice(0, 30)
  const stockSummaries = stockList.map(
    (s) =>
      `- ${s.name}（${s.tickerCode}）: 株価${s.latestPrice.toLocaleString()}円, 1週間${s.weekChangeRate >= 0 ? "+" : ""}${s.weekChangeRate}%, スコア${s.beginnerScore}点, ${s.sector || "不明"}`
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
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

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
  console.log(`Time context: ${TIME_CONTEXT}`)

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
