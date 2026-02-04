import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { OpenAI } from "openai"
import { getRelatedNews } from "@/lib/news-rag"
import dayjs from "dayjs"

function getOpenAIClient() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })
}

export async function POST(request: NextRequest) {
  try {
    // CRON_SECRETで認証
    const authHeader = request.headers.get("authorization")
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { stock_codes } = await request.json()

    if (!stock_codes || !Array.isArray(stock_codes)) {
      return NextResponse.json(
        { error: "stock_codes array is required" },
        { status: 400 }
      )
    }

    console.log(`📊 Processing ${stock_codes.length} trending stock codes`)

    const results = {
      added_to_master: 0,
      analyzed_count: 0,
      featured_count: 0,
      error_count: 0,
      errors: [] as string[],
    }

    // 銘柄コードを.Tサフィックス付きに変換
    const tickerCodes = stock_codes.map((code: string) => `${code}.T`)

    // 既存の銘柄を取得
    const existingStocks = await prisma.stock.findMany({
      where: {
        tickerCode: {
          in: tickerCodes,
        },
      },
    })

    const existingTickerSet = new Set(existingStocks.map((s) => s.tickerCode))

    // マスターにない銘柄を特定
    const missingTickers = tickerCodes.filter((t) => !existingTickerSet.has(t))

    console.log(`ℹ️  Existing stocks: ${existingStocks.length}`)
    console.log(`ℹ️  Missing stocks: ${missingTickers.length}`)

    // マスターにない銘柄を追加（簡易版：名前のみ）
    if (missingTickers.length > 0) {
      console.log(`📝 Adding ${missingTickers.length} missing stocks to master...`)

      for (const ticker of missingTickers) {
        try {
          const code = ticker.replace(".T", "")
          await prisma.stock.create({
            data: {
              tickerCode: ticker,
              name: `銘柄${code}`, // 仮の名前
              market: "東証",
              sector: "その他",
              beginnerScore: 50, // デフォルトスコア
            },
          })
          results.added_to_master++
        } catch (error: any) {
          console.error(`Error adding ${ticker}:`, error.message)
          results.errors.push(`Failed to add ${ticker}: ${error.message}`)
        }
      }

      console.log(`✅ Added ${results.added_to_master} stocks to master`)
    }

    // 全銘柄を再取得（新規追加分を含む）
    const allStocks = await prisma.stock.findMany({
      where: {
        tickerCode: {
          in: tickerCodes,
        },
      },
      include: {
        prices: {
          orderBy: {
            date: "desc",
          },
          take: 1,
        },
      },
    })

    // 候補銘柄に関連するニュースを取得
    const candidateTickerCodes = allStocks.map((s) => s.tickerCode)
    const candidateSectors = Array.from(
      new Set(allStocks.map((s) => s.sector).filter((s): s is string => !!s))
    )

    const relatedNews = await getRelatedNews({
      tickerCodes: candidateTickerCodes,
      sectors: candidateSectors,
      limit: 20, // 注目銘柄生成は多めに取得
      daysAgo: 7,
    })

    console.log(`📰 Found ${relatedNews.length} related news articles`)
    console.log(`🤖 Analyzing ${allStocks.length} stocks with OpenAI...`)

    // 既存のFeaturedStockを削除（ソース：news）
    await prisma.featuredStock.deleteMany({
      where: {
        source: "news",
      },
    })

    // OpenAI APIで分析（バッチ処理で効率化）
    const batchSize = 5
    for (let i = 0; i < allStocks.length; i += batchSize) {
      const batch = allStocks.slice(i, i + batchSize)

      for (const stock of batch) {
        try {
          const latestPrice = stock.prices[0]?.close

          if (!latestPrice) {
            console.log(`⚠️  No price data for ${stock.tickerCode}, skipping`)
            continue
          }

          // この銘柄に関連するニュースをフィルタリング
          const stockNews = relatedNews.filter(
            (n) =>
              n.content.includes(stock.tickerCode) ||
              n.content.includes(stock.tickerCode.replace(".T", "")) ||
              n.sector === stock.sector
          )

          // OpenAI APIで銘柄を分析
          const prompt = `あなたは投資初心者向けのアドバイザーです。以下の銘柄について、簡潔に分析してください。

銘柄情報:
- 銘柄コード: ${stock.tickerCode}
- 銘柄名: ${stock.name}
- セクター: ${stock.sector || "不明"}
- 現在価格: ${latestPrice}円

最新のニュース情報:
${
  stockNews.length > 0
    ? stockNews
        .slice(0, 3)
        .map(
          (n) =>
            `- ${n.title} (${dayjs(n.publishedAt).format("MM/DD")}) - ${n.sentiment || "不明"}\n  ${n.content.substring(0, 150)}...`
        )
        .join("\n\n")
    : "（関連ニュースはありません）"
}

以下の形式で回答してください（各項目50文字以内）:
1. この銘柄の特徴
2. 初心者におすすめの理由（ニュース情報があれば参考にする）
3. 注意点

簡潔に、専門用語を避けて説明してください。
ニュース情報がある場合は、それを理由に含めてください。`

          const openai = getOpenAIClient()
          const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.7,
            max_tokens: 300,
          })

          const analysis = completion.choices[0].message.content || ""

          // FeaturedStockに登録
          await prisma.featuredStock.create({
            data: {
              stockId: stock.id,
              reason: analysis,
              score: stock.beginnerScore || 50,
              source: "news",
              category: "話題",
            },
          })

          results.analyzed_count++
          results.featured_count++

          console.log(`✅ Analyzed and added: ${stock.name} (${stock.tickerCode})`)
        } catch (error: any) {
          console.error(`Error analyzing ${stock.tickerCode}:`, error.message)
          results.error_count++
          results.errors.push(`Failed to analyze ${stock.tickerCode}: ${error.message}`)
        }
      }

      // レート制限対策：バッチ間で1秒待機
      if (i + batchSize < allStocks.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    }

    console.log(`✅ Featured stocks generation completed`)
    console.log(`   - Added to master: ${results.added_to_master}`)
    console.log(`   - Analyzed: ${results.analyzed_count}`)
    console.log(`   - Featured stocks: ${results.featured_count}`)
    console.log(`   - Errors: ${results.error_count}`)

    return NextResponse.json({
      success: true,
      ...results,
    })
  } catch (error: any) {
    console.error("Error generating featured stocks from news:", error)
    return NextResponse.json(
      { error: "Failed to generate featured stocks", details: error.message },
      { status: 500 }
    )
  }
}
