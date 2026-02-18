import { NextRequest, NextResponse } from "next/server"
import pLimit from "p-limit"
import { verifyCronAuth } from "@/lib/cron-auth"
import { prisma } from "@/lib/prisma"
import { getRelatedNews, formatNewsForPrompt } from "@/lib/news-rag"
import { getTodayForDB } from "@/lib/date-utils"
import { getOpenAIClient } from "@/lib/openai"

const MOVERS_COUNT = 5 // 上昇/下落それぞれ5銘柄
const AI_CONCURRENCY_LIMIT = 5 // AI API同時リクエスト数の制限

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
 * GET /api/market-analysis/gainers-losers
 * 日次上昇/下落ランキングを取得
 * 当日データがなければ最新データを返す
 */
export async function GET() {
  try {
    const todayUTC = getTodayForDB()

    // まず当日データを取得
    let movers = await prisma.dailyMarketMover.findMany({
      where: { date: todayUTC },
      include: {
        stock: {
          select: {
            id: true,
            tickerCode: true,
            name: true,
            sector: true,
            latestPrice: true,
            latestVolume: true,
            marketCap: true,
          },
        },
      },
      orderBy: { position: "asc" },
    })

    let isToday = true

    if (movers.length === 0) {
      // 当日データがなければ最新データを取得
      const latest = await prisma.dailyMarketMover.findFirst({
        select: { date: true },
        orderBy: { date: "desc" },
      })

      if (latest) {
        movers = await prisma.dailyMarketMover.findMany({
          where: { date: latest.date },
          include: {
            stock: {
              select: {
                id: true,
                tickerCode: true,
                name: true,
                sector: true,
                latestPrice: true,
                latestVolume: true,
                marketCap: true,
              },
            },
          },
          orderBy: { position: "asc" },
        })
        isToday = false
      }
    }

    const gainers = movers
      .filter((m) => m.type === "gainer")
      .map((m) => ({
        position: m.position,
        changeRate: Number(m.changeRate),
        analysis: m.analysis,
        relatedNews: m.relatedNews,
        stock: {
          id: m.stock.id,
          tickerCode: m.stock.tickerCode,
          name: m.stock.name,
          sector: m.stock.sector,
          latestPrice: m.stock.latestPrice ? Number(m.stock.latestPrice) : null,
        },
      }))

    const losers = movers
      .filter((m) => m.type === "loser")
      .map((m) => ({
        position: m.position,
        changeRate: Number(m.changeRate),
        analysis: m.analysis,
        relatedNews: m.relatedNews,
        stock: {
          id: m.stock.id,
          tickerCode: m.stock.tickerCode,
          name: m.stock.name,
          sector: m.stock.sector,
          latestPrice: m.stock.latestPrice ? Number(m.stock.latestPrice) : null,
        },
      }))

    return NextResponse.json({
      gainers,
      losers,
      date: movers[0]?.date || null,
      isToday,
    })
  } catch (error) {
    console.error("Error fetching gainers/losers:", error)
    return NextResponse.json(
      { error: "上昇/下落ランキングの取得に失敗しました" },
      { status: 500 }
    )
  }
}

/**
 * POST /api/market-analysis/gainers-losers
 * 日次上昇/下落ランキングを生成（場後にCRONで実行）
 */
export async function POST(request: NextRequest) {
  const authError = verifyCronAuth(request)
  if (authError) return authError

  try {
    // dailyChangeRateが存在する銘柄を対象に上昇/下落トップを取得
    const [gainers, losers] = await Promise.all([
      prisma.stock.findMany({
        where: {
          dailyChangeRate: { not: null },
          latestVolume: { gte: 100000 },
        },
        orderBy: { dailyChangeRate: "desc" },
        take: MOVERS_COUNT,
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
      }),
      prisma.stock.findMany({
        where: {
          dailyChangeRate: { not: null },
          latestVolume: { gte: 100000 },
        },
        orderBy: { dailyChangeRate: "asc" },
        take: MOVERS_COUNT,
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
      }),
    ])

    if (gainers.length === 0 && losers.length === 0) {
      return NextResponse.json(
        { error: "株価データが不足しています" },
        { status: 400 }
      )
    }

    const today = getTodayForDB()

    // 既存データを削除（今日の日付）
    await prisma.dailyMarketMover.deleteMany({
      where: { date: today },
    })

    // 上昇銘柄の分析を生成
    const gainerResults = await analyzeMovers(gainers, "gainer")
    // 下落銘柄の分析を生成
    const loserResults = await analyzeMovers(losers, "loser")

    // DBに保存
    const allData = [
      ...gainerResults.map((r, idx) => ({
        date: today,
        stockId: r.stockId,
        type: "gainer" as const,
        position: idx + 1,
        changeRate: r.changeRate,
        analysis: r.analysis,
        relatedNews: r.relatedNews,
      })),
      ...loserResults.map((r, idx) => ({
        date: today,
        stockId: r.stockId,
        type: "loser" as const,
        position: idx + 1,
        changeRate: r.changeRate,
        analysis: r.analysis,
        relatedNews: r.relatedNews,
      })),
    ]

    await prisma.dailyMarketMover.createMany({ data: allData })

    return NextResponse.json({
      success: true,
      gainers: gainerResults.length,
      losers: loserResults.length,
    })
  } catch (error) {
    console.error("Error generating gainers/losers analysis:", error)
    return NextResponse.json(
      { error: "上昇/下落ランキングの生成に失敗しました" },
      { status: 500 }
    )
  }
}

async function analyzeMovers(
  stocks: {
    id: string
    tickerCode: string
    name: string
    sector: string | null
    dailyChangeRate: unknown
    latestPrice: unknown
    latestVolume: bigint | null
    weekChangeRate: unknown
    volatility: unknown
    volumeRatio: unknown
    marketCap: unknown
  }[],
  type: "gainer" | "loser"
) {
  const direction = type === "gainer" ? "上昇" : "下落"
  const limit = pLimit(AI_CONCURRENCY_LIMIT)

  // 各銘柄の分析を並列実行
  const tasks = stocks.map((stock) =>
    limit(async () => {
      // 関連ニュースを取得
      const tickerCode = stock.tickerCode.replace(".T", "")
      const news = await getRelatedNews({
        tickerCodes: [tickerCode],
        sectors: stock.sector ? [stock.sector] : [],
        limit: 5,
        daysAgo: 3,
      })

      const newsForPrompt = formatNewsForPrompt(news)
      const changeRate = Number(stock.dailyChangeRate)

      // OpenAIで原因分析
      try {
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

        return {
          stockId: stock.id,
          changeRate,
          analysis: parsed.analysis || `${stock.name}が${direction}しました。`,
          relatedNews: news.map((n) => ({
            title: n.title,
            url: n.url,
            sentiment: n.sentiment,
          })),
        }
      } catch (error) {
        console.error(`Error analyzing ${stock.tickerCode}:`, error)
        return {
          stockId: stock.id,
          changeRate,
          analysis: `${stock.name}（${stock.tickerCode}）が前日比${changeRate > 0 ? "+" : ""}${changeRate.toFixed(2)}%${direction}しました。`,
          relatedNews: news.map((n) => ({
            title: n.title,
            url: n.url,
            sentiment: n.sentiment,
          })),
        }
      }
    })
  )

  return Promise.all(tasks)
}
