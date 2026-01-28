import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { PrismaClient } from "@prisma/client"
import {
  calculateRSI,
  calculateSMA,
  calculateMACD,
  getTechnicalSignal,
} from "@/lib/technical-indicators"

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

    // DBから最新の市場ニュースを取得
    const recentNews = await prisma.marketNews.findMany({
      where: {
        publishedAt: {
          gte: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 過去3日
        },
      },
      orderBy: {
        publishedAt: "desc",
      },
      take: 5,
    })

    // 各銘柄の株価データをDBから取得
    const stocksData = await Promise.all(
      portfolio.stocks.map(async (ps) => {
        try {
          // DBから株価データを取得
          const priceData = await prisma.stockPrice.findMany({
            where: { stockId: ps.stock.id },
            orderBy: { date: "desc" },
            take: 30,
          })

          if (priceData.length === 0) {
            console.warn(`No price data for ${ps.stock.tickerCode}`)
            return null
          }

          const latestPrice = priceData[0]
          const previousPrice = priceData[1] || latestPrice

          // 技術指標を計算
          const prices = priceData.map((p) => ({
            close: Number(p.close),
            high: Number(p.high),
            low: Number(p.low),
          }))

          const rsi = calculateRSI(prices)
          const sma5 = calculateSMA(prices, 5)
          const sma25 = calculateSMA(prices, 25)
          const macd = calculateMACD(prices)
          const technicalSignal = getTechnicalSignal(prices)

          // 52週高値・安値
          const highs = prices.map((p) => p.high)
          const lows = prices.map((p) => p.low)
          const high52w = Math.max(...highs)
          const low52w = Math.min(...lows)

          const currentPrice = Number(latestPrice.close)
          const prevClose = Number(previousPrice.close)
          const change = currentPrice - prevClose
          const changePercent = (change / prevClose) * 100

          return {
            stock: ps.stock,
            portfolioStock: ps,
            data: {
              tickerCode: ps.stock.tickerCode,
              currentPrice: currentPrice,
              previousClose: prevClose,
              change: Math.round(change * 100) / 100,
              changePercent: Math.round(changePercent * 100) / 100,
              sma5: sma5,
              sma25: sma25,
              rsi: rsi,
              macd: macd.macd,
              macdSignal: macd.signal,
              technicalSignal: technicalSignal.signal,
              technicalStrength: technicalSignal.strength,
              technicalReasons: technicalSignal.reasons,
              volume: Number(latestPrice.volume),
              avgVolume: Math.round(
                priceData.reduce((sum, p) => sum + Number(p.volume), 0) /
                  priceData.length
              ),
              high52w: high52w,
              low52w: low52w,
            },
          }
        } catch (error) {
          console.error(`Error processing ${ps.stock.tickerCode}:`, error)
          return null
        }
      })
    )

    // エラーのある銘柄を除外
    const validStocks = stocksData.filter(
      (s): s is NonNullable<typeof s> => s !== null
    )

    if (validStocks.length === 0) {
      return NextResponse.json(
        { error: "株価データの取得に失敗しました" },
        { status: 500 }
      )
    }

    // 市場ニュースをフォーマット
    const marketNews = recentNews.length > 0
      ? recentNews
          .map(
            (n) =>
              `- [${n.sector || "全般"}/${n.sentiment}] ${n.title}: ${n.content.substring(0, 150)}...`
          )
          .join("\n")
      : ""

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
- どの指標を見たのかを明示（技術指標を活用）
- 今後どうなったらどうするか、次のアクションも提示

【技術指標の活用】
- RSI（相対力指数）: 30以下は売られすぎ（買いチャンス）、70以上は買われすぎ（注意）
- 5日/25日移動平均（SMA5/SMA25）: 現在価格 > SMA なら上昇トレンド
- MACD: プラスなら上昇モメンタム、マイナスなら下降モメンタム
- technicalSignal: 総合シグナル。プラスなら買いシグナル、マイナスなら売りシグナル
- technicalStrength: "強い買い"、"買い"、"中立"、"売り"、"強い売り"
- technicalReasons: シグナルの具体的理由（配列）

必ず以下のJSON形式で返してください：
{
  "action": "buy" | "sell" | "hold",
  "targetStock": "銘柄コード（買う/売る場合のみ）",
  "summary": "今日の結論を1-2文で",
  "reasoning": "技術指標を含めた判断理由を初心者向けに200-300字で説明",
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

${marketNews ? `【市場の最新動向（過去3日）】\n${marketNews}\n\n` : ""}【保有銘柄】
${validStocks
  .map((s) => {
    const d = s.data
    const ps = s.portfolioStock
    return `
銘柄: ${s.stock.name} (${s.stock.tickerCode})
- 推奨購入価格: ${Number(ps.averagePrice).toLocaleString()}円
- 保有株数: ${ps.quantity}株
- 現在価格: ${d.currentPrice.toLocaleString()}円
- 前日比: ${d.change >= 0 ? "+" : ""}${d.change}円 (${d.changePercent >= 0 ? "+" : ""}${d.changePercent.toFixed(2)}%)
- 5日移動平均: ${d.sma5 ? d.sma5.toFixed(2) + "円" : "データ不足"}
- 25日移動平均: ${d.sma25 ? d.sma25.toFixed(2) + "円" : "データ不足"}
- RSI: ${d.rsi ? d.rsi.toFixed(2) : "データ不足"}
- MACD: ${d.macd ? d.macd.toFixed(2) : "データ不足"}
- MACDシグナル: ${d.macdSignal ? d.macdSignal.toFixed(2) : "データ不足"}
- 技術シグナル: ${d.technicalStrength || "中立"}
- シグナル理由: ${d.technicalReasons ? d.technicalReasons.join("、") : "データ不足"}
- 出来高: ${d.volume.toLocaleString()} (平均: ${d.avgVolume.toLocaleString()})
- 52週高値: ${d.high52w.toFixed(2)}円
- 52週安値: ${d.low52w.toFixed(2)}円
`
  })
  .join("\n")}

${marketNews ? "市場動向も考慮して、" : ""}JSON形式で返してください。`,
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
