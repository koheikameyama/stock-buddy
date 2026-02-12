/**
 * 株価取得モジュール
 *
 * Python yfinanceを使って東京証券取引所の株価をリアルタイム取得
 */

import { exec } from "child_process"
import { promisify } from "util"

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
 * 株価を取得（Python yfinance経由）
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

  try {
    // Pythonスクリプトでyfinanceを実行
    const pythonScript = `
import json
import sys
import yfinance as yf

def fetch_prices(tickers):
    """複数銘柄の株価を取得"""
    results = []

    for ticker in tickers:
        try:
            stock = yf.Ticker(ticker)
            info = stock.info

            # 現在価格を取得（複数のフィールドをフォールバック）
            current_price = (
                info.get("currentPrice") or
                info.get("regularMarketPrice") or
                info.get("previousClose") or
                0
            )

            # 前日終値
            previous_close = info.get("previousClose") or info.get("regularMarketPreviousClose") or current_price

            # 変動計算
            change = current_price - previous_close if previous_close else 0
            change_percent = (change / previous_close * 100) if previous_close else 0

            # 高値・安値・出来高
            high = info.get("dayHigh") or info.get("regularMarketDayHigh") or current_price
            low = info.get("dayLow") or info.get("regularMarketDayLow") or current_price
            volume = info.get("volume") or info.get("regularMarketVolume") or 0

            if current_price > 0:
                results.append({
                    "tickerCode": ticker,
                    "currentPrice": round(current_price, 2),
                    "previousClose": round(previous_close, 2),
                    "change": round(change, 2),
                    "changePercent": round(change_percent, 2),
                    "volume": volume,
                    "high": round(high, 2),
                    "low": round(low, 2)
                })
            else:
                print(f"No price data for {ticker}", file=sys.stderr)

        except Exception as e:
            print(f"Error fetching {ticker}: {e}", file=sys.stderr)

    return results

if __name__ == "__main__":
    tickers = sys.argv[1].split(",") if len(sys.argv) > 1 else []
    results = fetch_prices(tickers)
    print(json.dumps(results))
`

    // ティッカーコードをカンマ区切りで渡す
    const tickerArg = normalizedCodes.join(",")

    const { stdout, stderr } = await execAsync(
      `python3 -c '${pythonScript.replace(/'/g, "'\\''")}' '${tickerArg}'`,
      { timeout: 60000 } // 60秒タイムアウト
    )

    if (stderr) {
      console.error("Python stderr:", stderr)
    }

    const results: StockPrice[] = JSON.parse(stdout.trim())

    console.log("取得した株価データ:", results.length)

    return results
  } catch (error) {
    console.error("Error fetching stock prices via yfinance:", error)
    return []
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

    const pythonScript = `
import json
import sys
import yfinance as yf

def fetch_historical(ticker, period):
    """ヒストリカルデータを取得"""
    try:
        stock = yf.Ticker(ticker)
        hist = stock.history(period=period)

        results = []
        for date, row in hist.iterrows():
            results.append({
                "date": date.strftime("%Y-%m-%d"),
                "open": round(row["Open"], 2),
                "high": round(row["High"], 2),
                "low": round(row["Low"], 2),
                "close": round(row["Close"], 2),
                "volume": int(row["Volume"])
            })

        return results
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return []

if __name__ == "__main__":
    ticker = sys.argv[1] if len(sys.argv) > 1 else ""
    period = sys.argv[2] if len(sys.argv) > 2 else "1mo"
    results = fetch_historical(ticker, period)
    print(json.dumps(results))
`

    const { stdout, stderr } = await execAsync(
      `python3 -c '${pythonScript.replace(/'/g, "'\\''")}' '${normalizedCode}' '${yfinancePeriod}'`,
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
    console.error(`Error fetching historical data for ${normalizedCode}:`, error)
    return []
  }
}
