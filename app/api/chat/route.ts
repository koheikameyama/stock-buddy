import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { GoogleGenAI } from "@google/genai"
import { calculatePortfolioFromTransactions } from "@/lib/portfolio-calculator"

function getGeminiClient() {
  return new GoogleGenAI({
    apiKey: process.env.GOOGLE_AI_API_KEY,
  })
}

// グラウンディングメタデータから参照ソースを整形
function formatGroundingSources(
  groundingMetadata: {
    groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>
  } | undefined
): string {
  if (!groundingMetadata?.groundingChunks?.length) {
    return ""
  }

  const sources = groundingMetadata.groundingChunks
    .filter((chunk) => chunk.web?.uri)
    .slice(0, 5) // 最大5件
    .map((chunk) => `• ${chunk.web?.title || "参考記事"}\n  ${chunk.web?.uri}`)
    .join("\n")

  if (!sources) {
    return ""
  }

  return `\n\n---\n📰 参考にした情報:\n${sources}`
}

interface StockContext {
  tickerCode: string
  name: string
  sector: string | null
  currentPrice: number | null
  type: "portfolio" | "watchlist"
  quantity?: number
  averagePurchasePrice?: number
  profit?: number
  profitPercent?: number
  targetPrice?: number | null
  stopLossPrice?: number | null
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { message, conversationHistory, stockContext } = await request.json() as {
      message: string
      conversationHistory?: Array<{ role: string; content: string }>
      stockContext?: StockContext
    }

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
          transactions: {
            orderBy: { transactionDate: "asc" },
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
        // Calculate from transactions
        const { quantity, averagePurchasePrice } = calculatePortfolioFromTransactions(
          ps.transactions
        )
        const averagePrice = averagePurchasePrice.toNumber()
        const totalCost = averagePrice * quantity
        const currentValue = currentPrice * quantity
        const profit = currentValue - totalCost
        const profitPercent = totalCost > 0 ? (profit / totalCost) * 100 : 0

        // 売却目標情報
        const targetInfo = []
        if (ps.targetPrice) {
          const target = Number(ps.targetPrice)
          const progressToTarget = averagePrice > 0 ? ((currentPrice - averagePrice) / (target - averagePrice) * 100) : 0
          targetInfo.push(`利確目標: ${target.toLocaleString()}円（達成度: ${Math.min(100, Math.max(0, progressToTarget)).toFixed(0)}%）`)
        }
        if (ps.stopLossPrice) {
          const stop = Number(ps.stopLossPrice)
          targetInfo.push(`損切ライン: ${stop.toLocaleString()}円${currentPrice < stop ? ` ⚠️損切ライン割れ` : ""}`)
        }

        return `- ${ps.stock.name}（${ps.stock.tickerCode}）
  保有: ${quantity}株
  購入時単価: ${averagePrice.toLocaleString()}円
  現在価格: ${currentPrice.toLocaleString()}円
  損益: ${profit >= 0 ? "+" : ""}${profit.toLocaleString()}円（${profitPercent >= 0 ? "+" : ""}${profitPercent.toFixed(2)}%）${targetInfo.length > 0 ? "\n  " + targetInfo.join("\n  ") : ""}`
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
          ws.alertPrice ? `\n  購入検討価格: ${Number(ws.alertPrice).toLocaleString()}円` : ""
        }`
      })
      .join("\n\n")

    // 銘柄コンテキストがある場合の情報を整形
    let stockContextInfo = ""
    if (stockContext) {
      // 売却目標情報を構築
      let targetSettingsInfo = ""
      if (stockContext.type === "portfolio" && stockContext.averagePurchasePrice) {
        const avgPrice = stockContext.averagePurchasePrice
        const curPrice = stockContext.currentPrice || 0
        const targetInfoParts = []

        if (stockContext.targetPrice) {
          const target = stockContext.targetPrice
          const progressToTarget = avgPrice > 0 && target > avgPrice ? ((curPrice - avgPrice) / (target - avgPrice) * 100) : 0
          targetInfoParts.push(`利確目標: ${target.toLocaleString()}円（達成度: ${Math.min(100, Math.max(0, progressToTarget)).toFixed(0)}%）`)
        }
        if (stockContext.stopLossPrice) {
          const stop = stockContext.stopLossPrice
          targetInfoParts.push(`損切ライン: ${stop.toLocaleString()}円${curPrice < stop ? ` ⚠️損切ライン割れ` : ""}`)
        }

        if (targetInfoParts.length > 0) {
          targetSettingsInfo = `
- 売却目標設定:
  ${targetInfoParts.join("\n  ")}`
        }
      }

      stockContextInfo = `
## 現在質問対象の銘柄（この銘柄について回答してください）
- 銘柄名: ${stockContext.name}（${stockContext.tickerCode}）
- セクター: ${stockContext.sector || "不明"}
- 現在価格: ${stockContext.currentPrice?.toLocaleString() || "不明"}円
- 種別: ${stockContext.type === "portfolio" ? "保有中" : "ウォッチリスト"}${
        stockContext.type === "portfolio" && stockContext.quantity
          ? `
- 保有数: ${stockContext.quantity}株
- 購入時単価: ${stockContext.averagePurchasePrice?.toLocaleString()}円
- 評価損益: ${(stockContext.profit ?? 0) >= 0 ? "+" : ""}${stockContext.profit?.toLocaleString()}円（${(stockContext.profitPercent ?? 0) >= 0 ? "+" : ""}${stockContext.profitPercent?.toFixed(2)}%）${targetSettingsInfo}`
          : ""
      }

**重要**: ユーザーは上記の銘柄について質問しています。この銘柄に特化して回答してください。${targetSettingsInfo ? "\nユーザーが設定した売却目標を考慮してアドバイスしてください。目標に近づいている場合や損切ラインに近づいている場合は言及してください。" : ""}
`
    }

    // システムプロンプトを構築
    const systemPrompt = `あなたは投資初心者向けのAIコーチです。
専門用語は使わず、中学生でも分かる言葉で説明してください。
${stockContextInfo}
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
10. 最新のニュースや市場情報を踏まえて回答する`

    // Gemini APIを呼び出し
    const ai = getGeminiClient()

    // 会話履歴を構築
    const contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = []

    // システムプロンプトを最初のユーザーメッセージとして追加
    contents.push({
      role: "user",
      parts: [{ text: systemPrompt }],
    })
    contents.push({
      role: "model",
      parts: [{ text: "はい、投資初心者向けのAIコーチとしてお手伝いします。ユーザーの情報を把握しました。何でもお気軽にご質問ください！" }],
    })

    // 会話履歴を追加（最大4件）
    if (conversationHistory && Array.isArray(conversationHistory)) {
      conversationHistory.slice(-4).forEach((msg: { role: string; content: string }) => {
        if (msg.role === "user") {
          contents.push({
            role: "user",
            parts: [{ text: msg.content }],
          })
        } else if (msg.role === "assistant") {
          contents.push({
            role: "model",
            parts: [{ text: msg.content }],
          })
        }
      })
    }

    // ユーザーの質問を追加
    contents.push({
      role: "user",
      parts: [{ text: message }],
    })

    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents,
      config: {
        tools: [{ googleSearch: {} }],
        temperature: 0.7,
        maxOutputTokens: 1500,
      },
    })

    const aiResponse =
      result.text ||
      "申し訳ございません。回答を生成できませんでした。"

    // グラウンディングソースを追加
    const groundingMetadata = result.candidates?.[0]?.groundingMetadata
    const response = aiResponse + formatGroundingSources(groundingMetadata)

    return NextResponse.json({
      response,
      suggestedQuestions: [], // 将来的に追加可能
    })
  } catch (error: unknown) {
    console.error("Chat API error:", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json(
      { error: "Internal server error", details: errorMessage },
      { status: 500 }
    )
  }
}
