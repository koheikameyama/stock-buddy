import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export async function POST(request: NextRequest) {
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
        settings: true,
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

    const portfolio = user.portfolio
    const settings = user.settings

    // 今日のレポートが既に存在するか確認
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const existingReport = await prisma.dailyReport.findFirst({
      where: {
        portfolioId: portfolio.id,
        reportDate: today,
      },
    })

    if (existingReport) {
      return NextResponse.json({
        message: "Today's report already exists",
        report: existingReport,
      })
    }

    // 各銘柄の株価データを取得
    const stocksData = await Promise.all(
      portfolio.stocks.map(async (ps) => {
        try {
          // yfinanceで株価と指標を取得
          const pythonScript = `
import yfinance as yf
import json
import sys
from datetime import datetime, timedelta

ticker_code = "${ps.stock.tickerCode}"
ticker = f"{ticker_code}.T"

try:
    stock = yf.Ticker(ticker)

    # 過去30日のデータを取得
    hist = stock.history(period="1mo")

    if hist.empty:
        print(json.dumps({"error": "No data available"}))
        sys.exit(0)

    # 最新の株価
    latest = hist.iloc[-1]
    current_price = float(latest['Close'])

    # 前日比
    prev = hist.iloc[-2] if len(hist) > 1 else latest
    prev_close = float(prev['Close'])
    change = current_price - prev_close
    change_percent = (change / prev_close * 100) if prev_close != 0 else 0

    # 移動平均線（5日、25日）
    sma5 = float(hist['Close'].tail(5).mean())
    sma25 = float(hist['Close'].tail(25).mean()) if len(hist) >= 25 else None

    # 出来高
    volume = int(latest['Volume'])
    avg_volume = int(hist['Volume'].mean())

    # 高値・安値
    high_52w = float(hist['High'].max())
    low_52w = float(hist['Low'].min())

    # RSI (14日)
    def calculate_rsi(prices, period=14):
        deltas = prices.diff()
        gain = deltas.where(deltas > 0, 0).rolling(window=period).mean()
        loss = -deltas.where(deltas < 0, 0).rolling(window=period).mean()
        rs = gain / loss
        rsi = 100 - (100 / (1 + rs))
        return rsi.iloc[-1] if not rsi.empty else None

    rsi = calculate_rsi(hist['Close'])

    result = {
        "tickerCode": ticker_code,
        "currentPrice": round(current_price, 2),
        "previousClose": round(prev_close, 2),
        "change": round(change, 2),
        "changePercent": round(change_percent, 2),
        "sma5": round(sma5, 2),
        "sma25": round(sma25, 2) if sma25 else None,
        "volume": volume,
        "avgVolume": avg_volume,
        "high52w": round(high_52w, 2),
        "low52w": round(low_52w, 2),
        "rsi": round(float(rsi), 2) if rsi and not pd.isna(rsi) else None,
    }

    print(json.dumps(result))
except Exception as e:
    print(json.dumps({"error": str(e)}), file=sys.stderr)
    sys.exit(1)
`

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

          const stockData = await new Promise<any>((resolve, reject) => {
            pythonProcess.on("close", (code) => {
              if (code !== 0) {
                console.error(`Error fetching ${ps.stock.tickerCode}:`, stderr)
                resolve(null)
                return
              }
              try {
                const data = JSON.parse(stdout)
                resolve(data)
              } catch (e) {
                console.error(`Failed to parse data for ${ps.stock.tickerCode}:`, stdout)
                resolve(null)
              }
            })
          })

          return {
            stock: ps.stock,
            portfolioStock: ps,
            data: stockData,
          }
        } catch (error) {
          console.error(`Error processing ${ps.stock.tickerCode}:`, error)
          return null
        }
      })
    )

    // エラーのある銘柄を除外
    const validStocks = stocksData.filter(
      (s) => s !== null && s.data && !s.data.error
    )

    if (validStocks.length === 0) {
      return NextResponse.json(
        { error: "株価データの取得に失敗しました" },
        { status: 500 }
      )
    }

    // GPT-4o-miniでレポート生成
    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `あなたは株式投資初心者向けのAIアドバイザーです。
ユーザーのポートフォリオを分析し、今日の投資判断を提案してください。

【重要】
- 初心者にも分かりやすく、やさしい言葉で説明
- 専門用語は必ず簡単に解説
- 「買う」「売る」「何もしない」のいずれかを明確に提案
- なぜその判断をしたのか、理由を具体的に説明
- どの指標を見たのかを明示
- 今後どうなったらどうするか、次のアクションも提示

必ず以下のJSON形式で返してください：
{
  "action": "buy" | "sell" | "hold",
  "targetStock": "銘柄コード（買う/売る場合のみ）",
  "summary": "今日の結論を1-2文で",
  "reasoning": "判断理由を初心者向けに200-300字で説明",
  "keyIndicators": [
    {"name": "指標名", "value": "値", "explanation": "この指標の意味を簡単に"}
  ],
  "futurePlan": "今後どうなったらどうするか、次のアクションプラン"
}`,
          },
          {
            role: "user",
            content: `以下のポートフォリオを分析し、今日の投資判断を提案してください。

【投資スタイル】
- 予算: ${settings?.investmentAmount.toLocaleString()}円
- 投資期間: ${settings?.investmentPeriod}
- リスク許容度: ${settings?.riskTolerance}

【保有銘柄】
${validStocks
  .map((s) => {
    const d = s.data
    const ps = s.portfolioStock
    return `
銘柄: ${s.stock.name} (${s.stock.tickerCode})
- 推奨購入価格: ${Number(ps.averagePrice).toLocaleString()}円
- 保有株数: ${ps.quantity}株
- 現在価格: ${d.currentPrice}円
- 前日比: ${d.change >= 0 ? "+" : ""}${d.change}円 (${d.changePercent >= 0 ? "+" : ""}${d.changePercent}%)
- 5日移動平均: ${d.sma5}円
- 25日移動平均: ${d.sma25 ? d.sma25 + "円" : "データ不足"}
- RSI: ${d.rsi ? d.rsi : "データ不足"}
- 出来高: ${d.volume.toLocaleString()} (平均: ${d.avgVolume.toLocaleString()})
- 52週高値: ${d.high52w}円
- 52週安値: ${d.low52w}円
`
  })
  .join("\n")}

JSON形式で返してください。`,
          },
        ],
        temperature: 0.7,
        response_format: { type: "json_object" },
      }),
    })

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text()
      console.error("OpenAI API error:", errorText)
      throw new Error("AI分析に失敗しました")
    }

    const openaiData = await openaiResponse.json()
    const analysis = JSON.parse(openaiData.choices[0].message.content)

    // レポートをDBに保存
    const targetStock = analysis.targetStock
      ? validStocks.find((s) => s.stock.tickerCode === analysis.targetStock)?.stock
      : null

    const report = await prisma.dailyReport.create({
      data: {
        portfolioId: portfolio.id,
        reportDate: today,
        action: analysis.action,
        targetStockId: targetStock?.id || null,
        summary: analysis.summary,
        reasoning: analysis.reasoning,
        futurePlan: analysis.futurePlan,
        keyIndicators: analysis.keyIndicators,
      },
    })

    return NextResponse.json({
      success: true,
      report: report,
      analysis: analysis,
    })
  } catch (error) {
    console.error("Error generating report:", error)
    return NextResponse.json(
      { error: "レポートの生成に失敗しました" },
      { status: 500 }
    )
  }
}
