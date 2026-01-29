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

export async function POST() {
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

    // 今日のレポートが既に存在する場合は削除してから再生成
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const existingReport = await prisma.dailyReport.findFirst({
      where: {
        portfolioId: portfolio.id,
        reportDate: today,
      },
    })

    if (existingReport) {
      await prisma.dailyReport.delete({
        where: { id: existingReport.id },
      })
      console.log(`既存の今日のレポートを削除して再生成します`)
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
          // 購入日を取得
          // シミュレーション: createdAt = 購入日
          // 実投資: 最初のbuyトランザクションの日付
          let firstPurchaseDate: Date | null = null

          if (ps.isSimulation) {
            firstPurchaseDate = ps.createdAt
            console.log(`[SIMULATION] ${ps.stock.tickerCode}: createdAt = ${ps.createdAt}`)
          } else {
            const firstPurchase = await prisma.transaction.findFirst({
              where: {
                portfolioId: portfolio.id,
                stockId: ps.stock.id,
                type: "buy",
              },
              orderBy: {
                executedAt: "asc",
              },
            })
            firstPurchaseDate = firstPurchase?.executedAt || null
            console.log(`[REAL] ${ps.stock.tickerCode}: firstPurchase = ${firstPurchase?.executedAt || 'null'}`)
          }

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
            firstPurchaseDate: firstPurchaseDate,
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
            content: `あなたは株式投資初心者に寄り添うAIコーチです。
ユーザーのポートフォリオを一緒に見守り、気づいたことを優しく共有してください。

【重要な心構え】
- 初心者にも分かりやすく、やさしい言葉で説明
- 専門用語は必ず簡単に解説
- 命令ではなく「〜かもしれません」「〜を検討しても良いかもしれません」といった提案口調
- 短期的な変動に一喜一憂させない（特に長期投資の場合）
- なぜそう考えたのか、理由を具体的に説明
- どの指標を見たのかを明示（技術指標を活用）
- 今後どうなったら注意が必要か、見守るポイントを提示

【投資助言ではないことの明示】
- 「売ってください」「買うべき」などの断定表現は使わない
- 「私が見た限りでは〜」「〜という可能性があります」など、あくまで情報提供
- 最終判断はユーザー自身が行うことを尊重

【技術指標の活用】
- RSI（相対力指数）: 30以下は売られすぎ、70以上は買われすぎの可能性
- 5日/25日移動平均（SMA5/SMA25）: 現在価格 > SMA なら上昇トレンドの可能性
- MACD: プラスなら上昇の勢い、マイナスなら下降の勢いがある可能性
- technicalSignal: 総合シグナル（参考値）
- technicalStrength: "強い買い"、"買い"、"中立"、"売り"、"強い売り"
- technicalReasons: シグナルの具体的理由（配列）

【注意事項】
- 技術指標はあくまで参考。絶対的なものではない
- 長期投資（1年以上）の場合、短期的な変動は気にしすぎない
- 購入から間もない銘柄は、まだ様子を見る段階

必ず以下のJSON形式で返してください：
{
  "action": "buy" | "sell" | "hold",
  "targetStock": "銘柄コード（該当する場合のみ）",
  "summary": "今日の気づきを優しく1-2文で",
  "reasoning": "技術指標を含めた分析内容を初心者向けに200-300字で。提案口調で。",
  "keyIndicators": [
    {"name": "指標名", "value": "値", "explanation": "この指標の意味を簡単に"}
  ],
  "futurePlan": "今後注意して見守るポイント。〜になったら〜を検討しても良いかもしれません、という提案口調で。"
}`,
          },
          {
            role: "user",
            content: `以下のポートフォリオを分析し、今日の投資判断を提案してください。

【投資スタイル】
- 投資期間: ${settings?.investmentPeriod}
- リスク許容度: ${settings?.riskTolerance}

${marketNews ? `【市場の最新動向（過去3日）】\n${marketNews}\n\n` : ""}【保有銘柄】
${validStocks
  .map((s) => {
    const d = s.data
    const ps = s.portfolioStock
    const daysSincePurchase = s.firstPurchaseDate
      ? Math.floor((Date.now() - new Date(s.firstPurchaseDate).getTime()) / (1000 * 60 * 60 * 24))
      : null
    const gainLoss = d.currentPrice - Number(ps.averagePrice)
    const gainLossPct = (gainLoss / Number(ps.averagePrice)) * 100

    return `
銘柄: ${s.stock.name} (${s.stock.tickerCode})
- 購入価格: ${Number(ps.averagePrice).toLocaleString()}円
- 保有株数: ${ps.quantity}株${daysSincePurchase !== null ? `
- 購入からの日数: ${daysSincePurchase}日${daysSincePurchase < 7 ? " ⚠️まだ様子見の段階です" : ""}` : ""}
- 現在価格: ${d.currentPrice.toLocaleString()}円
- 損益: ${gainLoss >= 0 ? "+" : ""}${gainLoss.toFixed(2)}円 (${gainLossPct >= 0 ? "+" : ""}${gainLossPct.toFixed(2)}%)
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
- 52週安値: ${d.low52w.toFixed(2)}円${ps.reason ? `
- 推奨理由: ${ps.reason}` : ""}
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
