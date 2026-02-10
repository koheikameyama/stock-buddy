/**
 * 株価取得モジュール
 *
 * yfinance（Python）を使って東京証券取引所の株価をリアルタイム取得
 */

import { spawn } from "child_process"
import { normalizeTickerCode } from "./ticker-utils"

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
 * 株価を取得（yfinance経由）
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

  // Pythonスクリプトを呼び出して株価を取得
  // yf.download()で一括取得し、個別API呼び出しを削減
  const pythonScript = `
import os
os.environ['TZ'] = 'Asia/Tokyo'

import yfinance as yf
import pandas as pd
import json
import sys

ticker_codes = ${JSON.stringify(normalizedCodes)}

result = []
try:
    # yf.download()で全銘柄を一括取得（個別Ticker呼び出しより効率的）
    df = yf.download(ticker_codes, period="5d", group_by="ticker", threads=True, progress=False)

    if not df.empty:
        is_multi = isinstance(df.columns, pd.MultiIndex)

        for code in ticker_codes:
            try:
                if is_multi:
                    hist = df[code].dropna(how='all')
                else:
                    hist = df.dropna(how='all')

                if hist.empty or len(hist) == 0:
                    continue

                latest = hist.iloc[-1]
                prev = hist.iloc[-2] if len(hist) > 1 else latest

                current_price = float(latest['Close'])
                prev_close = float(prev['Close'])
                change = current_price - prev_close
                change_percent = (change / prev_close * 100) if prev_close != 0 else 0

                result.append({
                    "tickerCode": code,
                    "currentPrice": round(current_price, 2),
                    "previousClose": round(prev_close, 2),
                    "change": round(change, 2),
                    "changePercent": round(change_percent, 2),
                    "volume": int(latest['Volume']),
                    "high": round(float(latest['High']), 2),
                    "low": round(float(latest['Low']), 2),
                })
            except Exception as e:
                print(f"Error parsing {code}: {str(e)}", file=sys.stderr)
                continue
except Exception as e:
    print(f"Error downloading: {str(e)}", file=sys.stderr)

print(json.dumps(result))
`

  // Pythonスクリプトを実行
  const pythonProcess = spawn("python3", ["-c", pythonScript], {
    env: {
      ...process.env,
      TZ: "Asia/Tokyo",
      PYTHONIOENCODING: "utf-8",
    },
  })

  let stdout = ""
  let stderr = ""

  pythonProcess.stdout.on("data", (data) => {
    stdout += data.toString()
  })

  pythonProcess.stderr.on("data", (data) => {
    stderr += data.toString()
  })

  const prices = await new Promise<StockPrice[]>((resolve) => {
    pythonProcess.on("close", (code) => {
      if (stderr) {
        console.error("Python stderr:", stderr)
      }

      if (code !== 0) {
        console.error(`Python process exited with code ${code}`)
        resolve([])
        return
      }

      try {
        const result = JSON.parse(stdout)
        resolve(result)
      } catch {
        console.error("Failed to parse Python output:", stdout)
        resolve([])
      }
    })

    pythonProcess.on("error", (error) => {
      console.error("Failed to start Python process:", error)
      resolve([])
    })
  })

  // nullを除外
  const validPrices = prices.filter((p) => p !== null)

  console.log("取得した株価データ:", validPrices.length)

  return validPrices
}

/**
 * ヒストリカル株価データを取得（yfinance経由）
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

  // periodをyfinanceのフォーマットに変換
  const yfinancePeriod = period === "1y" ? "1y" : period === "3m" ? "3mo" : "1mo"

  const pythonScript = `
import os
os.environ['TZ'] = 'Asia/Tokyo'

import yfinance as yf
import json
import sys
import math

ticker_code = "${normalizedCode}"
period = "${yfinancePeriod}"

result = []
try:
    stock = yf.Ticker(ticker_code)
    hist = stock.history(period=period)

    if not hist.empty:
        for date, row in hist.iterrows():
            # NaN/Infをチェック
            open_val = float(row['Open'])
            high_val = float(row['High'])
            low_val = float(row['Low'])
            close_val = float(row['Close'])
            volume_val = int(row['Volume'])

            if any(math.isnan(v) or math.isinf(v) for v in [open_val, high_val, low_val, close_val]):
                continue

            result.append({
                "date": date.strftime("%Y-%m-%d"),
                "open": round(open_val, 2),
                "high": round(high_val, 2),
                "low": round(low_val, 2),
                "close": round(close_val, 2),
                "volume": volume_val,
            })
except Exception as e:
    print(f"Error: {str(e)}", file=sys.stderr)

print(json.dumps(result))
`

  const pythonProcess = spawn("python3", ["-c", pythonScript], {
    env: {
      ...process.env,
      TZ: "Asia/Tokyo",
      PYTHONIOENCODING: "utf-8",
    },
  })

  let stdout = ""
  let stderr = ""

  pythonProcess.stdout.on("data", (data) => {
    stdout += data.toString()
  })

  pythonProcess.stderr.on("data", (data) => {
    stderr += data.toString()
  })

  const prices = await new Promise<HistoricalPrice[]>((resolve) => {
    pythonProcess.on("close", (code) => {
      if (stderr) {
        console.error("Python stderr:", stderr)
      }

      if (code !== 0) {
        console.error(`Python process exited with code ${code}`)
        resolve([])
        return
      }

      try {
        const result = JSON.parse(stdout)
        resolve(result)
      } catch {
        console.error("Failed to parse Python output:", stdout)
        resolve([])
      }
    })

    pythonProcess.on("error", (error) => {
      console.error("Failed to start Python process:", error)
      resolve([])
    })
  })

  return prices
}
