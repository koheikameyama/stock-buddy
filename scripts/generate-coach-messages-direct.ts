/**
 * Generate Daily Coach Messages (Direct Database)
 *
 * This script generates personalized daily messages for all users.
 * Runs directly against the database without needing the Next.js server.
 *
 * Usage:
 *   DATABASE_URL=xxx tsx scripts/generate-coach-messages-direct.ts
 */

import { PrismaClient, Prisma } from "@prisma/client"

const prisma = new PrismaClient()

async function generateCoachMessages() {
  try {
    console.log("🤖 Generating daily coach messages...")

    const users = await prisma.user.findMany({
      include: {
        portfolio: {
          include: {
            stocks: {
              include: {
                stock: true,
              },
            },
            snapshots: {
              orderBy: { date: "desc" },
              take: 2, // Today and yesterday
            },
          },
        },
        settings: true,
      },
    })

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    let generatedCount = 0

    for (const user of users) {
      // Skip if message already exists for today
      const existingMessage = await prisma.coachMessage.findUnique({
        where: {
          userId_date: {
            userId: user.id,
            date: today,
          },
        },
      })

      if (existingMessage) {
        console.log(`  ⏭️  User ${user.email}: Message already exists`)
        continue
      }

      const hasPortfolio = !!user.portfolio
      const stockCount = user.portfolio?.stocks.length || 0
      const latestSnapshot = user.portfolio?.snapshots[0]
      const previousSnapshot = user.portfolio?.snapshots[1]

      let message: string
      let type: string

      // Generate message based on user status
      if (!hasPortfolio) {
        // New user - encouragement to start
        message = generateNewUserMessage(user.name)
        type = "encouragement"
      } else if (stockCount === 0) {
        // Portfolio exists but no stocks yet
        message = "ポートフォリオは作成済みですね。そろそろ最初の一歩を踏み出してみませんか？焦らず、自分のペースで大丈夫ですよ。"
        type = "encouragement"
      } else {
        // Has portfolio with stocks
        if (latestSnapshot && previousSnapshot) {
          const gainChange = Number(latestSnapshot.gainLossPct) - Number(previousSnapshot.gainLossPct)
          message = generateExistingInvestorMessage(user.name, stockCount, latestSnapshot, gainChange)
          type = gainChange > 0 ? "encouragement" : "advice"
        } else {
          message = `${user.name?.split(" ")[0]}さん、${stockCount}銘柄を一緒に見守っていますね。今日も市場の動きをチェックしましょう。`
          type = "advice"
        }
      }

      // Create coach message
      await prisma.coachMessage.create({
        data: {
          userId: user.id,
          date: today,
          message,
          type,
        },
      })

      console.log(`  ✅ User ${user.email}: Generated "${type}" message`)
      generatedCount++
    }

    console.log(`\n✅ Successfully generated ${generatedCount} coach messages`)
  } catch (error) {
    console.error("❌ Error generating coach messages:", error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

function generateNewUserMessage(userName: string | null): string {
  const firstName = userName?.split(" ")[0] || "さん"
  const messages = [
    `${firstName}さん、こんにちは！投資を始めるのは勇気がいりますよね。でも大丈夫、一緒に一歩ずつ進んでいきましょう。`,
    `${firstName}さん、新しいことを始めるワクワク感、ありますね。投資の世界へようこそ。焦らず、楽しみながら学んでいきましょう。`,
    `${firstName}さん、投資に興味を持ったこと、素晴らしいですね。最初は分からないことだらけで当たり前です。一緒に学んでいきましょう。`,
  ]
  return messages[Math.floor(Math.random() * messages.length)]
}

function generateExistingInvestorMessage(
  userName: string | null,
  stockCount: number,
  latestSnapshot: any,
  gainChange: number
): string {
  const firstName = userName?.split(" ")[0] || "さん"
  const gainLossPct = Number(latestSnapshot.gainLossPct)

  if (gainChange > 1) {
    return `${firstName}さん、おはようございます！今日はポートフォリオが好調ですね。利益率が${gainChange.toFixed(2)}%改善しました。でも、一喜一憂せず長期目線で見守りましょう。`
  } else if (gainChange < -1) {
    return `${firstName}さん、今日は少し下がっていますが、投資は長期戦です。${stockCount}銘柄を分散して持っているので、焦らず見守りましょう。`
  } else if (gainLossPct > 5) {
    return `${firstName}さん、順調に利益が出ていますね。このまま長期保有を続けるのも一つの戦略です。一緒に見守っていきましょう。`
  } else if (gainLossPct < -5) {
    return `${firstName}さん、今は含み損が出ていますが、投資は長期で考えることが大切です。市場は上下を繰り返しながら成長していきます。`
  } else {
    return `${firstName}さん、${stockCount}銘柄を一緒に見守っていますね。毎日コツコツと継続することが、投資成功の秘訣です。`
  }
}

generateCoachMessages()
