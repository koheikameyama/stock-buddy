#!/usr/bin/env npx tsx
/**
 * JPX（日本取引所グループ）から新規上場・上場廃止銘柄をスクレイピング
 *
 * 実行方法:
 *   npx tsx scripts/jpx/scrape-stocks.ts
 *
 * 出力:
 *   scripts/jpx/jpx_stocks.json
 */

import * as cheerio from "cheerio"
import * as fs from "fs"
import * as path from "path"

interface StockData {
  ticker: string
  name: string
  sector: string | null
  listedDate?: string | null
  delistedDate?: string | null
  source: "new_listing" | "delisted"
}

function parseJapaneseDate(dateStr: string): string | null {
  /**
   * 日本語の日付を ISO 8601 形式に変換
   * 例: "2025年2月1日" -> "2025-02-01"
   */
  try {
    if (dateStr.includes("年") && dateStr.includes("月")) {
      const cleaned = dateStr.replace("年", "-").replace("月", "-").replace("日", "")
      const parts = cleaned.split("-")
      if (parts.length >= 3) {
        const year = parts[0].trim()
        const month = parts[1].trim().padStart(2, "0")
        const day = parts[2].trim().padStart(2, "0")
        return `${year}-${month}-${day}`
      }
    }
    return null
  } catch {
    return null
  }
}

async function scrapeNewListings(): Promise<StockData[]> {
  const url = "https://www.jpx.co.jp/listing/stocks/new/index.html"

  try {
    console.log(`Fetching new listings from: ${url}`)
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    })

    if (!response.ok) {
      console.log(`Error fetching new listings: ${response.status}`)
      return []
    }

    const html = await response.text()
    const $ = cheerio.load(html)
    const stocks: StockData[] = []

    // JPXのHTMLテーブル構造に応じて解析
    $("table tr").each((_, row) => {
      const cols = $(row).find("td")
      if (cols.length >= 3) {
        try {
          const tickerText = $(cols[0]).text().trim()
          const name = $(cols[1]).text().trim()
          const dateText = cols.length > 2 ? $(cols[2]).text().trim() : null
          const sector = cols.length > 3 ? $(cols[3]).text().trim() : null

          // ティッカーコードを抽出
          let ticker = tickerText.split(/\s+/)[0]

          if (ticker && name) {
            // .T サフィックスを追加
            if (!ticker.endsWith(".T")) {
              ticker = `${ticker}.T`
            }

            const listedDate = dateText ? parseJapaneseDate(dateText) : null

            stocks.push({
              ticker,
              name,
              sector: sector || "その他",
              listedDate,
              source: "new_listing",
            })
          }
        } catch (error) {
          console.log(`Error parsing row: ${error}`)
        }
      }
    })

    console.log(`Found ${stocks.length} new listings`)
    return stocks
  } catch (error) {
    console.log(`Error fetching new listings: ${error}`)
    return []
  }
}

async function scrapeDelistedStocks(): Promise<StockData[]> {
  const url = "https://www.jpx.co.jp/listing/stocks/delisted/index.html"

  try {
    console.log(`Fetching delisted stocks from: ${url}`)
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    })

    if (!response.ok) {
      console.log(`Error fetching delisted stocks: ${response.status}`)
      return []
    }

    const html = await response.text()
    const $ = cheerio.load(html)
    const stocks: StockData[] = []

    // JPXのHTMLテーブル構造に応じて解析
    $("table tr").each((_, row) => {
      const cols = $(row).find("td")
      if (cols.length >= 3) {
        try {
          const tickerText = $(cols[0]).text().trim()
          const name = $(cols[1]).text().trim()
          const dateText = cols.length > 2 ? $(cols[2]).text().trim() : null

          // ティッカーコードを抽出
          let ticker = tickerText.split(/\s+/)[0]

          if (ticker && name) {
            // .T サフィックスを追加
            if (!ticker.endsWith(".T")) {
              ticker = `${ticker}.T`
            }

            const delistedDate = dateText ? parseJapaneseDate(dateText) : null

            stocks.push({
              ticker,
              name,
              sector: null,
              delistedDate,
              source: "delisted",
            })
          }
        } catch (error) {
          console.log(`Error parsing row: ${error}`)
        }
      }
    })

    console.log(`Found ${stocks.length} delisted stocks`)
    return stocks
  } catch (error) {
    console.log(`Error fetching delisted stocks: ${error}`)
    return []
  }
}

async function main(): Promise<void> {
  console.log("=".repeat(60))
  console.log("JPX Stock Scraper")
  console.log("=".repeat(60))
  console.log()

  // 新規上場銘柄を取得
  const newListings = await scrapeNewListings()
  console.log()

  // 上場廃止銘柄を取得
  const delistedStocks = await scrapeDelistedStocks()
  console.log()

  // データを統合
  let allStocks = [...newListings, ...delistedStocks]

  // 重複除去
  const seenTickers = new Set<string>()
  const uniqueStocks: StockData[] = []
  for (const stock of allStocks) {
    if (stock.ticker && !seenTickers.has(stock.ticker)) {
      seenTickers.add(stock.ticker)
      uniqueStocks.push(stock)
    }
  }

  if (allStocks.length !== uniqueStocks.length) {
    console.log(`Removed ${allStocks.length - uniqueStocks.length} duplicates`)
  }

  allStocks = uniqueStocks

  if (allStocks.length === 0) {
    console.log("No data retrieved. This might be due to:")
    console.log("   - JPX website structure has changed")
    console.log("   - Network issues")
    console.log("   - No new/delisted stocks currently listed")
    console.log()
    console.log("Creating empty output file...")
  }

  // JSONに保存
  const outputPath = path.join(__dirname, "jpx_stocks.json")
  fs.writeFileSync(outputPath, JSON.stringify(allStocks, null, 2), "utf-8")
  console.log(`Data saved to: ${outputPath}`)

  console.log()
  console.log("=".repeat(60))
  console.log("Summary:")
  console.log(`  New listings: ${newListings.length}`)
  console.log(`  Delisted: ${delistedStocks.length}`)
  console.log(`  Total: ${allStocks.length}`)
  console.log("=".repeat(60))
}

main()

export {}
