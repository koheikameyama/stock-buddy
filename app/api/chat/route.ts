import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { GoogleGenAI } from "@google/genai"
import { calculatePortfolioFromTransactions } from "@/lib/portfolio-calculator"
import { fetchStockPrices } from "@/lib/stock-price-fetcher"
import { getRelatedNews, formatNewsForPrompt, formatNewsReferences, type RelatedNews } from "@/lib/news-rag"

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
        const currentPrice = priceMap.get(tickerKey) ?? 0
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
        const currentPrice = priceMap.get(tickerKey) ?? 0

        return `- ${ws.stock.name}（${ws.stock.tickerCode}）
  現在価格: ${currentPrice.toLocaleString()}円`
      })
      .join("\n\n")

    // 銘柄コンテキストがある場合の情報を整形（JSON構造化）
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

      // 構造化データを作成
      interface StockData {
        基本情報: {
          銘柄名: string
          証券コード: string
          セクター: string
          現在価格: number | null
          種別: string
          保有状況?: {
            保有株数: number
            平均取得単価: number
            評価損益額: number
            評価損益率: string
          }
        }
        財務指標?: {
          PBR?: { 値: number; 評価: string }
          PER?: { 値: number; 評価: string }
          ROE?: { 値: number; 評価: string }
          営業キャッシュフロー?: { 値: number; 評価: string }
          フリーキャッシュフロー?: { 値: number; 評価: string }
          週52高値?: number
          週52安値?: number
        }
        スコア?: {
          初心者おすすめ度?: number
          成長性?: number
          配当?: number
          安定性?: number
        }
        AI売買分析?: {
          分析日: string
          短期予測: { トレンド: string; 予想価格帯: { 下限: number; 上限: number } }
          中期予測: { トレンド: string; 予想価格帯: { 下限: number; 上限: number } }
          長期予測: { トレンド: string; 予想価格帯: { 下限: number; 上限: number } }
          総合判断: string
          信頼度: number
          アドバイス: string
        }
        保有者向け分析?: {
          短期展望?: string
          中期展望?: string
          長期展望?: string
          提案売却価格?: number
          売却条件?: string
          コーチングメッセージ?: string
        }
        購入判断?: {
          判断日: string
          推奨: string
          信頼度: number
          理由: string
          今日買うべきか?: boolean
          理想の買い値?: number
          タイミング解説?: string
          良い点?: string
          懸念点?: string
          注意事項?: string
        }
      }

      const getTrendText = (trend: string) => {
        switch (trend) {
          case "up": return "上昇傾向"
          case "down": return "下降傾向"
          default: return "横ばい"
        }
      }

      const getRecommendationText = (rec: string, type: "analysis" | "purchase") => {
        if (type === "analysis") {
          switch (rec) {
            case "buy": return "買い推奨"
            case "sell": return "売却検討"
            default: return "保有継続"
          }
        } else {
          switch (rec) {
            case "buy": return "買い時"
            case "pass": return "見送り推奨"
            default: return "様子見"
          }
        }
      }

      const stockData: StockData = {
        基本情報: {
          銘柄名: stockContext.name,
          証券コード: stockContext.tickerCode,
          セクター: stockContext.sector || "不明",
          現在価格: stockContext.currentPrice,
          種別: stockContext.type === "portfolio" ? "保有中" : "ウォッチリスト",
        },
      }

      // 保有状況
      if (stockContext.type === "portfolio" && stockContext.quantity) {
        stockData.基本情報.保有状況 = {
          保有株数: stockContext.quantity,
          平均取得単価: stockContext.averagePurchasePrice ?? 0,
          評価損益額: stockContext.profit ?? 0,
          評価損益率: `${(stockContext.profitPercent ?? 0).toFixed(2)}%`,
        }
      }

      // 財務指標
      if (stockDetails) {
        stockData.財務指標 = {}
        if (stockDetails.pbr !== null) {
          const pbr = Number(stockDetails.pbr)
          stockData.財務指標.PBR = { 値: pbr, 評価: pbr < 1 ? "割安" : pbr < 1.5 ? "適正" : "割高" }
        }
        if (stockDetails.per !== null) {
          const per = Number(stockDetails.per)
          stockData.財務指標.PER = { 値: per, 評価: per < 10 ? "割安" : per < 20 ? "適正" : "割高" }
        }
        if (stockDetails.roe !== null) {
          const roe = Number(stockDetails.roe)
          stockData.財務指標.ROE = { 値: roe, 評価: roe > 15 ? "優秀" : roe > 8 ? "良好" : "要改善" }
        }
        if (stockDetails.operatingCF !== null) {
          const cf = Number(stockDetails.operatingCF)
          stockData.財務指標.営業キャッシュフロー = { 値: cf, 評価: cf > 0 ? "健全" : "注意" }
        }
        if (stockDetails.freeCF !== null) {
          const fcf = Number(stockDetails.freeCF)
          stockData.財務指標.フリーキャッシュフロー = { 値: fcf, 評価: fcf > 0 ? "余裕あり" : "注意" }
        }
        if (stockDetails.fiftyTwoWeekHigh !== null) {
          stockData.財務指標.週52高値 = Number(stockDetails.fiftyTwoWeekHigh)
        }
        if (stockDetails.fiftyTwoWeekLow !== null) {
          stockData.財務指標.週52安値 = Number(stockDetails.fiftyTwoWeekLow)
        }

        // スコア
        if (stockDetails.beginnerScore !== null || stockDetails.growthScore !== null ||
            stockDetails.dividendScore !== null || stockDetails.stabilityScore !== null) {
          stockData.スコア = {}
          if (stockDetails.beginnerScore !== null) stockData.スコア.初心者おすすめ度 = stockDetails.beginnerScore
          if (stockDetails.growthScore !== null) stockData.スコア.成長性 = stockDetails.growthScore
          if (stockDetails.dividendScore !== null) stockData.スコア.配当 = stockDetails.dividendScore
          if (stockDetails.stabilityScore !== null) stockData.スコア.安定性 = stockDetails.stabilityScore
        }
      }

      // AI分析
      if (latestAnalysis) {
        stockData.AI売買分析 = {
          分析日: new Date(latestAnalysis.analyzedAt).toLocaleDateString("ja-JP"),
          短期予測: {
            トレンド: getTrendText(latestAnalysis.shortTermTrend),
            予想価格帯: { 下限: Number(latestAnalysis.shortTermPriceLow), 上限: Number(latestAnalysis.shortTermPriceHigh) },
          },
          中期予測: {
            トレンド: getTrendText(latestAnalysis.midTermTrend),
            予想価格帯: { 下限: Number(latestAnalysis.midTermPriceLow), 上限: Number(latestAnalysis.midTermPriceHigh) },
          },
          長期予測: {
            トレンド: getTrendText(latestAnalysis.longTermTrend),
            予想価格帯: { 下限: Number(latestAnalysis.longTermPriceLow), 上限: Number(latestAnalysis.longTermPriceHigh) },
          },
          総合判断: getRecommendationText(latestAnalysis.recommendation, "analysis"),
          信頼度: Math.round(latestAnalysis.confidence * 100),
          アドバイス: latestAnalysis.advice,
        }
      }

      // ポートフォリオ詳細
      if (portfolioDetails) {
        stockData.保有者向け分析 = {}
        if (portfolioDetails.shortTerm) stockData.保有者向け分析.短期展望 = portfolioDetails.shortTerm
        if (portfolioDetails.mediumTerm) stockData.保有者向け分析.中期展望 = portfolioDetails.mediumTerm
        if (portfolioDetails.longTerm) stockData.保有者向け分析.長期展望 = portfolioDetails.longTerm
        if (portfolioDetails.suggestedSellPrice) stockData.保有者向け分析.提案売却価格 = Number(portfolioDetails.suggestedSellPrice)
        if (portfolioDetails.sellCondition) stockData.保有者向け分析.売却条件 = portfolioDetails.sellCondition
        if (portfolioDetails.emotionalCoaching) stockData.保有者向け分析.コーチングメッセージ = portfolioDetails.emotionalCoaching
      }

      // 購入推奨
      if (purchaseRecommendation) {
        stockData.購入判断 = {
          判断日: purchaseRecommendation.date.toLocaleDateString("ja-JP"),
          推奨: getRecommendationText(purchaseRecommendation.recommendation, "purchase"),
          信頼度: Math.round(purchaseRecommendation.confidence * 100),
          理由: purchaseRecommendation.reason,
        }
        if (purchaseRecommendation.shouldBuyToday !== null) stockData.購入判断.今日買うべきか = purchaseRecommendation.shouldBuyToday
        if (purchaseRecommendation.idealEntryPrice) stockData.購入判断.理想の買い値 = Number(purchaseRecommendation.idealEntryPrice)
        if (purchaseRecommendation.buyTimingExplanation) stockData.購入判断.タイミング解説 = purchaseRecommendation.buyTimingExplanation
        if (purchaseRecommendation.positives) stockData.購入判断.良い点 = purchaseRecommendation.positives
        if (purchaseRecommendation.concerns) stockData.購入判断.懸念点 = purchaseRecommendation.concerns
        if (purchaseRecommendation.caution) stockData.購入判断.注意事項 = purchaseRecommendation.caution
      }

      stockContextInfo = `
## 質問対象の銘柄データ（JSON形式）
以下のJSONデータを解析し、この銘柄についての質問に回答してください。

\`\`\`json
${JSON.stringify(stockData, null, 2)}
\`\`\`

## 回答時の注意
- 上記JSONに含まれる全てのデータ（財務指標、AI分析結果、予測、スコアなど）を考慮して回答してください
- 特に「AI売買分析」「保有者向け分析」「購入判断」のデータは既存のAI分析結果なので、これを踏まえて回答してください
- 財務指標の「評価」フィールドは客観的な評価基準に基づいています
- 数値データを具体的に引用して回答すると説得力が増します
`
    }

    // 銘柄コンテキストがある場合はDBのニュースデータを取得
    // 一般的な質問の場合はGoogle Searchグラウンディングを使用
    const isStockSpecificQuery = !!stockContext
    let relatedNews: RelatedNews[] = []

    if (isStockSpecificQuery) {
      const tickerCode = stockContext.tickerCode.replace(".T", "")
      relatedNews = await getRelatedNews({
        tickerCodes: [tickerCode],
        sectors: stockContext.sector ? [stockContext.sector] : [],
        limit: 5,
        daysAgo: 14,
      })
    }

    // ニュース情報をプロンプト用にフォーマット
    const newsSection = relatedNews.length > 0
      ? `\n## この銘柄に関連する最新ニュース\n以下のニュースを踏まえて回答してください。\n${formatNewsForPrompt(relatedNews)}`
      : ""

    // システムプロンプトを構築
    const systemPrompt = `あなたは投資初心者向けのAIコーチです。
専門用語は使わず、中学生でも分かる言葉で説明してください。
${stockContextInfo}${newsSection}
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

    // 銘柄固有の質問 → DBニュースを利用（グラウンディングなし）
    // 一般的な質問 → Google Searchグラウンディングを利用
    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents,
      config: {
        ...(isStockSpecificQuery ? {} : { tools: [{ googleSearch: {} }] }),
        temperature: 0.7,
        maxOutputTokens: 1500,
      },
    })

    const aiResponse =
      result.text ||
      "申し訳ございません。回答を生成できませんでした。"

    // ソース情報を追加
    // 銘柄固有 → DBニュースの参照を追加
    // 一般的な質問 → グラウンディングソースを追加
    let response: string
    if (isStockSpecificQuery && relatedNews.length > 0) {
      response = aiResponse + formatNewsReferences(relatedNews)
    } else {
      const groundingMetadata = result.candidates?.[0]?.groundingMetadata
      response = aiResponse + formatGroundingSources(groundingMetadata)
    }

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
