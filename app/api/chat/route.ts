import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import OpenAI from "openai"
import { calculatePortfolioFromTransactions } from "@/lib/portfolio-calculator"
import { fetchStockPrices } from "@/lib/stock-price-fetcher"
import { getRelatedNews, formatNewsForPrompt, formatNewsReferences, type RelatedNews } from "@/lib/news-rag"
import { getNikkei225Data, getTrendDescription } from "@/lib/market-index"
import dayjs from "dayjs"

function getOpenAIClient() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })
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

    // 市場全体の状況を取得
    const marketData = await getNikkei225Data()

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
  平均取得単価: ${averagePrice.toLocaleString()}円
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

      // リアルタイム株価を取得（この銘柄の詳細情報）
      const tickerCode = stockContext.tickerCode.replace(".T", "")
      const [stockPriceData] = await fetchStockPrices([tickerCode])

      // 構造化データを作成
      interface StockData {
        基本情報: {
          銘柄名: string
          証券コード: string
          セクター: string
          種別: string
          保有状況?: {
            保有株数: number
            平均取得単価: number
            評価損益額: number
            評価損益率: string
          }
        }
        リアルタイム情報: {
          現在価格: number
          前日終値: number
          前日比: number
          前日比率: string
          本日高値: number
          本日安値: number
          出来高: number
          価格位置?: {
            週52高値: number
            週52安値: number
            高値からの乖離率: string
            安値からの乖離率: string
            位置評価: string
          }
          予想価格帯との比較?: {
            短期予想下限: number
            短期予想上限: number
            位置: string
            評価: string
          }
        }
        財務指標?: {
          PBR?: { 値: number; 評価: string }
          PER?: { 値: number; 評価: string }
          ROE?: { 値: number; 評価: string }
          営業キャッシュフロー?: { 値: number; 評価: string }
          フリーキャッシュフロー?: { 値: number; 評価: string }
        }
        AI売買分析?: {
          分析日: string
          分析からの経過日数: number
          分析の鮮度: string
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
          判断からの経過日数: number
          判断の鮮度: string
          推奨: string
          信頼度: number
          理由: string
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
            default: return "様子見"
          }
        }
      }

      // リアルタイム価格情報を取得
      const currentPrice = stockPriceData?.currentPrice ?? stockContext.currentPrice ?? 0
      const previousClose = stockPriceData?.previousClose ?? 0
      const priceChange = stockPriceData?.change ?? 0
      const priceChangePercent = stockPriceData?.changePercent ?? 0
      const todayHigh = stockPriceData?.high ?? 0
      const todayLow = stockPriceData?.low ?? 0
      const volume = stockPriceData?.volume ?? 0

      // 52週高値/安値
      const fiftyTwoWeekHigh = stockDetails?.fiftyTwoWeekHigh ? Number(stockDetails.fiftyTwoWeekHigh) : null
      const fiftyTwoWeekLow = stockDetails?.fiftyTwoWeekLow ? Number(stockDetails.fiftyTwoWeekLow) : null

      // 鮮度を計算するヘルパー
      const getFreshness = (daysAgo: number): string => {
        if (daysAgo <= 1) return "最新（本日または昨日）"
        if (daysAgo <= 3) return "新しい（3日以内）"
        if (daysAgo <= 7) return "やや古い（1週間以内）"
        return "古い（再分析をおすすめ）"
      }

      const stockData: StockData = {
        基本情報: {
          銘柄名: stockContext.name,
          証券コード: stockContext.tickerCode,
          セクター: stockContext.sector || "不明",
          種別: stockContext.type === "portfolio" ? "保有中" : "ウォッチリスト",
        },
        リアルタイム情報: {
          現在価格: currentPrice,
          前日終値: previousClose,
          前日比: priceChange,
          前日比率: `${priceChangePercent >= 0 ? "+" : ""}${priceChangePercent.toFixed(2)}%`,
          本日高値: todayHigh,
          本日安値: todayLow,
          出来高: volume,
        },
      }

      // 価格位置（52週高値/安値との比較）
      if (fiftyTwoWeekHigh && fiftyTwoWeekLow && currentPrice > 0) {
        const fromHigh = ((currentPrice - fiftyTwoWeekHigh) / fiftyTwoWeekHigh) * 100
        const fromLow = ((currentPrice - fiftyTwoWeekLow) / fiftyTwoWeekLow) * 100
        const range = fiftyTwoWeekHigh - fiftyTwoWeekLow
        const position = range > 0 ? ((currentPrice - fiftyTwoWeekLow) / range) * 100 : 50

        let positionEval = "中間"
        if (position >= 80) positionEval = "高値圏（過熱感に注意）"
        else if (position >= 60) positionEval = "やや高め"
        else if (position <= 20) positionEval = "安値圏（割安の可能性）"
        else if (position <= 40) positionEval = "やや安め"

        stockData.リアルタイム情報.価格位置 = {
          週52高値: fiftyTwoWeekHigh,
          週52安値: fiftyTwoWeekLow,
          高値からの乖離率: `${fromHigh.toFixed(1)}%`,
          安値からの乖離率: `+${fromLow.toFixed(1)}%`,
          位置評価: positionEval,
        }
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
      }

      // AI分析
      if (latestAnalysis) {
        const analysisDate = new Date(latestAnalysis.analyzedAt)
        const daysAgo = dayjs().diff(dayjs(analysisDate), "day")

        stockData.AI売買分析 = {
          分析日: analysisDate.toLocaleDateString("ja-JP"),
          分析からの経過日数: daysAgo,
          分析の鮮度: getFreshness(daysAgo),
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

        // 予想価格帯との比較
        const shortTermLow = Number(latestAnalysis.shortTermPriceLow)
        const shortTermHigh = Number(latestAnalysis.shortTermPriceHigh)
        if (currentPrice > 0 && shortTermLow > 0 && shortTermHigh > 0) {
          let position = "予想価格帯内"
          let evaluation = "想定通りの推移"
          if (currentPrice < shortTermLow) {
            position = "予想下限を下回っている"
            evaluation = "想定以上に下落中"
          } else if (currentPrice > shortTermHigh) {
            position = "予想上限を上回っている"
            evaluation = "想定以上に上昇中"
          } else {
            const range = shortTermHigh - shortTermLow
            const relPos = range > 0 ? ((currentPrice - shortTermLow) / range) * 100 : 50
            if (relPos >= 70) position = "予想価格帯の上部"
            else if (relPos <= 30) position = "予想価格帯の下部"
            else position = "予想価格帯の中央付近"
          }

          stockData.リアルタイム情報.予想価格帯との比較 = {
            短期予想下限: shortTermLow,
            短期予想上限: shortTermHigh,
            位置: position,
            評価: evaluation,
          }
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
      }

      // 購入推奨
      if (purchaseRecommendation) {
        const recDate = new Date(purchaseRecommendation.date)
        const daysAgo = dayjs().diff(dayjs(recDate), "day")

        stockData.購入判断 = {
          判断日: recDate.toLocaleDateString("ja-JP"),
          判断からの経過日数: daysAgo,
          判断の鮮度: getFreshness(daysAgo),
          推奨: getRecommendationText(purchaseRecommendation.recommendation, "purchase"),
          信頼度: Math.round(purchaseRecommendation.confidence * 100),
          理由: purchaseRecommendation.reason,
        }
        if (purchaseRecommendation.positives) stockData.購入判断.良い点 = purchaseRecommendation.positives
        if (purchaseRecommendation.concerns) stockData.購入判断.懸念点 = purchaseRecommendation.concerns
        if (purchaseRecommendation.caution) stockData.購入判断.注意事項 = purchaseRecommendation.caution
      }

      // 分析が古い場合の警告メッセージ
      const analysisWarning = latestAnalysis
        ? dayjs().diff(dayjs(latestAnalysis.analyzedAt), "day") > 7
          ? "\n⚠️ AI分析が1週間以上前のものです。最新の判断には再分析をおすすめします。"
          : ""
        : "\n⚠️ AI分析データがありません。銘柄詳細ページで「今すぐ分析する」を実行してください。"

      stockContextInfo = `
## 質問対象の銘柄データ（JSON形式）
以下のJSONデータを解析し、この銘柄についての質問に回答してください。
${analysisWarning}

\`\`\`json
${JSON.stringify(stockData, null, 2)}
\`\`\`

## 回答時の重要ポイント
1. **リアルタイム情報を最優先**: 本日の価格変動、前日比、52週高値/安値との位置を踏まえて判断してください
2. **予想価格帯との比較**: 現在価格が予想価格帯のどこにいるかを考慮してください
3. **分析の鮮度を考慮**: 分析が古い場合はその点を踏まえて回答し、再分析を促してください
4. **最新ニュースを重視**: 直近のニュースは特に重要な判断材料です
5. 数値データを具体的に引用して回答すると説得力が増します
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

    // 市場全体の状況セクション
    const marketSection = marketData
      ? `
## 市場全体の状況
- 日経平均株価: ${marketData.currentPrice.toLocaleString()}円
- 週間変化率: ${marketData.weekChangeRate >= 0 ? "+" : ""}${marketData.weekChangeRate.toFixed(1)}%
- トレンド: ${getTrendDescription(marketData.trend)}
${marketData.isMarketCrash ? "⚠️ 市場全体が急落中です。新規購入は慎重に判断してください。" : ""}
`
      : ""

    // システムプロンプトを構築
    const systemPrompt = `あなたは投資初心者向けのAIコーチです。
専門用語は使わず、中学生でも分かる言葉で説明してください。
${stockContextInfo}${newsSection}${marketSection}
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
1. **リアルタイム情報を最優先**: 本日の株価変動、前日比、52週高値/安値との位置関係を必ず踏まえて回答する
2. 予想価格帯との比較を活用: 現在価格が予想範囲内か、上回っているか、下回っているかを判断材料にする
3. 分析の鮮度を考慮: 分析が古い（7日以上前）場合は「最新の判断には再分析をおすすめします」と伝える
4. 最新ニュースを重視: 直近のニュースは特に重要な判断材料として回答に反映する
5. 専門用語は使わず、「上がりそう」「下がりそう」「今が買い時かも」など分かりやすい言葉で
6. 断定的な表現は避け、「〜と考えられます」「〜の可能性があります」を使う
7. ユーザーの投資スタイルに合わせたアドバイスをする
8. 親しみやすく丁寧な「ですます調」で話す
9. 回答は簡潔に（300字以内を目安）
10. 具体的な数字を引用して説得力を持たせる（例: 「現在価格は52週安値から+15%の位置です」）`

    // OpenAI APIを呼び出し
    const openai = getOpenAIClient()

    // 会話履歴を構築
    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = []

    // システムプロンプトを追加
    messages.push({
      role: "system",
      content: systemPrompt,
    })

    // 会話履歴を追加（最大4件）
    if (conversationHistory && Array.isArray(conversationHistory)) {
      conversationHistory.slice(-4).forEach((msg: { role: string; content: string }) => {
        if (msg.role === "user") {
          messages.push({
            role: "user",
            content: msg.content,
          })
        } else if (msg.role === "assistant") {
          messages.push({
            role: "assistant",
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

    // OpenAI APIを呼び出し
    const result = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      temperature: 0.7,
      max_tokens: 3000,
    })

    const aiResponse =
      result.choices[0]?.message?.content ||
      "申し訳ございません。回答を生成できませんでした。"

    // ソース情報を追加（銘柄固有の質問の場合はDBニュースの参照を追加）
    let response: string
    if (isStockSpecificQuery && relatedNews.length > 0) {
      response = aiResponse + formatNewsReferences(relatedNews)
    } else {
      response = aiResponse
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
