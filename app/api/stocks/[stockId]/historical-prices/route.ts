import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { fetchHistoricalPrices } from "@/lib/stock-price-fetcher"
import { generatePatternsResponse } from "@/lib/candlestick-patterns"
import { getTechnicalIndicators, getCandlestickPattern, getChartPatterns, getWeekChange } from "@/lib/stock-analysis-data"
import type { OHLCVData } from "@/lib/stock-analysis-context"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ stockId: string }> }
) {
  try {
    // 認証チェック
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 })
    }

    const { stockId } = await params
    const { searchParams } = new URL(request.url)
    const period = (searchParams.get("period") || "1m") as "1m" | "3m" | "1y"

    // stockIdからtickerCodeを取得
    const stock = await prisma.stock.findUnique({
      where: { id: stockId },
      select: { tickerCode: true },
    })

    if (!stock) {
      return NextResponse.json({ error: "銘柄が見つかりません" }, { status: 404 })
    }

    // yfinanceからヒストリカルデータを取得
    const prices = await fetchHistoricalPrices(stock.tickerCode, period)

    if (prices.length === 0) {
      return NextResponse.json({ error: "価格データがありません" }, { status: 404 })
    }

    // RSIとMACDを計算するためのヘルパー関数
    const calculateRSI = (closes: number[], period: number = 14): (number | null)[] => {
      const rsiValues: (number | null)[] = []

      for (let i = 0; i < closes.length; i++) {
        if (i < period) {
          rsiValues.push(null)
          continue
        }

        const changes = []
        for (let j = i - period + 1; j <= i; j++) {
          changes.push(closes[j] - closes[j - 1])
        }

        const gains = changes.filter(c => c > 0)
        const losses = changes.filter(c => c < 0).map(c => Math.abs(c))

        const avgGain = gains.length > 0 ? gains.reduce((a, b) => a + b, 0) / period : 0
        const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / period : 0

        if (avgLoss === 0) {
          rsiValues.push(100)
        } else {
          const rs = avgGain / avgLoss
          rsiValues.push(Math.round((100 - 100 / (1 + rs)) * 100) / 100)
        }
      }

      return rsiValues
    }

    const calculateEMA = (values: number[], period: number): number[] => {
      const ema: number[] = []
      const k = 2 / (period + 1)

      for (let i = 0; i < values.length; i++) {
        if (i < period - 1) {
          ema.push(0)
        } else if (i === period - 1) {
          // 最初のEMAはSMA
          const sum = values.slice(0, period).reduce((a, b) => a + b, 0)
          ema.push(sum / period)
        } else {
          ema.push(values[i] * k + ema[i - 1] * (1 - k))
        }
      }

      return ema
    }

    const calculateMACD = (closes: number[]): { macd: (number | null)[], signal: (number | null)[], histogram: (number | null)[] } => {
      const ema12 = calculateEMA(closes, 12)
      const ema26 = calculateEMA(closes, 26)

      const macdLine: (number | null)[] = []
      const macdValues: number[] = []

      for (let i = 0; i < closes.length; i++) {
        if (i < 25) {
          macdLine.push(null)
        } else {
          const macd = ema12[i] - ema26[i]
          macdLine.push(Math.round(macd * 100) / 100)
          macdValues.push(macd)
        }
      }

      // シグナルライン（MACDの9日EMA）
      const signalEMA = macdValues.length >= 9 ? calculateEMA(macdValues, 9) : []
      const signalLine: (number | null)[] = []
      const histogram: (number | null)[] = []

      let signalIdx = 0
      for (let i = 0; i < closes.length; i++) {
        if (i < 33) { // 26 + 9 - 2
          signalLine.push(null)
          histogram.push(null)
        } else {
          const sig = signalEMA[signalIdx] || 0
          signalLine.push(Math.round(sig * 100) / 100)
          histogram.push(Math.round(((macdLine[i] || 0) - sig) * 100) / 100)
          signalIdx++
        }
      }

      return { macd: macdLine, signal: signalLine, histogram }
    }

    // 終値の配列を作成
    const closes = prices.map(p => p.close)

    // RSIとMACDを計算
    const rsiValues = calculateRSI(closes)
    const macdData = calculateMACD(closes)

    // レスポンスデータを整形
    const data = prices.map((price, index) => ({
      date: price.date,
      open: price.open,
      high: price.high,
      low: price.low,
      close: price.close,
      volume: price.volume,
      rsi: rsiValues[index],
      macd: macdData.macd[index],
      signal: macdData.signal[index],
      histogram: macdData.histogram[index],
    }))

    // 最新の指標値
    const latestRSI = rsiValues[rsiValues.length - 1]
    const latestMACD = macdData.macd[macdData.macd.length - 1]
    const latestSignal = macdData.signal[macdData.signal.length - 1]
    const latestHistogram = macdData.histogram[macdData.histogram.length - 1]

    // ローソク足パターン分析
    const patterns = generatePatternsResponse(data)

    // 共通分析データを生成（lib/stock-analysis-data.ts を使用）
    const ohlcvData: OHLCVData[] = prices.map(p => ({
      date: p.date,
      open: p.open,
      high: p.high,
      low: p.low,
      close: p.close,
    }))
    const technicalIndicators = getTechnicalIndicators(ohlcvData)
    const candlestickPattern = getCandlestickPattern(ohlcvData)
    const chartPatterns = getChartPatterns(ohlcvData)
    const weekChange = getWeekChange(ohlcvData)

    return NextResponse.json({
      data,
      summary: {
        rsi: latestRSI,
        macd: latestMACD,
        signal: latestSignal,
        histogram: latestHistogram,
        dataPoints: data.length,
        startDate: data[0]?.date,
        endDate: data[data.length - 1]?.date,
      },
      patterns,
      // 共通分析データ（UI表示用）
      technicalAnalysis: {
        technicalIndicators,
        candlestickPattern,
        chartPatterns,
        weekChange,
      },
    })
  } catch (error) {
    console.error("Historical prices error:", error)
    return NextResponse.json(
      { error: "履歴データの取得に失敗しました" },
      { status: 500 }
    )
  }
}
