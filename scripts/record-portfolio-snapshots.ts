#!/usr/bin/env tsx
/**
 * ポートフォリオスナップショット記録スクリプト
 *
 * 全ユーザーのポートフォリオの評価額を記録し、日次スナップショットを作成する。
 * 毎日市場クローズ後に実行される（GitHub Actions経由）。
 *
 * 使い方:
 * npm run record-snapshots
 */

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

interface StockPrice {
  tickerCode: string
  close: number
}

/**
 * 最新の株価を取得
 */
async function getLatestPrices(): Promise<Map<string, number>> {
  const latestPrices = await prisma.$queryRaw<StockPrice[]>`
    SELECT DISTINCT ON ("Stock"."tickerCode")
      "Stock"."tickerCode",
      "StockPrice"."close"::float as close
    FROM "Stock"
    INNER JOIN "StockPrice" ON "Stock".id = "StockPrice"."stockId"
    ORDER BY "Stock"."tickerCode", "StockPrice"."date" DESC
  `

  const priceMap = new Map<string, number>()
  for (const price of latestPrices) {
    priceMap.set(price.tickerCode, price.close)
  }

  return priceMap
}

/**
 * ポートフォリオの評価額を計算
 */
function calculatePortfolioValue(
  stocks: Array<{ tickerCode: string; quantity: number; averagePrice: string }>,
  priceMap: Map<string, number>
): {
  totalValue: number
  totalCost: number
  gainLoss: number
  gainLossPct: number
} {
  let totalValue = 0
  let totalCost = 0

  for (const stock of stocks) {
    const currentPrice = priceMap.get(stock.tickerCode) || 0
    const avgPrice = Number(stock.averagePrice)

    totalValue += currentPrice * stock.quantity
    totalCost += avgPrice * stock.quantity
  }

  const gainLoss = totalValue - totalCost
  const gainLossPct = totalCost > 0 ? (gainLoss / totalCost) * 100 : 0

  return {
    totalValue,
    totalCost,
    gainLoss,
    gainLossPct,
  }
}

/**
 * メイン処理
 */
async function main() {
  console.log("🚀 ポートフォリオスナップショット記録を開始します\n")

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // 最新の株価を取得
  console.log("📊 最新の株価を取得中...")
  const priceMap = await getLatestPrices()
  console.log(`✓ ${priceMap.size}銘柄の株価を取得しました\n`)

  // 全ポートフォリオを取得
  const portfolios = await prisma.portfolio.findMany({
    where: { isActive: true },
    include: {
      user: { select: { name: true, email: true } },
      stocks: {
        include: {
          stock: { select: { tickerCode: true } },
        },
      },
    },
  })

  console.log(`📂 対象ポートフォリオ: ${portfolios.length}件\n`)

  let createdCount = 0
  let skippedCount = 0
  let errorCount = 0

  for (const portfolio of portfolios) {
    try {
      // 今日のスナップショットが既に存在するかチェック
      const existing = await prisma.portfolioSnapshot.findUnique({
        where: {
          portfolioId_date: {
            portfolioId: portfolio.id,
            date: today,
          },
        },
      })

      if (existing) {
        console.log(`⏭️  ${portfolio.user.name}: 今日のスナップショットは既に存在します`)
        skippedCount++
        continue
      }

      // 保有銘柄がない場合はスキップ
      if (portfolio.stocks.length === 0) {
        console.log(`⏭️  ${portfolio.user.name}: 保有銘柄がありません`)
        skippedCount++
        continue
      }

      // 評価額を計算
      const stocksWithPrices = portfolio.stocks.map((ps) => ({
        tickerCode: ps.stock.tickerCode,
        quantity: ps.quantity,
        averagePrice: ps.averagePrice.toString(),
      }))

      const { totalValue, totalCost, gainLoss, gainLossPct } =
        calculatePortfolioValue(stocksWithPrices, priceMap)

      // スナップショットを作成
      await prisma.portfolioSnapshot.create({
        data: {
          portfolioId: portfolio.id,
          date: today,
          totalValue,
          totalCost,
          gainLoss,
          gainLossPct,
        },
      })

      console.log(`✓ ${portfolio.user.name}: スナップショットを作成しました`)
      console.log(
        `  評価額: ${totalValue.toLocaleString()}円 | 損益: ${gainLoss > 0 ? "+" : ""}${gainLoss.toLocaleString()}円 (${gainLossPct > 0 ? "+" : ""}${gainLossPct.toFixed(2)}%)\n`
      )
      createdCount++
    } catch (error) {
      console.error(`✗ ${portfolio.user.name}: エラーが発生しました`, error)
      errorCount++
    }
  }

  console.log(`\n✅ 処理完了`)
  console.log(`  作成: ${createdCount}件`)
  console.log(`  スキップ: ${skippedCount}件`)
  console.log(`  エラー: ${errorCount}件`)
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
