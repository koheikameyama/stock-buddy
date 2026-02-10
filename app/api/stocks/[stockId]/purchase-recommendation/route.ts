import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import { OpenAI } from "openai"
import { getRelatedNews, formatNewsForPrompt } from "@/lib/news-rag"
import { analyzeSingleCandle, CandlestickData } from "@/lib/candlestick-patterns"
import { fetchHistoricalPrices } from "@/lib/stock-price-fetcher"
import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"

dayjs.extend(utc)

function getOpenAIClient() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })
}

/**
 * GET /api/stocks/[stockId]/purchase-recommendation
 * 指定された銘柄の最新の購入判断を取得
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ stockId: string }> }
) {
  const { stockId } = await params

  try {
    // 銘柄情報を取得
    const stock = await prisma.stock.findUnique({
      where: { id: stockId },
      select: {
        id: true,
        tickerCode: true,
        name: true,
        currentPrice: true,
      },
    })

    if (!stock) {
      return NextResponse.json(
        { error: "銘柄が見つかりません" },
        { status: 404 }
      )
    }

    // 最新の購入判断を取得（過去7日以内）
    const sevenDaysAgo = dayjs.utc().subtract(7, "day").startOf("day").toDate()

    const recommendation = await prisma.purchaseRecommendation.findFirst({
      where: {
        stockId,
        date: {
          gte: sevenDaysAgo,
        },
      },
      orderBy: {
        date: "desc",
      },
    })

    if (!recommendation) {
      return NextResponse.json(
        { error: "購入判断データがまだ生成されていません" },
        { status: 404 }
      )
    }

    // レスポンス整形
    const response = {
      stockId: stock.id,
      stockName: stock.name,
      tickerCode: stock.tickerCode,
      currentPrice: stock.currentPrice ? Number(stock.currentPrice) : null,
      recommendation: recommendation.recommendation,
      confidence: recommendation.confidence,
      reason: recommendation.reason,
      recommendedQuantity: recommendation.recommendedQuantity,
      recommendedPrice: recommendation.recommendedPrice
        ? Number(recommendation.recommendedPrice)
        : null,
      estimatedAmount: recommendation.estimatedAmount
        ? Number(recommendation.estimatedAmount)
        : null,
      caution: recommendation.caution,
      // A. 買い時判断
      shouldBuyToday: recommendation.shouldBuyToday,
      idealEntryPrice: recommendation.idealEntryPrice
        ? Number(recommendation.idealEntryPrice)
        : null,
      priceGap: recommendation.priceGap
        ? Number(recommendation.priceGap)
        : null,
      buyTimingExplanation: recommendation.buyTimingExplanation,
      // B. 深掘り評価
      positives: recommendation.positives,
      concerns: recommendation.concerns,
      suitableFor: recommendation.suitableFor,
      // D. パーソナライズ
      userFitScore: recommendation.userFitScore,
      budgetFit: recommendation.budgetFit,
      periodFit: recommendation.periodFit,
      riskFit: recommendation.riskFit,
      personalizedReason: recommendation.personalizedReason,
      analyzedAt: recommendation.date.toISOString(),
    }

    return NextResponse.json(response, { status: 200 })
  } catch (error) {
    console.error("Error fetching purchase recommendation:", error)
    return NextResponse.json(
      { error: "購入判断の取得に失敗しました" },
      { status: 500 }
    )
  }
}

/**
 * POST /api/stocks/[stockId]/purchase-recommendation
 * 銘柄の購入判断をオンデマンドで生成
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ stockId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { stockId } = await params
  const userId = session.user.id

  try {
    // 銘柄情報とユーザー設定を並行取得
    const [stock, userSettings] = await Promise.all([
      prisma.stock.findUnique({
        where: { id: stockId },
        select: {
          id: true,
          tickerCode: true,
          name: true,
          sector: true,
          currentPrice: true,
        },
      }),
      prisma.userSettings.findUnique({
        where: { userId },
        select: {
          investmentPeriod: true,
          riskTolerance: true,
          investmentBudget: true,
        },
      }),
    ])

    if (!stock) {
      return NextResponse.json(
        { error: "銘柄が見つかりません" },
        { status: 404 }
      )
    }

    // 直近30日の価格データを取得（yfinanceからリアルタイム取得）
    const historicalPrices = await fetchHistoricalPrices(stock.tickerCode, "1m")
    const prices = historicalPrices.slice(-30).reverse() // 新しい順に

    if (prices.length === 0) {
      return NextResponse.json(
        { error: "価格データがありません" },
        { status: 400 }
      )
    }

    // ローソク足パターン分析
    let patternContext = ""
    if (prices.length >= 1) {
      const latestCandle: CandlestickData = {
        date: prices[0].date,
        open: prices[0].open,
        high: prices[0].high,
        low: prices[0].low,
        close: prices[0].close,
      }
      const pattern = analyzeSingleCandle(latestCandle)

      // 直近5日のシグナルをカウント
      let buySignals = 0
      let sellSignals = 0
      for (const price of prices.slice(0, 5)) {
        const p = analyzeSingleCandle({
          date: price.date,
          open: price.open,
          high: price.high,
          low: price.low,
          close: price.close,
        })
        if (p.strength >= 60) {
          if (p.signal === "buy") buySignals++
          else if (p.signal === "sell") sellSignals++
        }
      }

      patternContext = `
【ローソク足パターン分析】
- 最新パターン: ${pattern.description}
- シグナル: ${pattern.signal}
- 強さ: ${pattern.strength}%
- 直近5日の買いシグナル: ${buySignals}回
- 直近5日の売りシグナル: ${sellSignals}回
`
    }

    // 関連ニュースを取得
    const tickerCode = stock.tickerCode.replace(".T", "")
    const news = await getRelatedNews({
      tickerCodes: [tickerCode],
      sectors: stock.sector ? [stock.sector] : [],
      limit: 5,
      daysAgo: 7,
    })
    const newsContext = news.length > 0
      ? `\n【最新のニュース情報】\n${formatNewsForPrompt(news)}`
      : ""

    // 既存の予測データを取得
    const analysis = await prisma.stockAnalysis.findFirst({
      where: { stockId },
      orderBy: { analyzedAt: "desc" },
    })

    const predictionContext = analysis
      ? `
【予測情報】
- 短期予測: ${analysis.advice || "不明"}
- 中期予測: ${analysis.advice || "不明"}
- 長期予測: ${analysis.advice || "不明"}
`
      : ""

    // プロンプト構築
    const currentPrice = stock.currentPrice ? Number(stock.currentPrice) : prices[0] ? Number(prices[0].close) : 0

    // ユーザー設定のコンテキスト
    const periodMap: Record<string, string> = {
      short: "短期（数週間〜数ヶ月）",
      medium: "中期（半年〜1年）",
      long: "長期（数年以上）",
    }
    const riskMap: Record<string, string> = {
      low: "低リスク（安定重視）",
      medium: "中リスク（バランス）",
      high: "高リスク（積極的）",
    }

    const userContext = userSettings
      ? `
【ユーザーの投資設定】
- 投資期間: ${periodMap[userSettings.investmentPeriod] || userSettings.investmentPeriod}
- リスク許容度: ${riskMap[userSettings.riskTolerance] || userSettings.riskTolerance}
- 投資予算: ${userSettings.investmentBudget ? `${userSettings.investmentBudget.toLocaleString()}円` : "未設定"}
`
      : ""

    const prompt = `あなたは投資初心者向けのAIコーチです。
以下の銘柄について、詳細な購入判断をしてください。

【銘柄情報】
- 名前: ${stock.name}
- ティッカーコード: ${stock.tickerCode}
- セクター: ${stock.sector || "不明"}
- 現在価格: ${currentPrice}円
${userContext}${predictionContext}
【株価データ】
直近30日の終値: ${prices.length}件のデータあり
${patternContext}${newsContext}
【回答形式】
以下のJSON形式で回答してください。JSON以外のテキストは含めないでください。

{
  "recommendation": "buy" | "hold" | "pass",
  "confidence": 0.0から1.0の数値（小数点2桁）,
  "reason": "初心者に分かりやすい言葉で1-2文の理由",
  "recommendedQuantity": 100株単位の整数（buyの場合のみ、それ以外はnull）,
  "recommendedPrice": 目安価格の整数（buyの場合のみ、それ以外はnull）,
  "estimatedAmount": 必要金額の整数（buyの場合のみ、それ以外はnull）,
  "caution": "注意点を1-2文",

  // A. 買い時判断
  "shouldBuyToday": true | false,
  "idealEntryPrice": 理想の買い値（整数）,
  "priceGap": 現在価格との差（マイナス=割安、プラス=割高）,
  "buyTimingExplanation": "買い時の説明（例: あと50円下がったら最高の買い時です / 今が買い時です！）",

  // B. 深掘り評価
  "positives": "良いところを3つ、箇条書き（各項目は1行で簡潔に）",
  "concerns": "不安な点を2-3つ、箇条書き（各項目は1行で簡潔に）",
  "suitableFor": "こんな人におすすめ（1-2文で具体的に）",

  // D. パーソナライズ（ユーザー設定がある場合）
  "userFitScore": 0-100のおすすめ度,
  "budgetFit": 予算内で購入可能か（true/false）,
  "periodFit": 投資期間にマッチするか（true/false）,
  "riskFit": リスク許容度に合うか（true/false）,
  "personalizedReason": "このユーザーにとってのおすすめ理由（2-3文）"
}

【制約】
- 提供されたニュース情報を参考にしてください
- ニュースにない情報は推測や創作をしないでください
- 専門用語は使わない（ROE、PER、株価収益率などは使用禁止）
- 「成長性」「安定性」「割安」のような平易な言葉を使う
- すべての説明は中学生でも理解できる表現にする
- positives、concernsは箇条書き形式（・で始める）
- idealEntryPriceは現実的な価格を設定（現在価格の±10%程度）
- ユーザー設定がない場合、パーソナライズ項目はnullにする
`

    // OpenAI API呼び出し
    const openai = getOpenAIClient()
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a helpful investment coach for beginners. Always respond in JSON format.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 500,
    })

    let content = response.choices[0].message.content?.trim() || "{}"

    // マークダウンコードブロックを削除
    if (content.startsWith("```json")) {
      content = content.slice(7)
    } else if (content.startsWith("```")) {
      content = content.slice(3)
    }
    if (content.endsWith("```")) {
      content = content.slice(0, -3)
    }
    content = content.trim()

    // JSONパース
    const result = JSON.parse(content)

    // バリデーション
    if (!["buy", "hold", "pass"].includes(result.recommendation)) {
      throw new Error(`Invalid recommendation: ${result.recommendation}`)
    }

    // データベースに保存（upsert）
    const today = dayjs.utc().startOf("day").toDate()

    await prisma.purchaseRecommendation.upsert({
      where: {
        stockId_date: {
          stockId,
          date: today,
        },
      },
      update: {
        recommendation: result.recommendation,
        confidence: result.confidence,
        recommendedQuantity: result.recommendedQuantity || null,
        recommendedPrice: result.recommendedPrice || null,
        estimatedAmount: result.estimatedAmount || null,
        reason: result.reason,
        caution: result.caution,
        // A. 買い時判断
        shouldBuyToday: result.shouldBuyToday ?? null,
        idealEntryPrice: result.idealEntryPrice || null,
        priceGap: result.priceGap ?? null,
        buyTimingExplanation: result.buyTimingExplanation || null,
        // B. 深掘り評価
        positives: result.positives || null,
        concerns: result.concerns || null,
        suitableFor: result.suitableFor || null,
        // D. パーソナライズ
        userFitScore: result.userFitScore ?? null,
        budgetFit: result.budgetFit ?? null,
        periodFit: result.periodFit ?? null,
        riskFit: result.riskFit ?? null,
        personalizedReason: result.personalizedReason || null,
        updatedAt: new Date(),
      },
      create: {
        stockId,
        date: today,
        recommendation: result.recommendation,
        confidence: result.confidence,
        recommendedQuantity: result.recommendedQuantity || null,
        recommendedPrice: result.recommendedPrice || null,
        estimatedAmount: result.estimatedAmount || null,
        reason: result.reason,
        caution: result.caution,
        // A. 買い時判断
        shouldBuyToday: result.shouldBuyToday ?? null,
        idealEntryPrice: result.idealEntryPrice || null,
        priceGap: result.priceGap ?? null,
        buyTimingExplanation: result.buyTimingExplanation || null,
        // B. 深掘り評価
        positives: result.positives || null,
        concerns: result.concerns || null,
        suitableFor: result.suitableFor || null,
        // D. パーソナライズ
        userFitScore: result.userFitScore ?? null,
        budgetFit: result.budgetFit ?? null,
        periodFit: result.periodFit ?? null,
        riskFit: result.riskFit ?? null,
        personalizedReason: result.personalizedReason || null,
      },
    })

    // レスポンス
    return NextResponse.json({
      stockId: stock.id,
      stockName: stock.name,
      tickerCode: stock.tickerCode,
      currentPrice: currentPrice,
      recommendation: result.recommendation,
      confidence: result.confidence,
      reason: result.reason,
      recommendedQuantity: result.recommendedQuantity || null,
      recommendedPrice: result.recommendedPrice || null,
      estimatedAmount: result.estimatedAmount || null,
      caution: result.caution,
      // A. 買い時判断
      shouldBuyToday: result.shouldBuyToday ?? null,
      idealEntryPrice: result.idealEntryPrice || null,
      priceGap: result.priceGap ?? null,
      buyTimingExplanation: result.buyTimingExplanation || null,
      // B. 深掘り評価
      positives: result.positives || null,
      concerns: result.concerns || null,
      suitableFor: result.suitableFor || null,
      // D. パーソナライズ
      userFitScore: result.userFitScore ?? null,
      budgetFit: result.budgetFit ?? null,
      periodFit: result.periodFit ?? null,
      riskFit: result.riskFit ?? null,
      personalizedReason: result.personalizedReason || null,
      analyzedAt: today.toISOString(),
    })
  } catch (error) {
    console.error("Error generating purchase recommendation:", error)
    return NextResponse.json(
      { error: "購入判断の生成に失敗しました" },
      { status: 500 }
    )
  }
}
