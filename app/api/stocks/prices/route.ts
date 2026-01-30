import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { PrismaClient } from "@prisma/client"
import yahooFinance from "yahoo-finance2"

const prisma = new PrismaClient()

export async function GET() {
  try {
    // 認証チェック
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // ユーザーのポートフォリオを取得
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        portfolio: {
          include: {
            stocks: {
              include: {
                stock: true,
              },
            },
          },
        },
      },
    })

    if (!user?.portfolio) {
      return NextResponse.json({ error: "Portfolio not found" }, { status: 404 })
    }

    const tickerCodes = user.portfolio.stocks.map((ps) => ps.stock.tickerCode)

    console.log('ポートフォリオの銘柄数:', user.portfolio.stocks.length)
    console.log('ティッカーコード:', tickerCodes)

    if (tickerCodes.length === 0) {
      console.log('銘柄が登録されていません')
      return NextResponse.json({ prices: [] })
    }

    // yahoo-finance2を使って株価を取得
    const prices = await Promise.all(
      tickerCodes.map(async (tickerCode) => {
        try {
          // 現在の株価を取得
          const quote = await yahooFinance.quote(tickerCode) as any

          // 過去5日間のデータを取得（前日比計算用）
          const now = new Date()
          const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000)

          const historicalData = await yahooFinance.historical(tickerCode, {
            period1: fiveDaysAgo,
            period2: now,
            interval: '1d',
          }) as any[]

          // 最新データと前日データを取得
          const latest = historicalData[historicalData.length - 1]
          const previous = historicalData.length > 1
            ? historicalData[historicalData.length - 2]
            : latest

          const currentPrice = quote.regularMarketPrice || latest.close
          const previousClose = previous.close
          const change = currentPrice - previousClose
          const changePercent = (change / previousClose) * 100

          // 52週高値・安値を取得
          const high = quote.fiftyTwoWeekHigh || 0
          const low = quote.fiftyTwoWeekLow || 0

          return {
            tickerCode: tickerCode.replace('.T', ''), // .Tを除去
            currentPrice: Math.round(currentPrice * 100) / 100,
            previousClose: Math.round(previousClose * 100) / 100,
            change: Math.round(change * 100) / 100,
            changePercent: Math.round(changePercent * 100) / 100,
            volume: quote.regularMarketVolume || latest.volume || 0,
            high: Math.round(high * 100) / 100,
            low: Math.round(low * 100) / 100,
          }
        } catch (error) {
          console.error(`Error fetching ${tickerCode}:`, error)
          return null
        }
      })
    )

    // nullを除外
    const validPrices = prices.filter((p) => p !== null)

    console.log('取得した株価データ:', validPrices.length)

    return NextResponse.json({ prices: validPrices })
  } catch (error) {
    console.error("Error fetching stock prices:", error)
    return NextResponse.json(
      { error: "株価の取得に失敗しました" },
      { status: 500 }
    )
  } finally {
    await prisma.$disconnect()
  }
}
