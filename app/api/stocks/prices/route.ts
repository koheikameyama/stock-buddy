import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { PrismaClient } from "@prisma/client"

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

    if (tickerCodes.length === 0) {
      return NextResponse.json({ prices: [] })
    }

    // Pythonスクリプトを呼び出して株価を取得
    const pythonScript = `
import yfinance as yf
import json
import sys

ticker_codes = ${JSON.stringify(tickerCodes)}

result = []
for code in ticker_codes:
    try:
        # 日本株の場合は.Tを付ける
        ticker = f"{code}.T"
        stock = yf.Ticker(ticker)

        # 最新の株価情報を取得
        info = stock.info
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
    const { spawn } = await import("child_process")

    const pythonProcess = spawn("python3", ["-c", pythonScript])

    let stdout = ""
    let stderr = ""

    pythonProcess.stdout.on("data", (data) => {
      stdout += data.toString()
    })

    pythonProcess.stderr.on("data", (data) => {
      stderr += data.toString()
    })

    const result = await new Promise<any>((resolve, reject) => {
      pythonProcess.on("close", (code) => {
        if (code !== 0) {
          console.error("Python stderr:", stderr)
          reject(new Error(`Python process exited with code ${code}`))
          return
        }
        try {
          const prices = JSON.parse(stdout)
          resolve(prices)
        } catch (e) {
          console.error("Failed to parse Python output:", stdout)
          reject(e)
        }
      })
    })

    return NextResponse.json({ prices: result })
  } catch (error) {
    console.error("Error fetching stock prices:", error)
    return NextResponse.json(
      { error: "株価の取得に失敗しました" },
      { status: 500 }
    )
  }
}
