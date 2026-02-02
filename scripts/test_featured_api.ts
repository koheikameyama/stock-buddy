/**
 * Test script for featured stocks generation API
 * Run with: npx tsx scripts/test_featured_api.ts
 */

import { prisma } from "../lib/prisma"

async function testFeaturedStocksGeneration() {
  console.log("🧪 Testing Featured Stocks Generation API Logic\n")

  // Check if stocks exist in database
  const tickers = ["7203.T", "6758.T", "9984.T", "8306.T"]

  console.log("📊 Checking stocks in database:")
  for (const ticker of tickers) {
    const stock = await prisma.stock.findUnique({
      where: { tickerCode: ticker },
      select: { id: true, tickerCode: true, name: true },
    })

    if (stock) {
      console.log(`  ✅ ${ticker}: ${stock.name}`)
    } else {
      console.log(`  ❌ ${ticker}: Not found`)
    }
  }

  // Check FeaturedStock table
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  console.log("\n📊 Checking existing featured stocks for today:")
  const existingFeatured = await prisma.featuredStock.findMany({
    where: {
      date: {
        gte: today,
        lt: new Date(today.getTime() + 24 * 60 * 60 * 1000),
      },
    },
    include: {
      stock: {
        select: { tickerCode: true, name: true },
      },
    },
  })

  if (existingFeatured.length === 0) {
    console.log("  No featured stocks for today yet")
  } else {
    existingFeatured.forEach((fs) => {
      console.log(`  - ${fs.stock.tickerCode} (${fs.stock.name}): ${fs.category}, score=${fs.score}`)
    })
  }

  console.log("\n✅ Test completed")
}

testFeaturedStocksGeneration()
  .catch((error) => {
    console.error("❌ Error:", error)
    process.exit(1)
  })
  .finally(() => {
    prisma.$disconnect()
  })
