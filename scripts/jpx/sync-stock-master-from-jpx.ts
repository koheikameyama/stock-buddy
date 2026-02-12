#!/usr/bin/env npx tsx
/**
 * JPX公式から全銘柄マスタを同期
 *
 * JPXの公式サイトから東証上場銘柄一覧（Excelファイル）をダウンロードし、
 * 全銘柄のマスタデータをPostgreSQLに同期する。
 *
 * 実行方法:
 *   npx tsx scripts/jpx/sync-stock-master-from-jpx.ts
 */

import { PrismaClient } from "@prisma/client"
import * as XLSX from "xlsx"

const prisma = new PrismaClient()

// JPXの東証上場銘柄一覧Excelファイル
const JPX_EXCEL_URL = "https://www.jpx.co.jp/markets/statistics-equities/misc/tvdivq0000001vg2-att/data_j.xls"

interface StockData {
  ticker: string
  name: string
  market: string
  sector: string | null
}

async function downloadJpxExcel(): Promise<ArrayBuffer> {
  console.log(`Downloading JPX stock list from: ${JPX_EXCEL_URL}`)

  const response = await fetch(JPX_EXCEL_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to download: ${response.status} ${response.statusText}`)
  }

  const buffer = await response.arrayBuffer()
  console.log(`Downloaded ${buffer.byteLength.toLocaleString()} bytes`)
  return buffer
}

function parseJpxExcel(excelData: ArrayBuffer): StockData[] {
  console.log("Parsing Excel file...")

  const workbook = XLSX.read(excelData, { type: "array" })
  const sheetName = workbook.SheetNames[0]
  const worksheet = workbook.Sheets[sheetName]

  // シートをJSONに変換
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet)

  console.log(`Found ${rows.length} rows in Excel`)

  if (rows.length > 0) {
    console.log(`Columns: ${Object.keys(rows[0]).join(", ")}`)
  }

  const stocks: StockData[] = []

  for (const row of rows) {
    try {
      // コードカラムを探す
      let tickerCode: string | null = null
      for (const col of ["コード", "銘柄コード", "Code", "ticker"]) {
        if (col in row && row[col]) {
          tickerCode = String(row[col]).trim()
          break
        }
      }

      // 銘柄名カラムを探す
      let stockName: string | null = null
      for (const col of ["銘柄名", "会社名", "Name", "name"]) {
        if (col in row && row[col]) {
          stockName = String(row[col]).trim()
          break
        }
      }

      // 市場区分カラムを探す
      let market = "TSE"
      for (const col of ["市場・商品区分", "市場", "Market"]) {
        if (col in row && row[col]) {
          const marketStr = String(row[col]).trim()
          if (marketStr.includes("プライム") || marketStr.includes("スタンダード") || marketStr.includes("グロース")) {
            market = "TSE"
          }
          break
        }
      }

      // 業種カラムを探す
      let sector: string | null = null
      for (const col of ["33業種区分", "業種", "Sector", "業種名"]) {
        if (col in row && row[col]) {
          const sectorVal = String(row[col]).trim()
          if (sectorVal && sectorVal !== "nan") {
            sector = sectorVal
            break
          }
        }
      }

      // バリデーション
      if (!tickerCode || tickerCode === "nan") continue
      if (!stockName || stockName === "nan") continue

      // 数値のみのコードに .T を付与
      if (/^\d+$/.test(tickerCode)) {
        tickerCode = `${tickerCode}.T`
      }

      stocks.push({
        ticker: tickerCode,
        name: stockName,
        market,
        sector: sector && sector !== "nan" ? sector : null,
      })
    } catch (error) {
      console.log(`Error parsing row: ${error}`)
      continue
    }
  }

  console.log(`Parsed ${stocks.length} valid stocks`)
  return stocks
}

async function upsertStocksToDb(stocks: StockData[]): Promise<{ added: number; updated: number }> {
  if (stocks.length === 0) {
    console.log("No stocks to upsert")
    return { added: 0, updated: 0 }
  }

  console.log(`\nUpserting ${stocks.length} stocks to database...`)

  let added = 0
  let updated = 0

  // バッチ処理（100件ずつ）
  const batchSize = 100

  for (let i = 0; i < stocks.length; i += batchSize) {
    const batch = stocks.slice(i, i + batchSize)

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
          market: s.market,
          sector: s.sector,
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
          market: stock.market || undefined,
          sector: stock.sector || undefined,
        },
      })
      updated++
    }

    console.log(`  Batch ${Math.floor(i / batchSize) + 1}: ${toCreate.length} added, ${toUpdate.length} updated`)
  }

  return { added, updated }
}

async function main(): Promise<void> {
  console.log("=".repeat(60))
  console.log("JPX Stock Master Sync")
  console.log("=".repeat(60))
  console.log()

  try {
    // 1. JPXからExcelをダウンロード
    const excelData = await downloadJpxExcel()
    console.log()

    // 2. Excelをパース
    const stocks = parseJpxExcel(excelData)
    console.log()

    if (stocks.length === 0) {
      console.log("No stocks found in Excel file")
      process.exit(1)
    }

    // 3. DBにUPSERT
    const stats = await upsertStocksToDb(stocks)

    console.log()
    console.log("=".repeat(60))
    console.log("Summary:")
    console.log(`  Added: ${stats.added}`)
    console.log(`  Updated: ${stats.updated}`)
    console.log(`  Total: ${stocks.length}`)
    console.log("=".repeat(60))
    console.log()
    console.log("Stock master sync completed successfully!")
  } catch (error) {
    console.error(`Error: ${error}`)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()

export {}
