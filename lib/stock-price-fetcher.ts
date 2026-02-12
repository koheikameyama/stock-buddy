/**
 * 株価取得モジュール
 *
 * yahoo-finance2を使って東京証券取引所の株価をリアルタイム取得
 */

import YahooFinance from "yahoo-finance2"
import { normalizeTickerCode } from "./ticker-utils"

// v3では new でインスタンス化が必要
const yahooFinance = new YahooFinance()

export interface StockPrice {
  tickerCode: string
  currentPrice: number
  previousClose: number
  change: number
  changePercent: number
  volume: number
  high: number
  low: number
}

export interface HistoricalPrice {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

// yahoo-finance2の型定義
interface YahooQuote {
  regularMarketPrice?: number
  regularMarketPreviousClose?: number
  regularMarketVolume?: number
  regularMarketDayHigh?: number
  regularMarketDayLow?: number
}

interface YahooHistoricalRow {
  date: Date
  open: number
  high: number
  low: number
  close: number
  volume: number
}

/**
 * 株価を取得（yahoo-finance2経由）
 *
 * @param tickerCodes - ティッカーコード配列（.T サフィックスの有無は問わない）
 * @returns 株価データ配列
 *
 * @example
 * const prices = await fetchStockPrices(["7203", "9432.T"])
 * // 両方とも正規化されて取得される
 */
export async function fetchStockPrices(
  tickerCodes: string[]
): Promise<StockPrice[]> {
  if (tickerCodes.length === 0) {
    console.log("銘柄が登録されていません")
    return []
  }

  // ティッカーコードを正規化（.T サフィックスを確実に付与）
  const normalizedCodes = tickerCodes.map(normalizeTickerCode)

  console.log("ポートフォリオの銘柄数:", normalizedCodes.length)
  console.log("ティッカーコード:", normalizedCodes)

  const results: StockPrice[] = []

  // 並列で株価を取得
  const quotePromises = normalizedCodes.map(async (code) => {
    try {
      const quote = (await yahooFinance.quote(code)) as YahooQuote

      if (!quote || !quote.regularMarketPrice) {
        console.error(`No data for ${code}`)
        return null
      }

      const currentPrice = quote.regularMarketPrice
      const previousClose = quote.regularMarketPreviousClose ?? currentPrice
      const change = currentPrice - previousClose
      const changePercent = previousClose !== 0 ? (change / previousClose) * 100 : 0

      return {
        tickerCode: code,
        currentPrice: Math.round(currentPrice * 100) / 100,
        previousClose: Math.round(previousClose * 100) / 100,
        change: Math.round(change * 100) / 100,
        changePercent: Math.round(changePercent * 100) / 100,
        volume: quote.regularMarketVolume ?? 0,
        high: Math.round((quote.regularMarketDayHigh ?? currentPrice) * 100) / 100,
        low: Math.round((quote.regularMarketDayLow ?? currentPrice) * 100) / 100,
      } as StockPrice
    } catch (error) {
      console.error(`Error fetching ${code}:`, error)
      return null
    }
  })

  const quoteResults = await Promise.all(quotePromises)

  for (const result of quoteResults) {
    if (result) {
      results.push(result)
    }
  }

  console.log("取得した株価データ:", results.length)

  return results
}

/**
 * ヒストリカル株価データを取得（yahoo-finance2経由）
 *
 * @param tickerCode - ティッカーコード（.T サフィックスの有無は問わない）
 * @param period - 期間（"1m", "3m", "1y"）
 * @returns ヒストリカル株価データ配列
 */
export async function fetchHistoricalPrices(
  tickerCode: string,
  period: "1m" | "3m" | "1y" = "1m"
): Promise<HistoricalPrice[]> {
  const normalizedCode = normalizeTickerCode(tickerCode)

  // 期間を日数に変換
  const periodDays = period === "1y" ? 365 : period === "3m" ? 90 : 30

  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - periodDays)

  try {
    const result = (await yahooFinance.historical(normalizedCode, {
      period1: startDate,
      period2: endDate,
    })) as YahooHistoricalRow[]

    if (!result || result.length === 0) {
      console.error(`No historical data for ${normalizedCode}`)
      return []
    }

    return result
      .filter((row) => {
        // NaN/undefinedをチェック
        return (
          row.open != null &&
          row.high != null &&
          row.low != null &&
          row.close != null &&
          !isNaN(row.open) &&
          !isNaN(row.high) &&
          !isNaN(row.low) &&
          !isNaN(row.close)
        )
      })
      .map((row) => ({
        date: row.date.toISOString().split("T")[0],
        open: Math.round(row.open * 100) / 100,
        high: Math.round(row.high * 100) / 100,
        low: Math.round(row.low * 100) / 100,
        close: Math.round(row.close * 100) / 100,
        volume: row.volume ?? 0,
      }))
  } catch (error) {
    console.error(`Error fetching historical data for ${normalizedCode}:`, error)
    return []
  }
}
