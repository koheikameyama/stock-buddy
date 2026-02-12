#!/usr/bin/env npx tsx
/**
 * 古いデータを定期削除するスクリプト
 *
 * 削除対象:
 * - StockAnalysis: 1週間より古いデータ
 *
 * 週1回（日曜日）に実行を想定
 */

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function cleanupOldData(): Promise<void> {
  try {
    // 削除基準日（1週間前）
    const oneWeekAgo = new Date()
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)

    console.log(`Cleanup started at ${new Date().toISOString()}`)
    console.log(`1 week ago: ${oneWeekAgo.toISOString().split("T")[0]}`)
    console.log("-".repeat(50))

    let totalDeleted = 0

    // StockAnalysis（1週間より古いデータ）
    console.log("\n[1/1] Cleaning up StockAnalysis...")

    const countBefore = await prisma.stockAnalysis.count({
      where: {
        analyzedAt: {
          lt: oneWeekAgo,
        },
      },
    })
    console.log(`  Records to delete: ${countBefore}`)

    if (countBefore > 0) {
      const result = await prisma.stockAnalysis.deleteMany({
        where: {
          analyzedAt: {
            lt: oneWeekAgo,
          },
        },
      })
      totalDeleted += result.count
      console.log(`  Deleted: ${result.count} records`)
    }

    console.log("\n" + "=".repeat(50))
    console.log(`Total deleted: ${totalDeleted} records`)
    console.log("Cleanup completed successfully!")
  } catch (error) {
    console.error(`Error during cleanup: ${error}`)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

cleanupOldData()

export {}
