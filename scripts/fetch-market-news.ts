#!/usr/bin/env tsx
/**
 * 市場ニュース取得バッチスクリプト
 *
 * 使い方:
 * npm run fetch-news
 *
 * または直接実行:
 * tsx scripts/fetch-market-news.ts
 */

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

interface NewsResult {
  title: string
  content: string
  url?: string
  published_date?: string
}

/**
 * Tavily APIでニュースを取得
 */
async function fetchNewsFromTavily(): Promise<NewsResult[]> {
  const apiKey = process.env.TAVILY_API_KEY

  if (!apiKey) {
    console.log("⚠️  TAVILY_API_KEY が設定されていません。ニュース取得をスキップします。")
    return []
  }

  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: apiKey,
        query: "日本株 市場動向 最新ニュース",
        search_depth: "basic",
        max_results: 10,
        include_domains: ["nikkei.com", "kabutan.jp", "jp.reuters.com"],
      }),
    })

    if (!response.ok) {
      console.error("❌ Tavily API エラー:", response.status)
      return []
    }

    const data = await response.json()
    return data.results || []
  } catch (error) {
    console.error("❌ ニュース取得エラー:", error)
    return []
  }
}

/**
 * AIでセクターと感情を分析
 */
async function analyzeNewsWithAI(
  title: string,
  content: string
): Promise<{ sector: string | null; sentiment: string }> {
  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    return { sector: null, sentiment: "neutral" }
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `以下のニュースを分析して、関連セクターと感情を判定してください。

セクター候補:
- 輸送用機器
- 電気機器
- 情報・通信業
- 銀行業
- 医薬品
- 小売業
- 食料品
- 建設業
- 不動産業
- 化学
- 機械
- 鉄鋼
- 石油・石炭製品
- 海運業
- 証券、商品先物取引業
- その他製品
- 全般（市場全体に関連）

感情:
- positive: ポジティブなニュース（株価上昇要因）
- negative: ネガティブなニュース（株価下落要因）
- neutral: 中立的なニュース

JSON形式で返してください：
{
  "sector": "セクター名 or null",
  "sentiment": "positive | negative | neutral"
}`,
          },
          {
            role: "user",
            content: `タイトル: ${title}\n\n内容: ${content.substring(0, 500)}`,
          },
        ],
        temperature: 0.3,
      }),
    })

    if (!response.ok) {
      return { sector: null, sentiment: "neutral" }
    }

    const data = await response.json()
    const result = JSON.parse(data.choices[0].message.content)
    return result
  } catch (error) {
    console.error("⚠️  AI分析エラー:", error)
    return { sector: null, sentiment: "neutral" }
  }
}

/**
 * メイン処理
 */
async function main() {
  console.log("🚀 市場ニュース取得バッチを開始します")

  // 1. ニュースを取得
  console.log("\n📰 ニュースを取得中...")
  const newsResults = await fetchNewsFromTavily()

  if (newsResults.length === 0) {
    console.log("⚠️  取得できたニュースがありません")
    return
  }

  console.log(`✅ ${newsResults.length}件のニュースを取得しました`)

  // 2. 既存ニュースと重複チェック
  const existingUrls = await prisma.marketNews.findMany({
    where: {
      url: {
        in: newsResults.map((n) => n.url).filter((u): u is string => !!u),
      },
    },
    select: { url: true },
  })

  const existingUrlSet = new Set(existingUrls.map((n) => n.url))
  const newNews = newsResults.filter((n) => n.url && !existingUrlSet.has(n.url))

  if (newNews.length === 0) {
    console.log("✅ 新しいニュースはありません（既存のニュースのみ）")
    return
  }

  console.log(`\n🔍 ${newNews.length}件の新しいニュースを分析中...`)

  // 3. AIで分析してDBに保存
  let savedCount = 0

  for (const news of newNews) {
    try {
      // AI分析
      const analysis = await analyzeNewsWithAI(news.title, news.content)

      // DB保存
      await prisma.marketNews.create({
        data: {
          title: news.title,
          content: news.content.substring(0, 2000), // 最大2000文字
          url: news.url,
          source: "tavily",
          sector: analysis.sector,
          sentiment: analysis.sentiment,
          publishedAt: news.published_date
            ? new Date(news.published_date)
            : new Date(),
        },
      })

      savedCount++
      console.log(
        `  ✓ ${news.title.substring(0, 50)}... [${analysis.sector || "全般"}/${analysis.sentiment}]`
      )

      // API Rate Limit対策: 少し待機
      await new Promise((resolve) => setTimeout(resolve, 500))
    } catch (error) {
      console.error(`  ✗ エラー:`, error)
    }
  }

  console.log(`\n✅ ${savedCount}件のニュースを保存しました`)

  // 4. 古いニュースを削除（30日以上前）
  const deleteResult = await prisma.marketNews.deleteMany({
    where: {
      publishedAt: {
        lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      },
    },
  })

  if (deleteResult.count > 0) {
    console.log(`\n🗑️  ${deleteResult.count}件の古いニュースを削除しました`)
  }

  console.log("\n✨ バッチ処理が完了しました")
}

// 実行
main()
  .catch((error) => {
    console.error("❌ エラーが発生しました:", error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
