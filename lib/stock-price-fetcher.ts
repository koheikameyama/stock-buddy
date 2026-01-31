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
  const pythonScript = `
import os
# タイムゾーン設定（yfinanceのタイムゾーンエラー対策）
os.environ['TZ'] = 'Asia/Tokyo'

import yfinance as yf
import json
import sys

ticker_codes = ${JSON.stringify(normalizedCodes)}

result = []
for code in ticker_codes:
    try:
        # コードは既に正規化されているのでそのまま使用
        stock = yf.Ticker(code)

        # 最新の株価情報を取得
        hist = stock.history(period="5d")

        if not hist.empty:
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
        print(f"Error fetching {code}: {str(e)}", file=sys.stderr)
        continue

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
