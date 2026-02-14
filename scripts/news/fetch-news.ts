#!/usr/bin/env npx tsx
/**
 * 株式関連ニュースを取得してMarketNewsテーブルに保存するスクリプト
 *
 * 機能:
 * - Google News RSSから株式関連ニュースを取得
 * - セクター・センチメント分析（ルールベース + AI）
 * - MarketNewsテーブルへの保存
 * - 話題の銘柄コード抽出
 */

import { PrismaClient } from "@prisma/client"
import OpenAI from "openai"
import Parser from "rss-parser"
import * as fs from "fs"
import * as path from "path"

const prisma = new PrismaClient()
const parser = new Parser()
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// ニュースソースURL
const RSS_URLS: Record<string, string> = {
  google_news_stock:
    "https://news.google.com/rss/search?q=日本株+OR+東証+OR+株式市場+when:7d&hl=ja&gl=JP&ceid=JP:ja",
  google_news_nikkei:
    "https://news.google.com/rss/search?q=site:nikkei.com+株+OR+銘柄+when:7d&hl=ja&gl=JP&ceid=JP:ja",
  google_news_earnings:
    "https://news.google.com/rss/search?q=決算+OR+業績+OR+増益+OR+減益+株+when:7d&hl=ja&gl=JP&ceid=JP:ja",
  google_news_tech:
    "https://news.google.com/rss/search?q=半導体+OR+AI関連+OR+テック株+when:7d&hl=ja&gl=JP&ceid=JP:ja",
  google_news_auto: "https://news.google.com/rss/search?q=自動車+OR+EV+株+when:7d&hl=ja&gl=JP&ceid=JP:ja",
  yahoo_finance_market: "https://news.yahoo.co.jp/rss/topics/business.xml",
  google_news_bloomberg:
    "https://news.google.com/rss/search?q=site:bloomberg.co.jp+株+OR+市場+when:7d&hl=ja&gl=JP&ceid=JP:ja",
  google_news_reuters:
    "https://news.google.com/rss/search?q=site:jp.reuters.com+株+OR+市場+when:7d&hl=ja&gl=JP&ceid=JP:ja",
  google_news_kabutan: "https://news.google.com/rss/search?q=site:kabutan.jp+when:7d&hl=ja&gl=JP&ceid=JP:ja",
  google_news_minkabu: "https://news.google.com/rss/search?q=site:minkabu.jp+株+when:7d&hl=ja&gl=JP&ceid=JP:ja",
  google_news_toyokeizai:
    "https://news.google.com/rss/search?q=site:toyokeizai.net+株+OR+企業+when:7d&hl=ja&gl=JP&ceid=JP:ja",
}

// フィードごとのソース名マッピング
const FEED_SOURCE_MAP: Record<string, string> = {
  google_news_stock: "google_news",
  google_news_nikkei: "nikkei",
  google_news_earnings: "google_news",
  google_news_tech: "google_news",
  google_news_auto: "google_news",
  yahoo_finance_market: "yahoo_finance",
  google_news_bloomberg: "bloomberg",
  google_news_reuters: "reuters",
  google_news_kabutan: "kabutan",
  google_news_minkabu: "minkabu",
  google_news_toyokeizai: "toyokeizai",
}

// セクター分類キーワード
const SECTOR_KEYWORDS: Record<string, string[]> = {
  "半導体・電子部品": ["半導体", "電子部品", "チップ", "DRAM", "NAND", "フラッシュメモリ"],
  自動車: ["自動車", "トヨタ", "ホンダ", "日産", "マツダ", "スバル", "EV", "電気自動車"],
  金融: ["銀行", "証券", "保険", "金融", "メガバンク", "地銀", "信託"],
  医薬品: ["製薬", "医薬品", "新薬", "治験", "バイオ", "創薬"],
  通信: ["通信", "NTT", "KDDI", "ソフトバンク", "5G", "携帯"],
  小売: ["小売", "百貨店", "コンビニ", "EC", "通販", "スーパー"],
  不動産: ["不動産", "マンション", "オフィス", "REIT", "商業施設"],
  エネルギー: ["石油", "ガス", "電力", "エネルギー", "再生可能", "太陽光"],
  素材: ["鉄鋼", "化学", "素材", "建材", "セメント"],
  "IT・サービス": ["IT", "ソフトウェア", "クラウド", "AI", "DX", "SaaS"],
}

// センチメント分類キーワード
const SENTIMENT_KEYWORDS: Record<string, string[]> = {
  positive: ["急騰", "上昇", "好調", "最高益", "増益", "買い", "強気", "上方修正", "好決算"],
  negative: ["急落", "下落", "減益", "赤字", "売り", "弱気", "懸念", "下方修正", "不調"],
  neutral: ["横ばい", "様子見", "保ち合い", "変わらず", "据え置き"],
}

interface RssEntry {
  title: string
  link: string
  contentSnippet?: string
  pubDate?: string
}

function extractStockCodes(text: string): Set<string> {
  const pattern = /\b([1-9][0-9]{3})\b/g
  const matches = text.match(pattern) || []
  const stockCodes = new Set<string>()

  for (const code of matches) {
    const num = parseInt(code, 10)
    if (num >= 1000 && num <= 9999) {
      stockCodes.add(code)
    }
  }

  return stockCodes
}

function detectSectorByKeywords(text: string): string | null {
  const textLower = text.toLowerCase()

  for (const [sector, keywords] of Object.entries(SECTOR_KEYWORDS)) {
    for (const keyword of keywords) {
      if (textLower.includes(keyword.toLowerCase())) {
        return sector
      }
    }
  }

  return null
}

function detectSentimentByKeywords(text: string): string | null {
  const textLower = text.toLowerCase()

  for (const [sentiment, keywords] of Object.entries(SENTIMENT_KEYWORDS)) {
    for (const keyword of keywords) {
      if (textLower.includes(keyword.toLowerCase())) {
        return sentiment
      }
    }
  }

  return null
}

async function analyzeWithOpenAI(title: string, content: string): Promise<{ sector: string | null; sentiment: string | null; isStockRelated: boolean }> {
  try {
    if (!process.env.OPENAI_API_KEY) {
      console.log("OPENAI_API_KEY not found, skipping AI analysis")
      return { sector: null, sentiment: null, isStockRelated: true }
    }

    const prompt = `以下のニュースを分析してください。

タイトル: ${title}
内容: ${content}

以下の3項目を判定してください:
1. is_stock_related: このニュースが株式・投資・金融市場に関連するかどうか（true/false）
   - 株価、企業業績、市場動向、経済指標、金融政策などに関するニュースはtrue
   - スポーツ、芸能、事件、天気など株式市場と無関係なニュースはfalse
2. sector: セクター（半導体・電子部品、自動車、金融、医薬品、通信、小売、不動産、エネルギー、素材、IT・サービス、またはnull）
3. sentiment: センチメント（positive、neutral、negative、またはnull）`

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "news_analysis",
          strict: true,
          schema: {
            type: "object",
            properties: {
              is_stock_related: { type: "boolean" },
              sector: { type: ["string", "null"] },
              sentiment: { type: ["string", "null"], enum: ["positive", "neutral", "negative", null] },
            },
            required: ["is_stock_related", "sector", "sentiment"],
            additionalProperties: false,
          },
        },
      },
    })

    const result = JSON.parse(response.choices[0].message.content || "{}")
    return {
      sector: result.sector || null,
      sentiment: result.sentiment || null,
      isStockRelated: result.is_stock_related ?? true,
    }
  } catch (error) {
    console.log(`OpenAI API error: ${error}`)
    return { sector: null, sentiment: null, isStockRelated: true }
  }
}

async function fetchRssFeed(url: string): Promise<RssEntry[]> {
  try {
    console.log(`Fetching RSS from ${url}`)
    const feed = await parser.parseURL(url)

    const entries: RssEntry[] = feed.items.map((item) => ({
      title: item.title || "",
      link: item.link || "",
      contentSnippet: item.contentSnippet || "",
      pubDate: item.pubDate || "",
    }))

    console.log(`Fetched ${entries.length} entries`)
    return entries
  } catch (error) {
    console.log(`Error fetching RSS: ${error}`)
    return []
  }
}

function filterRecentEntries(entries: RssEntry[], days: number = 7): RssEntry[] {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - days)

  return entries.filter((entry) => {
    if (!entry.pubDate) return false
    const entryDate = new Date(entry.pubDate)
    return entryDate >= cutoffDate
  })
}

async function main(): Promise<void> {
  console.log("=".repeat(60))
  console.log("JPX News & Stock Code Extraction Script (TypeScript)")
  console.log("=".repeat(60))

  const allStockCodes = new Set<string>()
  const allEntries: { feed: string; title: string; link: string; stockCodes: string[]; published: string }[] = []
  const newsToSave: {
    title: string
    content: string
    url: string
    source: string
    sector: string | null
    sentiment: string | null
    publishedAt: Date
    market: string
    region: string
  }[] = []

  let ruleBasedCount = 0
  let aiBasedCount = 0
  let skippedCount = 0

  try {
    // 各RSSフィードを取得
    for (const [feedName, url] of Object.entries(RSS_URLS)) {
      console.log(`\nProcessing feed: ${feedName}`)
      const entries = await fetchRssFeed(url)

      // 直近7日間のエントリのみを対象
      const recentEntries = filterRecentEntries(entries, 7)
      console.log(`Recent entries (last 7 days): ${recentEntries.length}`)

      for (const entry of recentEntries) {
        const text = `${entry.title} ${entry.contentSnippet || ""}`

        // 銘柄コード抽出
        const stockCodes = extractStockCodes(text)
        if (stockCodes.size > 0) {
          const codesArray = Array.from(stockCodes)
          for (const code of codesArray) {
            allStockCodes.add(code)
          }
          allEntries.push({
            feed: feedName,
            title: entry.title,
            link: entry.link,
            stockCodes: codesArray,
            published: entry.pubDate || "",
          })
        }

        // 重複チェック
        const existing = await prisma.marketNews.findFirst({
          where: {
            title: entry.title,
            url: entry.link,
          },
        })

        if (existing) continue

        // セクター・センチメント分析（ルールベース）
        let sector = detectSectorByKeywords(text)
        let sentiment = detectSentimentByKeywords(text)

        // ルールベースで判定できなかった場合はAI分析
        if (sector === null || sentiment === null) {
          const aiResult = await analyzeWithOpenAI(entry.title, entry.contentSnippet || "")

          // セクターがルールベースで検出できず、AIも株式関連でないと判断した場合はスキップ
          if (sector === null && !aiResult.isStockRelated) {
            skippedCount++
            console.log(`  Skipped (not stock-related): ${entry.title}`)
            continue
          }

          if (sector === null) sector = aiResult.sector
          if (sentiment === null) sentiment = aiResult.sentiment
          aiBasedCount++
        } else {
          ruleBasedCount++
        }

        // 保存用データに追加
        const publishedAt = entry.pubDate ? new Date(entry.pubDate) : new Date()
        const sourceName = FEED_SOURCE_MAP[feedName] || "google_news"

        newsToSave.push({
          title: entry.title,
          content: entry.contentSnippet || "",
          url: entry.link,
          source: sourceName,
          sector,
          sentiment,
          publishedAt,
          market: "JP",
          region: "日本",
        })
      }
    }

    // ニュースをデータベースに保存
    if (newsToSave.length > 0) {
      console.log(`\nAnalyzing ${newsToSave.length} new entries...`)
      console.log(`  Rule-based: ${ruleBasedCount} entries`)
      console.log(`  AI-based: ${aiBasedCount} entries`)
      console.log(`  Skipped (not stock-related): ${skippedCount} entries`)

      // バッチ作成
      const created = await prisma.marketNews.createMany({
        data: newsToSave,
        skipDuplicates: true,
      })

      console.log(`Saved ${created.count} news to database`)
    }

    // 結果を表示
    console.log(`\n${"=".repeat(60)}`)
    console.log("Summary")
    console.log("=".repeat(60))
    console.log(`Total unique stock codes found: ${allStockCodes.size}`)
    console.log(`Stock codes: ${Array.from(allStockCodes).sort().join(", ")}`)

    console.log(`\nNews entries with stock codes:`)
    for (const entry of allEntries) {
      console.log(`\n  - ${entry.title}`)
      console.log(`    Codes: ${entry.stockCodes.join(", ")}`)
      console.log(`    Link: ${entry.link}`)
      console.log(`    Date: ${entry.published}`)
    }

    // 銘柄コードをJSON形式で出力
    const outputFile = path.join(__dirname, "trending_stock_codes.json")
    fs.writeFileSync(
      outputFile,
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          stock_codes: Array.from(allStockCodes).sort(),
          news_count: allEntries.length,
        },
        null,
        2
      )
    )

    console.log(`\nStock codes saved to ${outputFile}`)
  } catch (error) {
    console.error(`Error: ${error}`)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()

export {}
