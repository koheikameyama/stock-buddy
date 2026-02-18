import { NextRequest, NextResponse } from "next/server"
import { verifyCronAuth } from "@/lib/cron-auth"
import { prisma } from "@/lib/prisma"
import { getRelatedNews, formatNewsForPrompt } from "@/lib/news-rag"
import { getOpenAIClient } from "@/lib/openai"

interface MoverAnalysis {
  analysis: string
}

const ANALYSIS_SCHEMA = {
  type: "json_schema" as const,
  json_schema: {
    name: "mover_analysis",
    strict: true,
    schema: {
      type: "object",
      properties: {
        analysis: {
          type: "string",
          description:
            "株価変動の原因分析（2-3文。初心者にもわかりやすく専門用語には解説を添える）",
        },
      },
      required: ["analysis"],
      additionalProperties: false,
    },
  },
}

/**
 * POST /api/stocks/[stockId]/mover-analysis
 * 個別銘柄の変動原因を分析
 *
 * Body: { type: "gainer" | "loser" }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ stockId: string }> }
) {
  const authError = verifyCronAuth(request)
  if (authError) return authError

  const { stockId } = await params

  try {
    const body = await request.json()
    const moverType: "gainer" | "loser" = body.type || "gainer"

    // 銘柄情報を取得
    const stock = await prisma.stock.findUnique({
      where: { id: stockId },
      select: {
        id: true,
        tickerCode: true,
        name: true,
        sector: true,
        dailyChangeRate: true,
        latestPrice: true,
        latestVolume: true,
        weekChangeRate: true,
        volatility: true,
        volumeRatio: true,
        marketCap: true,
      },
    })

    if (!stock) {
      return NextResponse.json({ error: "Stock not found" }, { status: 404 })
    }

    const changeRate = Number(stock.dailyChangeRate) || 0

    // 関連ニュースを取得
    const tickerCode = stock.tickerCode.replace(".T", "")
    const news = await getRelatedNews({
      tickerCodes: [tickerCode],
      sectors: stock.sector ? [stock.sector] : [],
      limit: 5,
      daysAgo: 3,
    })

    const newsForPrompt = formatNewsForPrompt(news)
    const direction = moverType === "gainer" ? "上昇" : "下落"

    // OpenAIで原因分析
    const response = await getOpenAIClient().chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `あなたは株式投資の専門家です。初心者向けに株価変動の原因を分析してください。
専門用語を使う場合は必ず簡単な解説を添えてください。
例:「出来高（取引された株の数）が急増しており...」

【重要: ハルシネーション防止】
- 提供されたニュース情報のみを参考にしてください
- ニュースにない情報（決算発表、業績予想、M&A、人事異動など）は推測・創作しないでください
- 関連ニュースがない場合は「具体的な材料は確認できませんが」と前置きしてください
- 過去の一般知識（例:「○○社は過去に○○した」）は使用しないでください`,
        },
        {
          role: "user",
          content: `以下の銘柄が本日${direction}しました。原因を分析してください。

【銘柄情報】
- 銘柄: ${stock.name}（${stock.tickerCode}）
- セクター: ${stock.sector || "不明"}
- 前日比: ${changeRate > 0 ? "+" : ""}${changeRate.toFixed(2)}%
- 現在株価: ${Number(stock.latestPrice).toLocaleString()}円
- 出来高: ${stock.latestVolume ? Number(stock.latestVolume).toLocaleString() : "不明"}
- 週間変化率: ${stock.weekChangeRate ? `${Number(stock.weekChangeRate) > 0 ? "+" : ""}${Number(stock.weekChangeRate).toFixed(2)}%` : "不明"}
- 出来高比率: ${stock.volumeRatio ? `${Number(stock.volumeRatio).toFixed(2)}倍` : "不明"}

【関連ニュース】
${newsForPrompt || "関連ニュースなし"}

【回答の制約】
- 上記のニュース情報のみを参考にしてください
- ニュースにない情報は創作しないでください`,
        },
      ],
      response_format: ANALYSIS_SCHEMA,
      temperature: 0.3,
    })

    const parsed: MoverAnalysis = JSON.parse(
      response.choices[0].message.content || "{}"
    )

    return NextResponse.json({
      stockId: stock.id,
      changeRate,
      analysis: parsed.analysis || `${stock.name}が${direction}しました。`,
      relatedNews: news.map((n) => ({
        title: n.title,
        url: n.url,
        sentiment: n.sentiment,
      })),
    })
  } catch (error) {
    console.error("Error analyzing mover:", error)
    return NextResponse.json(
      { error: "変動分析に失敗しました" },
      { status: 500 }
    )
  }
}
