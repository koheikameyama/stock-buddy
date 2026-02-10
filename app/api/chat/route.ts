import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { GoogleGenAI } from "@google/genai"
import { calculatePortfolioFromTransactions } from "@/lib/portfolio-calculator"
import { fetchStockPrices } from "@/lib/stock-price-fetcher"

function getGeminiClient() {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
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
  stockId: string
  tickerCode: string
  name: string
  sector: string | null
  currentPrice: number | null
  type: "portfolio" | "watchlist"
  quantity?: number
  averagePurchasePrice?: number
  profit?: number
  profitPercent?: number
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
          stock: true,
          transactions: {
            orderBy: { transactionDate: "asc" },
          },
        },
      }),
      prisma.watchlistStock.findMany({
        where: { userId: session.user.id },
        include: {
          stock: true,
        },
      }),
      prisma.userSettings.findUnique({
        where: { userId: session.user.id },
      }),
    ])

    // リアルタイム価格を取得
    const allTickerCodes = [
      ...portfolioStocks.map((ps) => ps.stock.tickerCode),
      ...watchlistStocks.map((ws) => ws.stock.tickerCode),
    ]
    const uniqueTickerCodes = Array.from(new Set(allTickerCodes))
    const realtimePrices = await fetchStockPrices(uniqueTickerCodes)
    const priceMap = new Map(realtimePrices.map((p) => [p.tickerCode.replace(".T", ""), p.currentPrice]))

    // ポートフォリオ情報を整形
    const portfolioInfo = portfolioStocks
      .map((ps) => {
        const tickerKey = ps.stock.tickerCode.replace(".T", "")
        const currentPrice = priceMap.get(tickerKey)
          ?? (ps.stock.currentPrice ? Number(ps.stock.currentPrice) : 0)
        // Calculate from transactions
        const { quantity, averagePurchasePrice } = calculatePortfolioFromTransactions(
          ps.transactions
        )
        const averagePrice = averagePurchasePrice.toNumber()
        const totalCost = averagePrice * quantity
        const currentValue = currentPrice * quantity
        const profit = currentValue - totalCost
        const profitPercent = totalCost > 0 ? (profit / totalCost) * 100 : 0

        return `- ${ps.stock.name}（${ps.stock.tickerCode}）
  保有: ${quantity}株
  購入時単価: ${averagePrice.toLocaleString()}円
  現在価格: ${currentPrice.toLocaleString()}円
  損益: ${profit >= 0 ? "+" : ""}${profit.toLocaleString()}円（${profitPercent >= 0 ? "+" : ""}${profitPercent.toFixed(2)}%）`
      })
      .join("\n\n")

    // ウォッチリスト情報を整形
    const watchlistInfo = watchlistStocks
      .map((ws) => {
        const tickerKey = ws.stock.tickerCode.replace(".T", "")
        const currentPrice = priceMap.get(tickerKey)
          ?? (ws.stock.currentPrice ? Number(ws.stock.currentPrice) : 0)

        return `- ${ws.stock.name}（${ws.stock.tickerCode}）
  現在価格: ${currentPrice.toLocaleString()}円`
      })
      .join("\n\n")

    // 銘柄コンテキストがある場合の情報を整形
    let stockContextInfo = ""
    if (stockContext) {
      // DBから詳細データを取得
      const [stockDetails, latestAnalysis, portfolioDetails, purchaseRecommendation] = await Promise.all([
        // 銘柄の財務指標
        prisma.stock.findUnique({
          where: { id: stockContext.stockId },
          select: {
            pbr: true,
            per: true,
            roe: true,
            operatingCF: true,
            freeCF: true,
            fiftyTwoWeekHigh: true,
            fiftyTwoWeekLow: true,
            beginnerScore: true,
            growthScore: true,
            dividendScore: true,
            stabilityScore: true,
          },
        }),
        // 最新のAI分析
        prisma.stockAnalysis.findFirst({
          where: { stockId: stockContext.stockId },
          orderBy: { analyzedAt: "desc" },
        }),
        // ポートフォリオ詳細（保有中の場合）
        stockContext.type === "portfolio"
          ? prisma.portfolioStock.findFirst({
              where: {
                userId: session.user.id,
                stockId: stockContext.stockId,
              },
            })
          : null,
        // 購入推奨（ウォッチリストの場合）
        stockContext.type === "watchlist"
          ? prisma.purchaseRecommendation.findFirst({
              where: { stockId: stockContext.stockId },
              orderBy: { date: "desc" },
            })
          : null,
      ])

      // 財務指標を整形
      const formatCashFlow = (value: number | null | undefined): string => {
        if (value === null || value === undefined) return "不明"
        const absValue = Math.abs(value)
        if (absValue >= 1_000_000_000_000) return `${(value / 1_000_000_000_000).toFixed(1)}兆円`
        if (absValue >= 100_000_000) return `${(value / 100_000_000).toFixed(0)}億円`
        return `${value.toLocaleString()}円`
      }

      let financialInfo = ""
      if (stockDetails) {
        const metrics = []
        if (stockDetails.pbr !== null) metrics.push(`割安度(PBR): ${Number(stockDetails.pbr).toFixed(2)}倍${Number(stockDetails.pbr) < 1 ? "（割安）" : ""}`)
        if (stockDetails.per !== null) metrics.push(`収益性(PER): ${Number(stockDetails.per).toFixed(2)}倍${Number(stockDetails.per) < 15 ? "（割安傾向）" : ""}`)
        if (stockDetails.roe !== null) metrics.push(`稼ぐ力(ROE): ${Number(stockDetails.roe).toFixed(2)}%${Number(stockDetails.roe) > 10 ? "（優秀）" : ""}`)
        if (stockDetails.operatingCF !== null) metrics.push(`本業の稼ぎ: ${formatCashFlow(Number(stockDetails.operatingCF))}${Number(stockDetails.operatingCF) > 0 ? "（健全）" : "（注意）"}`)
        if (stockDetails.freeCF !== null) metrics.push(`フリーCF: ${formatCashFlow(Number(stockDetails.freeCF))}${Number(stockDetails.freeCF) > 0 ? "（余裕あり）" : "（注意）"}`)
        if (stockDetails.fiftyTwoWeekHigh !== null && stockDetails.fiftyTwoWeekLow !== null) {
          metrics.push(`52週高値/安値: ${Number(stockDetails.fiftyTwoWeekHigh).toLocaleString()}円 / ${Number(stockDetails.fiftyTwoWeekLow).toLocaleString()}円`)
        }
        if (metrics.length > 0) {
          financialInfo = `\n### 財務指標\n${metrics.map(m => `- ${m}`).join("\n")}`
        }

        // スコア情報
        const scores = []
        if (stockDetails.beginnerScore !== null) scores.push(`初心者おすすめ度: ${stockDetails.beginnerScore}点`)
        if (stockDetails.growthScore !== null) scores.push(`成長性: ${stockDetails.growthScore}点`)
        if (stockDetails.dividendScore !== null) scores.push(`配当: ${stockDetails.dividendScore}点`)
        if (stockDetails.stabilityScore !== null) scores.push(`安定性: ${stockDetails.stabilityScore}点`)
        if (scores.length > 0) {
          financialInfo += `\n### 各種スコア（100点満点）\n${scores.map(s => `- ${s}`).join("\n")}`
        }
      }

      // AI分析情報
      let analysisInfo = ""
      if (latestAnalysis) {
        const getTrendText = (trend: string) => {
          switch (trend) {
            case "up": return "上昇傾向"
            case "down": return "下降傾向"
            default: return "横ばい"
          }
        }
        const getRecommendationText = (rec: string) => {
          switch (rec) {
            case "buy": return "買い推奨"
            case "sell": return "売却検討"
            default: return "保有継続"
          }
        }
        analysisInfo = `
### AI売買分析（${new Date(latestAnalysis.analyzedAt).toLocaleDateString("ja-JP")}時点）
- 短期予測（1週間）: ${getTrendText(latestAnalysis.shortTermTrend)} ¥${Number(latestAnalysis.shortTermPriceLow).toLocaleString()}〜¥${Number(latestAnalysis.shortTermPriceHigh).toLocaleString()}
- 中期予測（1ヶ月）: ${getTrendText(latestAnalysis.midTermTrend)} ¥${Number(latestAnalysis.midTermPriceLow).toLocaleString()}〜¥${Number(latestAnalysis.midTermPriceHigh).toLocaleString()}
- 長期予測（3ヶ月）: ${getTrendText(latestAnalysis.longTermTrend)} ¥${Number(latestAnalysis.longTermPriceLow).toLocaleString()}〜¥${Number(latestAnalysis.longTermPriceHigh).toLocaleString()}
- 総合判断: ${getRecommendationText(latestAnalysis.recommendation)}（信頼度: ${Math.round(latestAnalysis.confidence * 100)}%）
- アドバイス: ${latestAnalysis.advice}`
      }

      // ポートフォリオ詳細（保有中の場合）
      let portfolioInfo = ""
      if (portfolioDetails) {
        if (portfolioDetails.shortTerm || portfolioDetails.mediumTerm || portfolioDetails.longTerm) {
          portfolioInfo = "\n### 保有者向けAI分析"
          if (portfolioDetails.shortTerm) portfolioInfo += `\n- 短期展望: ${portfolioDetails.shortTerm}`
          if (portfolioDetails.mediumTerm) portfolioInfo += `\n- 中期展望: ${portfolioDetails.mediumTerm}`
          if (portfolioDetails.longTerm) portfolioInfo += `\n- 長期展望: ${portfolioDetails.longTerm}`
        }
        if (portfolioDetails.suggestedSellPrice || portfolioDetails.sellCondition) {
          portfolioInfo += "\n### 売却提案"
          if (portfolioDetails.suggestedSellPrice) portfolioInfo += `\n- 提案売却価格: ¥${Number(portfolioDetails.suggestedSellPrice).toLocaleString()}`
          if (portfolioDetails.sellCondition) portfolioInfo += `\n- 売却条件: ${portfolioDetails.sellCondition}`
        }
        if (portfolioDetails.emotionalCoaching) {
          portfolioInfo += `\n- コーチングメッセージ: ${portfolioDetails.emotionalCoaching}`
        }
      }

      // 購入推奨（ウォッチリストの場合）
      let purchaseInfo = ""
      if (purchaseRecommendation) {
        const getRecommendationText = (rec: string) => {
          switch (rec) {
            case "buy": return "買い時"
            case "pass": return "見送り推奨"
            default: return "様子見"
          }
        }
        purchaseInfo = `
### AI購入判断（${purchaseRecommendation.date.toLocaleDateString("ja-JP")}時点）
- 判断: ${getRecommendationText(purchaseRecommendation.recommendation)}（信頼度: ${Math.round(purchaseRecommendation.confidence * 100)}%）
- 理由: ${purchaseRecommendation.reason}`
        if (purchaseRecommendation.shouldBuyToday !== null) {
          purchaseInfo += `\n- 今日買うべき？: ${purchaseRecommendation.shouldBuyToday ? "はい" : "いいえ"}`
        }
        if (purchaseRecommendation.idealEntryPrice) {
          purchaseInfo += `\n- 理想の買い値: ¥${Number(purchaseRecommendation.idealEntryPrice).toLocaleString()}`
        }
        if (purchaseRecommendation.buyTimingExplanation) {
          purchaseInfo += `\n- タイミング解説: ${purchaseRecommendation.buyTimingExplanation}`
        }
        if (purchaseRecommendation.positives) {
          purchaseInfo += `\n- 良い点: ${purchaseRecommendation.positives}`
        }
        if (purchaseRecommendation.concerns) {
          purchaseInfo += `\n- 懸念点: ${purchaseRecommendation.concerns}`
        }
        if (purchaseRecommendation.caution) {
          purchaseInfo += `\n- 注意事項: ${purchaseRecommendation.caution}`
        }
      }

      stockContextInfo = `
## 現在質問対象の銘柄（この銘柄について回答してください）
### 基本情報
- 銘柄名: ${stockContext.name}（${stockContext.tickerCode}）
- セクター: ${stockContext.sector || "不明"}
- 現在価格: ${stockContext.currentPrice?.toLocaleString() || "不明"}円
- 種別: ${stockContext.type === "portfolio" ? "保有中" : "ウォッチリスト"}${
        stockContext.type === "portfolio" && stockContext.quantity
          ? `
- 保有数: ${stockContext.quantity}株
- 購入時単価: ${stockContext.averagePurchasePrice?.toLocaleString()}円
- 評価損益: ${(stockContext.profit ?? 0) >= 0 ? "+" : ""}${stockContext.profit?.toLocaleString()}円（${(stockContext.profitPercent ?? 0) >= 0 ? "+" : ""}${stockContext.profitPercent?.toFixed(2)}%）`
          : ""
      }${financialInfo}${analysisInfo}${portfolioInfo}${purchaseInfo}

**重要**: ユーザーは上記の銘柄について質問しています。上記の全ての情報（財務指標、AI分析、予測、評価など）を踏まえて、この銘柄に特化した具体的な回答をしてください。
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
7. 親しみやすく丁寧な「ですます調」で話す
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
