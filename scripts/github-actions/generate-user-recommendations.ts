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
import { fetchHistoricalPrices } from "../../lib/stock-price-fetcher"

dayjs.extend(utc)

const prisma = new PrismaClient()
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// 環境変数からセッションを取得
const SESSION = process.env.SESSION || "for_next_day"

// 絞り込み設定
const CONFIG = {
  // 出来高の最低値（流動性フィルタ）
  MIN_VOLUME: 100000,
  // 各セクターからの最大銘柄数
  MAX_PER_SECTOR: 5,
  // 週間下落率の足切りライン（%）
  MIN_WEEK_CHANGE: -10,
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
 * APIから株価データを取得し、絞り込みを行う
 * メモリ節約のためバッチ処理で実行
 */
async function getStocksWithPrices(): Promise<StockWithPrice[]> {
  // 銘柄マスタを取得
  const stocks = await prisma.stock.findMany({
    select: {
      id: true,
      tickerCode: true,
      name: true,
      sector: true,
    },
  })

  console.log(`Found ${stocks.length} stocks`)
  if (stocks.length === 0) return []

  const stocksWithPrices: StockWithPrice[] = []

  // バッチ設定（メモリ節約のため小さめのバッチで処理）
  const BATCH_SIZE = 50
  const CONCURRENCY = 3
  const DELAY_BETWEEN_START = 150 // ms

  console.log(`Fetching prices for ${stocks.length} stocks (batch: ${BATCH_SIZE}, concurrency: ${CONCURRENCY})...`)

  let completed = 0

  // バッチ処理
  for (let batchStart = 0; batchStart < stocks.length; batchStart += BATCH_SIZE) {
    const batch = stocks.slice(batchStart, batchStart + BATCH_SIZE)
    const batchResults: StockWithPrice[] = []

    // バッチ内の銘柄を並列処理
    const queue = [...batch]
    const running: Promise<void>[] = []

    while (queue.length > 0 || running.length > 0) {
      while (running.length < CONCURRENCY && queue.length > 0) {
        const stock = queue.shift()!
        const task = (async () => {
          try {
            const historicalData = await fetchHistoricalPrices(stock.tickerCode, "1m")

            if (!historicalData || historicalData.length < 2) return

            const sorted = [...historicalData].sort((a, b) => b.date.localeCompare(a.date))

            const latest = sorted[0]?.close
            const weekAgo = sorted.length >= 5 ? sorted[4]?.close : sorted[sorted.length - 1]?.close
            if (!latest || !weekAgo) return

            const changeRate = ((latest - weekAgo) / weekAgo) * 100

            // 下落トレンドフィルタ
            if (changeRate < CONFIG.MIN_WEEK_CHANGE) return

            // 出来高フィルタ
            const volume = sorted[0]?.volume || 0
            if (volume < CONFIG.MIN_VOLUME) return

            batchResults.push({
              id: stock.id,
              tickerCode: stock.tickerCode,
              name: stock.name,
              sector: stock.sector,
              latestPrice: latest,
              weekChangeRate: Math.round(changeRate * 10) / 10,
              volume,
            })
          } catch {
            // エラーは無視
          } finally {
            completed++
          }
        })()
        running.push(task)

        if (queue.length > 0) {
          await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_START))
        }
      }

      if (running.length > 0) {
        await Promise.race(running)
        const stillRunning: Promise<void>[] = []
        for (const task of running) {
          const isSettled = await Promise.race([task.then(() => true), Promise.resolve(false)])
          if (!isSettled) stillRunning.push(task)
        }
        running.length = 0
        running.push(...stillRunning)
      }
    }

    // バッチ結果をマージ
    stocksWithPrices.push(...batchResults)

    // 進捗表示
    console.log(`  Progress: ${Math.min(batchStart + BATCH_SIZE, stocks.length)}/${stocks.length} (found: ${stocksWithPrices.length})`)

    // GCヒントのための小休止（次のバッチ前にメモリ解放を促す）
    if (batchStart + BATCH_SIZE < stocks.length) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }

  console.log(`  Completed: ${stocks.length} stocks processed`)

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
  console.log(`  - MIN_VOLUME: ${CONFIG.MIN_VOLUME.toLocaleString()}`)
  console.log(`  - MAX_PER_SECTOR: ${CONFIG.MAX_PER_SECTOR}`)
  console.log(`  - MIN_WEEK_CHANGE: ${CONFIG.MIN_WEEK_CHANGE}%`)

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
