/**
 * 株価取得モジュール
 *
 * Python yfinanceを使って東京証券取引所の株価をリアルタイム取得
 */

import { exec } from "child_process"
import { promisify } from "util"
import path from "path"
import fs from "fs"

const execAsync = promisify(exec)

export interface StockPrice {
  tickerCode: string
  currentPrice: number
  previousClose: number
  change: number
  changePercent: number
  volume: number
  high: number
  low: number
  marketTime: number | null
}

export interface StockPriceResult {
  prices: StockPrice[]
  staleTickers: string[]
}

export interface HistoricalPrice {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface EarningsData {
  tickerCode: string
  hasData: boolean
  latestRevenue?: number | null
  latestNetIncome?: number | null
  revenueGrowth?: number | null
  netIncomeGrowth?: number | null
  eps?: number | null
  isProfitable?: boolean | null
  profitTrend?: string | null
  error?: string
}

/**
 * ティッカーコードを正規化（.T サフィックスを確実に付与）
 * インデックス（^で始まる）はそのまま返す
 */
function normalizeTickerCode(ticker: string): string {
  // インデックス（^N225など）はそのまま返す
  if (ticker.startsWith("^")) {
    return ticker
  }
  const code = ticker.replace(/\.T$/i, "")
  return `${code}.T`
}

/**
 * Pythonスクリプトのパスを取得
 */
function getPythonScriptPath(scriptName: string): string {
  // Next.js production: process.cwd() is /app
  // Development: process.cwd() is project root
  return path.join(process.cwd(), "scripts", "python", scriptName)
}

/**
 * 株価を取得（Python yfinance経由）
 *
 * @param tickerCodes - ティッカーコード配列（.T サフィックスの有無は問わない）
 * @returns 株価データ配列
 */
export async function fetchStockPrices(
  tickerCodes: string[]
): Promise<StockPriceResult> {
  if (tickerCodes.length === 0) {
    return { prices: [], staleTickers: [] }
  }

  // ティッカーコードを正規化
  const normalizedCodes = tickerCodes.map(normalizeTickerCode)

  try {
    const scriptPath = getPythonScriptPath("fetch_stock_prices.py")
    const tickerArg = normalizedCodes.join(",")

    // スクリプトの存在確認
    if (!fs.existsSync(scriptPath)) {
      throw new Error(`Python script not found: ${scriptPath} (cwd: ${process.cwd()})`)
    }

    const { stdout, stderr } = await execAsync(
      `python3 "${scriptPath}" "${tickerArg}"`,
      { timeout: 90000 }
    )

    if (stderr) {
      console.error("Python stderr:", stderr)
    }

    const result: StockPriceResult = JSON.parse(stdout.trim())

    return result
  } catch (error) {
    throw new Error(`Failed to fetch stock prices: ${error instanceof Error ? error.message : error}`)
  }
}

/**
 * ヒストリカル株価データを取得（Python yfinance経由）
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

  try {
    // yfinanceのperiod形式に変換
    const yfinancePeriod = period === "1m" ? "1mo" : period === "3m" ? "3mo" : "1y"

    const scriptPath = getPythonScriptPath("fetch_historical_prices.py")

    // スクリプトの存在確認
    if (!fs.existsSync(scriptPath)) {
      throw new Error(`Python script not found: ${scriptPath} (cwd: ${process.cwd()})`)
    }

    const { stdout, stderr } = await execAsync(
      `python3 "${scriptPath}" "${normalizedCode}" "${yfinancePeriod}"`,
      { timeout: 60000 }
    )

    if (stderr) {
      console.error("Python stderr:", stderr)
    }

    const results: HistoricalPrice[] = JSON.parse(stdout.trim())

    // 日付でソート（古い順）
    results.sort((a, b) => a.date.localeCompare(b.date))

    return results
  } catch (error) {
    throw new Error(`Failed to fetch historical prices for ${normalizedCode}: ${error instanceof Error ? error.message : error}`)
  }
}

/**
 * 業績データを取得（Python yfinance経由）
 *
 * @param tickerCodes - ティッカーコード配列
 * @returns 業績データ配列
 */
export async function fetchEarningsData(
  tickerCodes: string[]
): Promise<EarningsData[]> {
  if (tickerCodes.length === 0) {
    return []
  }

  const normalizedCodes = tickerCodes.map(normalizeTickerCode)

  try {
    const scriptPath = getPythonScriptPath("fetch_earnings.py")
    const tickerArg = normalizedCodes.join(",")

    if (!fs.existsSync(scriptPath)) {
      throw new Error(`Python script not found: ${scriptPath} (cwd: ${process.cwd()})`)
    }

    const { stdout, stderr } = await execAsync(
      `python3 "${scriptPath}" "${tickerArg}"`,
      { timeout: 120000 }
    )

    if (stderr) {
      console.error("Python stderr:", stderr)
    }

    const results: EarningsData[] = JSON.parse(stdout.trim())
    return results
  } catch (error) {
    throw new Error(`Failed to fetch earnings data: ${error instanceof Error ? error.message : error}`)
  }
}
