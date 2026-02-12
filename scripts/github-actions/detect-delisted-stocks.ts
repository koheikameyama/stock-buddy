#!/usr/bin/env npx tsx
/**
 * 上場廃止銘柄を検出・削除するスクリプト
 *
 * 使用方法:
 *   npx tsx scripts/github-actions/detect-delisted-stocks.ts --dry-run  # 検出のみ
 *   npx tsx scripts/github-actions/detect-delisted-stocks.ts            # 検出して削除
 */

import { PrismaClient } from "@prisma/client"
import { fetchHistoricalPrices } from "../../lib/stock-price-fetcher"

const prisma = new PrismaClient()

interface DelistedStock {
  id: string
  tickerCode: string
  name: string
  reason: string
  usage: { portfolio: number; watchlist: number; transactions: number }
  canDelete: boolean
}

async function checkIfDelisted(tickerCode: string): Promise<{ isDelisted: boolean; reason: string }> {
  try {
    // Stooq APIから1ヶ月分のデータを取得
    const historicalData = await fetchHistoricalPrices(tickerCode, "1m")

    // データがない場合は上場廃止の可能性
    if (!historicalData || historicalData.length === 0) {
      return { isDelisted: true, reason: "No price data available" }
    }

    // 直近の価格がない場合は上場廃止の可能性
    const latestPrice = historicalData[historicalData.length - 1]?.close
    if (!latestPrice) {
      return { isDelisted: true, reason: "No recent price data" }
    }

    return { isDelisted: false, reason: "Active" }
  } catch (error) {
    const errorMsg = String(error)
    if (errorMsg.toLowerCase().includes("delisted") || errorMsg.toLowerCase().includes("not found")) {
      return { isDelisted: true, reason: `Delisted: ${errorMsg}` }
    }
    // APIエラーの場合は上場廃止とみなさない（一時的なエラーの可能性）
    return { isDelisted: false, reason: `Error: ${errorMsg}` }
  }
}

async function getStockUsage(stockId: string): Promise<{ portfolio: number; watchlist: number; transactions: number }> {
  const [portfolio, watchlist, transactions] = await Promise.all([
    prisma.portfolioStock.count({ where: { stockId } }),
    prisma.watchlistStock.count({ where: { stockId } }),
    prisma.transaction.count({ where: { stockId } }),
  ])

  return { portfolio, watchlist, transactions }
}

function parseArgs(): { dryRun: boolean; limit: number } {
  const args = process.argv.slice(2)
  let dryRun = false
  let limit = 100

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dry-run") {
      dryRun = true
    } else if (args[i] === "--limit" && args[i + 1]) {
      limit = parseInt(args[++i], 10)
    }
  }

  return { dryRun, limit }
}

async function main(): Promise<void> {
  const { dryRun, limit } = parseArgs()

  try {
    // 全銘柄を取得
    console.log(`Fetching stocks to check (limit: ${limit})...`)
    const stocks = await prisma.stock.findMany({
      orderBy: { createdAt: "asc" },
      take: limit,
      select: { id: true, tickerCode: true, name: true },
    })

    console.log(`Found ${stocks.length} stocks to check\n`)

    const delistedStocks: DelistedStock[] = []
    const activeStocks: { tickerCode: string; name: string }[] = []

    for (let idx = 0; idx < stocks.length; idx++) {
      const stock = stocks[idx]
      process.stdout.write(`[${idx + 1}/${stocks.length}] Checking ${stock.tickerCode} (${stock.name})... `)

      const { isDelisted, reason } = await checkIfDelisted(stock.tickerCode)

      if (isDelisted) {
        console.log(`❌ DELISTED (${reason})`)

        const usage = await getStockUsage(stock.id)
        const totalUsage = usage.portfolio + usage.watchlist + usage.transactions

        delistedStocks.push({
          id: stock.id,
          tickerCode: stock.tickerCode,
          name: stock.name,
          reason,
          usage,
          canDelete: totalUsage === 0,
        })
      } else {
        console.log(`✅ Active (${reason})`)
        activeStocks.push({
          tickerCode: stock.tickerCode,
          name: stock.name,
        })
      }
    }

    // レポート出力
    console.log("\n" + "=".repeat(60))
    console.log("SUMMARY")
    console.log("=".repeat(60))
    console.log(`Total checked: ${stocks.length}`)
    console.log(`Active stocks: ${activeStocks.length}`)
    console.log(`Delisted stocks: ${delistedStocks.length}`)

    if (delistedStocks.length > 0) {
      console.log("\n" + "=".repeat(60))
      console.log("DELISTED STOCKS")
      console.log("=".repeat(60))

      const canDelete = delistedStocks.filter((s) => s.canDelete)
      const cannotDelete = delistedStocks.filter((s) => !s.canDelete)

      if (canDelete.length > 0) {
        console.log(`\nCan delete (${canDelete.length} stocks):`)
        for (const stock of canDelete) {
          console.log(`  - ${stock.tickerCode}: ${stock.name}`)
          console.log(`    Reason: ${stock.reason}`)
        }
      }

      if (cannotDelete.length > 0) {
        console.log(`\nCannot delete - in use (${cannotDelete.length} stocks):`)
        for (const stock of cannotDelete) {
          console.log(`  - ${stock.tickerCode}: ${stock.name}`)
          console.log(
            `    Usage: Portfolio=${stock.usage.portfolio}, ` +
              `Watchlist=${stock.usage.watchlist}, ` +
              `Transactions=${stock.usage.transactions}`
          )
        }
      }

      // 削除実行
      if (!dryRun && canDelete.length > 0) {
        console.log("\n" + "=".repeat(60))
        console.log("DELETING STOCKS")
        console.log("=".repeat(60))

        for (const stock of canDelete) {
          process.stdout.write(`Deleting ${stock.tickerCode}... `)
          await prisma.stock.delete({ where: { id: stock.id } })
          console.log("✅ Done")
        }

        console.log(`\n✅ Successfully deleted ${canDelete.length} delisted stocks`)
      } else if (dryRun) {
        console.log("\n⚠️  DRY RUN mode - no stocks were deleted")
      }
    }
  } catch (error) {
    console.error(`\n❌ Error: ${error}`)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()

export {}
