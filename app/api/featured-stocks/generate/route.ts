import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import OpenAI from "openai"

/**
 * POST /api/featured-stocks/generate
 * Twitter連携で注目銘柄を自動生成
 *
 * フロー:
 * 1. リクエストボディからtwitter_tweets.jsonデータを受け取る
 * 2. ティッカー別にツイートを集計
 * 3. メンション数が5以上の銘柄に対してOpenAI分析
 * 4. カテゴリ・理由・スコアを取得
 * 5. FeaturedStockテーブルにupsert
 *
 * 改善点:
 * - N+1問題を解決（バッチクエリ化）
 * - Race condition解決（Prisma upsert + unique制約）
 * - OpenAIタイムアウト保護追加
 * - ファイルシステム依存を削除（リクエストボディで受け取る）
 */

interface TwitterTweet {
  id: string
  text: string
  author: string
  created_at: string
  tickers: string[]
  retweet_count: number
  favorite_count: number
}

interface TwitterData {
  collected_at: string
  total_tweets: number
  unique_tickers: number
  ticker_mentions: Record<string, number>
  tweets: TwitterTweet[]
}

interface OpenAIAnalysisResult {
  category: "surge" | "stable" | "trending"
  reason: string
  score: number
}

const MIN_MENTIONS = 5
const MAX_TWEET_SAMPLES = 5
const OPENAI_TIMEOUT_MS = 30000 // 30 seconds

export async function POST(request: NextRequest) {
  try {
    // Authentication check
    const authHeader = request.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check OpenAI API key
    const openaiApiKey = process.env.OPENAI_API_KEY
    if (!openaiApiKey) {
      console.error("❌ OPENAI_API_KEY is not set")
      return NextResponse.json(
        { error: "OpenAI API key not configured" },
        { status: 500 }
      )
    }

    // Read Twitter data from request body (Issue 4: File system dependency)
    const body = await request.json()
    const twitterData = body.twitterData as TwitterData

    if (!twitterData || !twitterData.tweets) {
      return NextResponse.json(
        { error: "Missing twitterData in request body" },
        { status: 400 }
      )
    }

    console.log(`✅ Received Twitter data: ${twitterData.total_tweets} tweets, ${twitterData.unique_tickers} unique tickers`)

    // Filter tickers with sufficient mentions
    const qualifiedTickers = Object.entries(twitterData.ticker_mentions)
      .filter(([_, count]) => count >= MIN_MENTIONS)
      .sort(([, a], [, b]) => b - a)

    console.log(`✅ Qualified tickers (>= ${MIN_MENTIONS} mentions): ${qualifiedTickers.length}`)

    if (qualifiedTickers.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No tickers with sufficient mentions",
        stats: { added: 0, updated: 0, errors: [] },
      })
    }

    // Initialize OpenAI
    const openai = new OpenAI({
      apiKey: openaiApiKey,
    })

    const stats = {
      added: 0,
      updated: 0,
      errors: [] as string[],
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    // Issue 1: N+1 Problem - Batch query all stocks at once
    console.log("🔍 Fetching all stocks from database...")
    const stockTickers = qualifiedTickers.map(([ticker]) => ticker)
    const stocks = await prisma.stock.findMany({
      where: { tickerCode: { in: stockTickers } },
    })
    const stockMap = new Map(stocks.map((s) => [s.tickerCode, s]))
    console.log(`✅ Fetched ${stocks.length} stocks`)

    // Issue 1: Batch query all existing featured stocks at once
    console.log("🔍 Fetching existing featured stocks...")
    const existingFeatured = await prisma.featuredStock.findMany({
      where: {
        stockId: { in: stocks.map((s) => s.id) },
        date: { gte: today, lt: tomorrow },
      },
    })
    const featuredMap = new Map(existingFeatured.map((f) => [f.stockId, f]))
    console.log(`✅ Found ${existingFeatured.length} existing featured stocks for today`)

    // Collect all upsert operations
    const upsertOperations = []

    // Process each qualified ticker
    for (const [ticker, mentionCount] of qualifiedTickers) {
      try {
        console.log(`\n📊 Processing ${ticker} (${mentionCount} mentions)...`)

        // Get stock from pre-fetched map (no DB query)
        const stock = stockMap.get(ticker)

        if (!stock) {
          console.warn(`⚠️ Stock ${ticker} not found in database`)
          stats.errors.push(`${ticker}: Stock not found in database`)
          continue
        }

        // Get tweets for this ticker
        const tickerTweets = twitterData.tweets
          .filter((tweet) => tweet.tickers.includes(ticker))
          .slice(0, MAX_TWEET_SAMPLES)

        if (tickerTweets.length === 0) {
          console.warn(`⚠️ No tweets found for ${ticker}`)
          stats.errors.push(`${ticker}: No tweets found`)
          continue
        }

        // Prepare tweet samples for OpenAI
        const tweetSamples = tickerTweets
          .map((tweet, idx) => {
            return `${idx + 1}. "${tweet.text}" (RT: ${tweet.retweet_count}, いいね: ${tweet.favorite_count})`
          })
          .join("\n")

        // Call OpenAI for analysis
        console.log(`🤖 Calling OpenAI for ${ticker} (${stock?.name ?? ticker})...`)

        const prompt = `以下のツイートデータから、銘柄コード ${ticker} (${stock?.name ?? ticker}) の投資判断を行ってください。

ツイート例 (全${mentionCount}件のメンションから抜粋):
${tweetSamples}

以下の形式でJSON形式で回答してください:
{
  "category": "surge" | "stable" | "trending",
  "reason": "100文字以内の理由",
  "score": 0-100の数値
}

カテゴリの定義:
- surge: 急騰が期待される（短期投資向け）
- stable: 安定成長が期待される（中長期投資向け）
- trending: SNSで話題になっている（注目度が高い）

スコアの基準:
- メンション数の多さ
- ツイートのエンゲージメント（RT、いいね）
- センチメント（ポジティブ度合い）
- 内容の具体性

必ず日本語で、初心者にも分かりやすく説明してください。`

        // Issue 3: OpenAI timeout protection
        const completion = await Promise.race([
          openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: "あなたは投資初心者向けのアドバイザーです。専門用語を避け、分かりやすい言葉で説明します。",
              },
              {
                role: "user",
                content: prompt,
              },
            ],
            response_format: { type: "json_object" },
            temperature: 0.7,
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("OpenAI API timeout")), OPENAI_TIMEOUT_MS)
          ),
        ]) as OpenAI.Chat.Completions.ChatCompletion

        const resultText = completion.choices[0]?.message?.content
        if (!resultText) {
          console.error(`❌ No response from OpenAI for ${ticker}`)
          stats.errors.push(`${ticker}: No OpenAI response`)
          continue
        }

        const analysis: OpenAIAnalysisResult = JSON.parse(resultText)

        // Validate analysis result
        if (
          !analysis.category ||
          !["surge", "stable", "trending"].includes(analysis.category) ||
          !analysis.reason ||
          typeof analysis.score !== "number" ||
          analysis.score < 0 ||
          analysis.score > 100
        ) {
          console.error(`❌ Invalid analysis result for ${ticker}:`, analysis)
          stats.errors.push(`${ticker}: Invalid analysis format`)
          continue
        }

        console.log(`✅ AI Analysis: category=${analysis.category}, score=${analysis.score}`)

        // Check if this is an update or create (for stats tracking)
        const isUpdate = featuredMap.has(stock.id)

        // Issue 2: Race condition - Use Prisma upsert with unique constraint
        const upsertOperation = prisma.featuredStock.upsert({
          where: {
            stockId_date: {
              stockId: stock.id,
              date: today,
            },
          },
          update: {
            category: analysis.category,
            reason: analysis.reason,
            score: analysis.score,
            source: "twitter",
            updatedAt: new Date(),
          },
          create: {
            stockId: stock.id,
            date: today,
            category: analysis.category,
            reason: analysis.reason,
            score: analysis.score,
            source: "twitter",
          },
        })

        upsertOperations.push(upsertOperation)

        if (isUpdate) {
          console.log(`✅ Will update FeaturedStock for ${ticker}`)
          stats.updated++
        } else {
          console.log(`✅ Will create FeaturedStock for ${ticker}`)
          stats.added++
        }

        // Rate limiting: small delay between API calls
        await new Promise((resolve) => setTimeout(resolve, 1000))
      } catch (error) {
        console.error(`❌ Error processing ${ticker}:`, error)
        const errorMessage = error instanceof Error ? error.message : "Unknown error"
        stats.errors.push(`${ticker}: ${errorMessage}`)
      }
    }

    // Execute all upsert operations in a transaction
    console.log(`\n💾 Executing ${upsertOperations.length} upsert operations...`)
    if (upsertOperations.length > 0) {
      await prisma.$transaction(upsertOperations)
      console.log("✅ All upsert operations completed successfully")
    }

    console.log("\n📊 Final Stats:", stats)

    return NextResponse.json({
      success: true,
      message: `Featured stocks generation completed. Added: ${stats.added}, Updated: ${stats.updated}, Errors: ${stats.errors.length}`,
      stats,
    })
  } catch (error) {
    console.error("❌ Error generating featured stocks:", error)
    return NextResponse.json(
      {
        error: "Failed to generate featured stocks",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
