import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { OpenAI } from "openai"
import {
  getRelatedNews,
  formatNewsForPrompt,
  formatNewsReferences,
} from "@/lib/news-rag"

function getOpenAIClient() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { message, conversationHistory } = await request.json()

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      )
    }

    // ユーザーの保有銘柄とウォッチリストを取得
    const [portfolioStocks, watchlistStocks, userSettings] = await Promise.all([
      prisma.portfolioStock.findMany({
        where: { userId: session.user.id },
        include: {
          stock: {
            include: {
              prices: {
                orderBy: { date: "desc" },
                take: 1,
              },
            },
          },
        },
      }),
      prisma.watchlistStock.findMany({
        where: { userId: session.user.id },
        include: {
          stock: {
            include: {
              prices: {
                orderBy: { date: "desc" },
                take: 1,
              },
            },
          },
        },
      }),
      prisma.userSettings.findUnique({
        where: { userId: session.user.id },
      }),
    ])

    // ポートフォリオ情報を整形
    const portfolioInfo = portfolioStocks
      .map((ps) => {
        const currentPrice = ps.stock.prices[0]?.close
          ? Number(ps.stock.prices[0].close)
          : ps.stock.currentPrice
          ? Number(ps.stock.currentPrice)
          : 0
        const averagePrice = Number(ps.averagePurchasePrice)
        const quantity = ps.quantity
        const totalCost = averagePrice * quantity
        const currentValue = currentPrice * quantity
        const profit = currentValue - totalCost
        const profitPercent = totalCost > 0 ? (profit / totalCost) * 100 : 0

        return `- ${ps.stock.name}（${ps.stock.tickerCode}）
  保有: ${quantity}株
  取得単価: ${averagePrice.toLocaleString()}円
  現在価格: ${currentPrice.toLocaleString()}円
  損益: ${profit >= 0 ? "+" : ""}${profit.toLocaleString()}円（${profitPercent >= 0 ? "+" : ""}${profitPercent.toFixed(2)}%）`
      })
      .join("\n\n")

    // ウォッチリスト情報を整形
    const watchlistInfo = watchlistStocks
      .map((ws) => {
        const currentPrice = ws.stock.prices[0]?.close
          ? Number(ws.stock.prices[0].close)
          : ws.stock.currentPrice
          ? Number(ws.stock.currentPrice)
          : 0

        return `- ${ws.stock.name}（${ws.stock.tickerCode}）
  現在価格: ${currentPrice.toLocaleString()}円${
          ws.alertPrice ? `\n  アラート価格: ${Number(ws.alertPrice).toLocaleString()}円` : ""
        }`
      })
      .join("\n\n")

    // 関連ニュースを取得
    const tickerCodes = [
      ...portfolioStocks.map((ps) => ps.stock.tickerCode),
      ...watchlistStocks.map((ws) => ws.stock.tickerCode),
    ]

    const sectors = Array.from(
      new Set([
        ...portfolioStocks
          .map((ps) => ps.stock.sector)
          .filter((s): s is string => !!s),
        ...watchlistStocks
          .map((ws) => ws.stock.sector)
          .filter((s): s is string => !!s),
      ])
    )

    const relatedNews = await getRelatedNews({
      tickerCodes,
      sectors,
      limit: 10,
      daysAgo: 7,
    })

    // システムプロンプトを構築
    const systemPrompt = `あなたは投資初心者向けのAIコーチです。
専門用語は使わず、中学生でも分かる言葉で説明してください。

## ユーザーの保有銘柄
${portfolioStocks.length > 0 ? portfolioInfo : "保有銘柄はありません"}

## ユーザーのウォッチリスト
${watchlistStocks.length > 0 ? watchlistInfo : "ウォッチリストは空です"}

## ユーザーの投資スタイル
${
  userSettings
    ? `- 投資期間: ${userSettings.investmentPeriod === "short" ? "短期（1年未満）" : userSettings.investmentPeriod === "medium" ? "中期（1-3年）" : "長期（3年以上）"}
- リスク許容度: ${userSettings.riskTolerance === "low" ? "低（安定志向）" : userSettings.riskTolerance === "medium" ? "中（バランス）" : "高（積極的）"}`
    : "投資スタイル情報はありません"
}

## 最新のニュース情報
${formatNewsForPrompt(relatedNews)}

## 回答のルール
1. 専門用語（PER、ROE、移動平均線など）は使わない
2. 「成長性」「安定性」「割安」など平易な言葉を使う
3. 断定的な表現は避け、「〜と考えられます」「〜の可能性があります」を使う
4. ユーザーの投資スタイルに合わせたアドバイスをする
5. 最終判断はユーザー自身が行うことを促す
6. 投資にはリスクがあることを適度に伝える
7. 親しみやすく、励ます口調で話す
8. 回答は簡潔に（300字以内を目安に）
9. ユーザーが保有していない銘柄については、一般的なアドバイスをする

## ニュース参照に関する重要なルール
1. 提供されたニュース情報のみを参照してください
2. ニュースにない情報は推測や創作をしないでください
3. 不確かな場合は「この情報は提供されたニュースにはありません」と明示してください
4. 回答の最後に必ず参考にしたニュースを列挙してください
5. 日付や数値は提供されたデータから正確に引用してください`

    // OpenAI APIを呼び出し
    const openai = getOpenAIClient()

    const messages: any[] = [{ role: "system", content: systemPrompt }]

    // 会話履歴を追加（最大4件）
    if (conversationHistory && Array.isArray(conversationHistory)) {
      conversationHistory.slice(-4).forEach((msg: any) => {
        if (msg.role === "user" || msg.role === "assistant") {
          messages.push({
            role: msg.role,
            content: msg.content,
          })
        }
      })
    }

    // ユーザーの質問を追加
    messages.push({
      role: "user",
      content: message,
    })

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // コスト重視
      messages,
      temperature: 0.7,
      max_tokens: 600,
    })

    const aiResponse =
      completion.choices[0]?.message?.content ||
      "申し訳ございません。回答を生成できませんでした。"

    // 参考ニュースを追加
    const response = aiResponse + formatNewsReferences(relatedNews)

    return NextResponse.json({
      response,
      suggestedQuestions: [], // 将来的に追加可能
    })
  } catch (error: any) {
    console.error("Chat API error:", error)
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    )
  }
}
