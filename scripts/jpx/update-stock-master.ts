#!/usr/bin/env npx tsx
/**
 * Stock マスタデータベース更新スクリプト
 *
 * JPXからスクレイピングした銘柄データをPostgreSQLに反映する。
 *
 * 実行方法:
 *   export PRODUCTION_DATABASE_URL="postgresql://..."
 *   npx tsx scripts/jpx/update-stock-master.ts
 *
 * 前提条件:
 *   - scripts/jpx/jpx_stocks.json が存在すること
 *   - PRODUCTION_DATABASE_URL が設定されていること
 */

import { PrismaClient } from "@prisma/client"
import * as fs from "fs"
import * as path from "path"

// PRODUCTION_DATABASE_URL を使用（設定されていない場合はDATABASE_URLを使用）
const databaseUrl = process.env.PRODUCTION_DATABASE_URL || process.env.DATABASE_URL

if (!databaseUrl) {
  console.error("ERROR: PRODUCTION_DATABASE_URL or DATABASE_URL environment variable is not set")
  process.exit(1)
}

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: databaseUrl,
    },
  },
})

interface StockData {
  ticker: string
  name: string
  sector?: string | null
  listedDate?: string | null
}

function loadJsonData(filePath: string): StockData[] {
  try {
    const data = fs.readFileSync(filePath, "utf-8")
    const stocks = JSON.parse(data) as StockData[]
    console.log(`Loaded ${stocks.length} records from ${filePath}`)
    return stocks
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      console.error(`File not found: ${filePath}`)
      console.log("Run scrape-stocks.ts first to generate the data file.")
    } else {
      console.error(`Error loading JSON: ${error}`)
    }
    process.exit(1)
  }
}

async function updateStockMaster(stocks: StockData[]): Promise<{ added: number; updated: number; errors: number }> {
  if (stocks.length === 0) {
    console.log("No stocks to update")
    return { added: 0, updated: 0, errors: 0 }
  }

  console.log("Connecting to database...")

  let added = 0
  let updated = 0
  let errors = 0

  // 重複除去
  const seenTickers = new Set<string>()
  const uniqueStocks: StockData[] = []

  for (const stock of stocks) {
    if (!stock.ticker || !stock.name) {
      console.log(`Skipping invalid record: ${JSON.stringify(stock)}`)
      errors++
      continue
    }

    if (seenTickers.has(stock.ticker)) {
      console.log(`Skipping duplicate ticker: ${stock.ticker}`)
      continue
    }
    seenTickers.add(stock.ticker)

    // listedDate の検証
    if (stock.listedDate) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/
      if (!dateRegex.test(stock.listedDate)) {
        console.log(`Invalid date format for ${stock.ticker}: ${stock.listedDate}`)
        stock.listedDate = null
      }
    }

    uniqueStocks.push(stock)
  }

  console.log(`Upserting ${uniqueStocks.length} stocks to database...`)

  // バッチ処理（100件ずつ）
  const batchSize = 100

  for (let i = 0; i < uniqueStocks.length; i += batchSize) {
    const batch = uniqueStocks.slice(i, i + batchSize)

    try {
      // 既存のtickerCodeを確認
      const tickers = batch.map((s) => s.ticker)
      const existingStocks = await prisma.stock.findMany({
        where: { tickerCode: { in: tickers } },
        select: { tickerCode: true },
      })
      const existingTickers = new Set(existingStocks.map((s) => s.tickerCode))

      // 新規追加と更新を分離
      const toCreate = batch.filter((s) => !existingTickers.has(s.ticker))
      const toUpdate = batch.filter((s) => existingTickers.has(s.ticker))

      // 新規追加
      if (toCreate.length > 0) {
        await prisma.stock.createMany({
          data: toCreate.map((s) => ({
            tickerCode: s.ticker,
            name: s.name,
            market: "東証プライム",
            sector: s.sector || "その他",
            listedDate: s.listedDate ? new Date(s.listedDate) : null,
          })),
          skipDuplicates: true,
        })
        added += toCreate.length
      }

      // 更新
      for (const stock of toUpdate) {
        await prisma.stock.update({
          where: { tickerCode: stock.ticker },
          data: {
            name: stock.name,
            sector: stock.sector || undefined,
            listedDate: stock.listedDate ? new Date(stock.listedDate) : undefined,
          },
        })
        updated++
      }

      console.log(`  Batch ${Math.floor(i / batchSize) + 1}: ${toCreate.length} added, ${toUpdate.length} updated`)
    } catch (error) {
      console.log(`Error in batch ${Math.floor(i / batchSize) + 1}: ${error}`)
      errors += batch.length
    }
  }

  console.log()
  console.log("=".repeat(60))
  console.log("Database update completed:")
  console.log(`  Added: ${added}`)
  console.log(`  Updated: ${updated}`)
  console.log(`  Errors: ${errors}`)
  console.log("=".repeat(60))

  return { added, updated, errors }
}

async function main(): Promise<void> {
  console.log("=".repeat(60))
  console.log("Stock Master Update Script")
  console.log("=".repeat(60))
  console.log()

  // JSONファイルのパス
  const jsonFile = path.join(__dirname, "jpx_stocks.json")

  // JSONデータを読み込み
  const stocks = loadJsonData(jsonFile)
  console.log()

  if (stocks.length === 0) {
    console.log("No stocks to process. Exiting.")
    return
  }

  try {
    // データベースを更新
    const stats = await updateStockMaster(stocks)

    // 終了コードを決定
    if (stats.errors > stocks.length * 0.5) {
      console.log(`\nToo many errors (${stats.errors}/${stocks.length})`)
      process.exit(1)
    }

    console.log("\nUpdate completed successfully!")
  } catch (error) {
    console.error(`Error: ${error}`)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()

export {}
