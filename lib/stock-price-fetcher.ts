/**
 * 株価取得モジュール
 *
 * Stooq APIを使って東京証券取引所の株価をリアルタイム取得
 * Yahoo Finance APIがRailway環境からブロックされているため、Stooqを使用
 */

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

/**
 * ティッカーコードを正規化（.T サフィックスを確実に付与）
 */
function normalizeTickerCode(ticker: string): string {
  const code = ticker.replace(/\.T$/i, "")
  return `${code}.T`
}

/**
 * ティッカーコードをStooq形式に変換
 * 東証: 7203.T -> 7203.jp
 */
function toStooqTicker(ticker: string): string {
  const code = ticker.replace(/\.T$/i, "")
  return `${code}.jp`
}

/**
 * 株価を取得（Stooq API経由）
 *
 * @param tickerCodes - ティッカーコード配列（.T サフィックスの有無は問わない）
 * @returns 株価データ配列
 */
export async function fetchStockPrices(
  tickerCodes: string[]
): Promise<StockPrice[]> {
  if (tickerCodes.length === 0) {
    console.log("銘柄が登録されていません")
    return []
  }

  // ティッカーコードを正規化
  const normalizedCodes = tickerCodes.map(normalizeTickerCode)

  console.log("ポートフォリオの銘柄数:", normalizedCodes.length)
  console.log("ティッカーコード:", normalizedCodes)

  const results: StockPrice[] = []

  // 並列で株価を取得
  const quotePromises = normalizedCodes.map(async (code) => {
    try {
      const stooqTicker = toStooqTicker(code)
      // Stooq API: s=symbol, f=fields (sd2t2ohlcv), e=csv
      const url = `https://stooq.com/q/l/?s=${stooqTicker}&f=sd2t2ohlcv&h&e=csv`

      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      })

      if (!response.ok) {
        console.error(`Stooq API error for ${code}: ${response.status}`)
        return null
      }

      const csvText = await response.text()
      const lines = csvText.trim().split("\n")

      if (lines.length < 2) {
        console.error(`No data for ${code}`)
        return null
      }

      // CSVパース: Symbol,Date,Time,Open,High,Low,Close,Volume
      const values = lines[1].split(",")

      if (values.length < 8 || values[6] === "N/D") {
        console.error(`Invalid data for ${code}:`, values)
        return null
      }

      const open = parseFloat(values[3])
      const high = parseFloat(values[4])
      const low = parseFloat(values[5])
      const close = parseFloat(values[6])
      const volume = parseInt(values[7]) || 0

      // 前日終値は取得できないため、始値を代用
      const previousClose = open
      const change = close - previousClose
      const changePercent = previousClose !== 0 ? (change / previousClose) * 100 : 0

      return {
        tickerCode: code,
        currentPrice: Math.round(close * 100) / 100,
        previousClose: Math.round(previousClose * 100) / 100,
        change: Math.round(change * 100) / 100,
        changePercent: Math.round(changePercent * 100) / 100,
        volume,
        high: Math.round(high * 100) / 100,
        low: Math.round(low * 100) / 100,
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
 * ヒストリカル株価データを取得（Stooq API経由）
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
  const stooqTicker = toStooqTicker(normalizedCode)

  // 期間を日数に変換
  const periodDays = period === "1y" ? 365 : period === "3m" ? 90 : 30

  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - periodDays)

  // 日付をYYYYMMDD形式に変換
  const formatDate = (d: Date) => d.toISOString().split("T")[0].replace(/-/g, "")
  const d1 = formatDate(startDate)
  const d2 = formatDate(endDate)

  try {
    // Stooq Historical API
    const url = `https://stooq.com/q/d/l/?s=${stooqTicker}&d1=${d1}&d2=${d2}&i=d`

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    })

    if (!response.ok) {
      console.error(`Stooq historical API error for ${normalizedCode}: ${response.status}`)
      return []
    }

    const csvText = await response.text()
    const lines = csvText.trim().split("\n")

    if (lines.length < 2) {
      console.error(`No historical data for ${normalizedCode}`)
      return []
    }

    // CSVパース: Date,Open,High,Low,Close,Volume
    const results: HistoricalPrice[] = []

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(",")

      if (values.length < 6) continue

      const date = values[0]
      const open = parseFloat(values[1])
      const high = parseFloat(values[2])
      const low = parseFloat(values[3])
      const close = parseFloat(values[4])
      const volume = parseInt(values[5]) || 0

      if (isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close)) continue

      results.push({
        date,
        open: Math.round(open * 100) / 100,
        high: Math.round(high * 100) / 100,
        low: Math.round(low * 100) / 100,
        close: Math.round(close * 100) / 100,
        volume,
      })
    }

    // 日付でソート（古い順）
    results.sort((a, b) => a.date.localeCompare(b.date))

    return results
  } catch (error) {
    console.error(`Error fetching historical data for ${normalizedCode}:`, error)
    return []
  }
}
