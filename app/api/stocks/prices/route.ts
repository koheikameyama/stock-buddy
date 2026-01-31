import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

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

    // Pythonスクリプトを呼び出して株価を取得
    // タイムゾーンエラー対策: TZ環境変数を設定してからyfinanceを実行
    const pythonScript = `
import os
# タイムゾーン設定（yfinanceのタイムゾーンエラー対策）
os.environ['TZ'] = 'Asia/Tokyo'

import yfinance as yf
import json
import sys

ticker_codes = ${JSON.stringify(tickerCodes)}

result = []
for code in ticker_codes:
    try:
        # ティッカーコードがすでに.Tを含んでいる場合はそのまま、含んでいない場合は追加
        ticker = code if code.endswith('.T') else f"{code}.T"
        stock = yf.Ticker(ticker)

        # 最新の株価情報を取得
        hist = stock.history(period="5d")

        if not hist.empty:
            latest = hist.iloc[-1]
            prev = hist.iloc[-2] if len(hist) > 1 else latest

            current_price = float(latest['Close'])
            prev_close = float(prev['Close'])
            change = current_price - prev_close
            change_percent = (change / prev_close * 100) if prev_close != 0 else 0

            # .Tを除去したティッカーコードを返す
            clean_code = code.replace('.T', '')

            result.append({
                "tickerCode": clean_code,
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
    const { spawn } = await import("child_process")

    const pythonProcess = spawn("python3", ["-c", pythonScript], {
      env: {
        ...process.env,
        TZ: 'Asia/Tokyo',
        PYTHONIOENCODING: 'utf-8',
      }
    })

    let stdout = ""
    let stderr = ""

    pythonProcess.stdout.on("data", (data) => {
      stdout += data.toString()
    })

    pythonProcess.stderr.on("data", (data) => {
      stderr += data.toString()
    })

    const prices = await new Promise<any[]>((resolve, reject) => {
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
        } catch (error) {
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

    console.log('取得した株価データ:', validPrices.length)

    return NextResponse.json({ prices: validPrices })
  } catch (error) {
    console.error("Error fetching stock prices:", error)
    return NextResponse.json(
      { error: "株価の取得に失敗しました" },
      { status: 500 }
    )
  }
}
