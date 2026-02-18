import { NextRequest, NextResponse } from "next/server"
import { fetchHistoricalPrices } from "@/lib/stock-price-fetcher"
import { prisma } from "@/lib/prisma"

/**
 * ベータ値（日経平均連動率）を計算する
 *
 * Beta = Cov(株式リターン, 日経リターン) / Var(日経リターン)
 * - Beta > 1: 市場より大きく動く（積極型）
 * - Beta = 1: 市場と同程度に動く
 * - Beta < 1: 市場より小さく動く（守備型）
 * - Beta < 0: 市場と逆方向に動く
 */

function calculateDailyReturns(prices: { close: number }[]): number[] {
  const returns: number[] = []
  for (let i = 1; i < prices.length; i++) {
    const r = (prices[i].close - prices[i - 1].close) / prices[i - 1].close
    returns.push(r)
  }
  return returns
}

function calculateBeta(
  stockReturns: number[],
  marketReturns: number[]
): { beta: number; correlation: number } {
  if (stockReturns.length !== marketReturns.length || stockReturns.length < 2) {
    return { beta: 1, correlation: 0 }
  }

  const n = stockReturns.length
  const stockMean = stockReturns.reduce((a, b) => a + b, 0) / n
  const marketMean = marketReturns.reduce((a, b) => a + b, 0) / n

  let covariance = 0
  let marketVariance = 0
  let stockVariance = 0

  for (let i = 0; i < n; i++) {
    const stockDiff = stockReturns[i] - stockMean
    const marketDiff = marketReturns[i] - marketMean
    covariance += stockDiff * marketDiff
    marketVariance += marketDiff * marketDiff
    stockVariance += stockDiff * stockDiff
  }

  covariance /= n - 1
  marketVariance /= n - 1
  stockVariance /= n - 1

  if (marketVariance === 0) {
    return { beta: 1, correlation: 0 }
  }

  const beta = covariance / marketVariance
  const correlation =
    Math.sqrt(stockVariance) * Math.sqrt(marketVariance) === 0
      ? 0
      : covariance / (Math.sqrt(stockVariance) * Math.sqrt(marketVariance))

  return { beta, correlation }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ stockId: string }> }
) {
  try {
    const { stockId } = await params

    const stock = await prisma.stock.findUnique({
      where: { id: stockId },
      select: { tickerCode: true },
    })

    if (!stock) {
      return NextResponse.json({ error: "Stock not found" }, { status: 404 })
    }

    // 1年分の株価データと日経平均データを並列取得
    const [stockPrices, nikkeiPrices] = await Promise.all([
      fetchHistoricalPrices(stock.tickerCode, "1y"),
      fetchHistoricalPrices("^N225", "1y"),
    ])

    if (stockPrices.length < 20 || nikkeiPrices.length < 20) {
      return NextResponse.json(
        { error: "データが不足しています" },
        { status: 422 }
      )
    }

    // 共通の日付のみ使用してリターンを計算
    const nikkeiByDate = new Map(nikkeiPrices.map((p) => [p.date, p]))

    const alignedStock: { close: number }[] = []
    const alignedNikkei: { close: number }[] = []

    for (const sp of stockPrices) {
      const np = nikkeiByDate.get(sp.date)
      if (np) {
        alignedStock.push({ close: sp.close })
        alignedNikkei.push({ close: np.close })
      }
    }

    if (alignedStock.length < 20) {
      return NextResponse.json(
        { error: "共通データが不足しています" },
        { status: 422 }
      )
    }

    const stockReturns = calculateDailyReturns(alignedStock)
    const nikkeiReturns = calculateDailyReturns(alignedNikkei)

    const { beta, correlation } = calculateBeta(stockReturns, nikkeiReturns)

    return NextResponse.json({
      beta: Math.round(beta * 100) / 100,
      correlation: Math.round(correlation * 100) / 100,
      dataPoints: stockReturns.length,
    })
  } catch (error) {
    console.error("Error calculating beta:", error)
    return NextResponse.json(
      { error: "ベータ値の計算に失敗しました" },
      { status: 500 }
    )
  }
}
