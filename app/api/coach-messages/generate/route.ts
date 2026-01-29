import { NextResponse } from "next/server"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

/**
 * Daily Coach Message Generator
 *
 * This API generates personalized daily messages for users based on:
 * - Their portfolio status (existing investor or new user)
 * - Number of holdings
 * - Market conditions
 * - Investment journey stage
 */
export async function POST() {
  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const users = await prisma.user.findMany({
      include: {
        portfolio: {
          include: {
            stocks: {
              include: {
                stock: true,
                analyses: {
                  where: { date: today },
                  take: 1,
                },
              },
            },
            snapshots: {
              orderBy: { date: "desc" },
              take: 2, // Today and yesterday
            },
          },
        },
        watchlist: {
          include: {
            stock: {
              include: {
                analyses: {
                  where: { date: today },
                  take: 1,
                },
              },
            },
          },
        },
        settings: true,
      },
    })

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
        continue
      }

      const hasPortfolio = !!user.portfolio
      const stockCount = user.portfolio?.stocks.length || 0
      const watchlistCount = user.watchlist?.length || 0
      const latestSnapshot = user.portfolio?.snapshots[0]
      const previousSnapshot = user.portfolio?.snapshots[1]

      let message: string
      let type: string

      // Generate message based on user status
      if (!hasPortfolio && watchlistCount === 0) {
        // New user - encouragement to start
        message = generateNewUserMessage(user.name)
        type = "encouragement"
      } else if (stockCount === 0 && watchlistCount > 0) {
        // Has watchlist but no portfolio yet - encourage to start investing
        message = await generateWatchlistOnlyMessage(user.name, user.watchlist || [], today)
        type = "encouragement"
      } else if (stockCount === 0 && watchlistCount === 0) {
        // Portfolio exists but no stocks yet
        message = "ポートフォリオは作成済みですね。そろそろ最初の一歩を踏み出してみませんか？焦らず、自分のペースで大丈夫ですよ。"
        type = "encouragement"
      } else {
        // Has portfolio with stocks - generate comprehensive message
        message = await generateComprehensiveMessage({
          user,
          stockCount,
          watchlistCount,
          latestSnapshot,
          previousSnapshot,
          today,
        })

        const gainChange = latestSnapshot && previousSnapshot
          ? Number(latestSnapshot.gainLossPct) - Number(previousSnapshot.gainLossPct)
          : 0
        type = gainChange > 0 ? "encouragement" : "advice"
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

      generatedCount++
    }

    return NextResponse.json({
      success: true,
      message: `Generated ${generatedCount} coach messages`,
      generatedCount,
    })
  } catch (error) {
    console.error("Error generating coach messages:", error)
    return NextResponse.json(
      { error: "Failed to generate coach messages" },
      { status: 500 }
    )
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

// ウォッチリストのみのユーザー向けメッセージ
 
async function generateWatchlistOnlyMessage(
  userName: string | null,
  watchlist: any[],
  _today: Date
): Promise<string> {
  const firstName = userName?.split(" ")[0] || "さん"

  // Check if any watchlist stock has good buy timing
  const goodTimingStocks = watchlist.filter(
    (item) => item.stock.analyses[0]?.buyTiming === 'good'
  )

  if (goodTimingStocks.length > 0) {
    const stock = goodTimingStocks[0].stock
    return `${firstName}さん、気になる銘柄の${stock.name}が買い時のサインを出しています。検討してみませんか？`
  }

  return `${firstName}さん、${watchlist.length}銘柄を気になるリストに入れていますね。じっくり観察して、買い時を見極めましょう。`
}

// ポートフォリオとウォッチリストの総合メッセージ
 
async function generateComprehensiveMessage(data: {
  user: any
  stockCount: number
  watchlistCount: number
  latestSnapshot: any
  previousSnapshot: any
  today: Date
}): Promise<string> {
  const { user, stockCount, latestSnapshot, previousSnapshot } = data
  const firstName = user.name?.split(" ")[0] || "さん"

  // Portfolio analysis
  const gainChange = latestSnapshot && previousSnapshot
    ? Number(latestSnapshot.gainLossPct) - Number(previousSnapshot.gainLossPct)
    : 0
  const gainLossPct = latestSnapshot ? Number(latestSnapshot.gainLossPct) : 0

  // Check portfolio stock analyses for important actions
  const portfolioStocks = user.portfolio?.stocks || []
  const sellRecommendations = portfolioStocks.filter(
    (ps: any) => ps.analyses[0]?.action === 'sell_partial' || ps.analyses[0]?.action === 'sell_all'
  )
  const buyMoreRecommendations = portfolioStocks.filter(
    (ps: any) => ps.analyses[0]?.action === 'buy_more'
  )

  // Check watchlist for good buy timing
  const watchlist = user.watchlist || []
  const goodTimingStocks = watchlist.filter(
    (item: any) => item.stock.analyses[0]?.buyTiming === 'good'
  )

  // Build message
  let message = `${firstName}さん、おはようございます！`

  // Portfolio status
  if (gainChange > 1) {
    message += `今日はポートフォリオが好調ですね（利益率${gainChange >= 0 ? '+' : ''}${gainChange.toFixed(2)}%）。`
  } else if (gainChange < -1) {
    message += `今日は少し下がっていますが、投資は長期戦です。`
  } else if (gainLossPct > 5) {
    message += `順調に利益が出ていますね（+${gainLossPct.toFixed(2)}%）。`
  } else if (gainLossPct < -5) {
    message += `今は含み損が出ていますが、長期で見守りましょう。`
  }

  // Action recommendations
  if (sellRecommendations.length > 0) {
    const stock = sellRecommendations[0]
    message += `${stock.stock.name}は利益確定を検討しても良いタイミングです。`
  } else if (buyMoreRecommendations.length > 0) {
    const stock = buyMoreRecommendations[0]
    message += `${stock.stock.name}は買い増しのチャンスかもしれません。`
  } else if (goodTimingStocks.length > 0) {
    const stock = goodTimingStocks[0].stock
    message += `気になる銘柄の${stock.name}が買い時のサインを出しています。`
  } else {
    message += `${stockCount}銘柄を一緒に見守っていきましょう。`
  }

  return message
}
