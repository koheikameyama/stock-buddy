import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import { verifyCronOrSession } from "@/lib/cron-auth"
import { getOpenAIClient } from "@/lib/openai"
import { getRelatedNews, formatNewsForPrompt } from "@/lib/news-rag"
import { analyzeSingleCandle, CandlestickData } from "@/lib/candlestick-patterns"
import { detectChartPatterns, formatChartPatternsForPrompt, PricePoint } from "@/lib/chart-patterns"
import { fetchHistoricalPrices, fetchStockPrices } from "@/lib/stock-price-fetcher"
import { calculateRSI, calculateMACD } from "@/lib/technical-indicators"
import { getTodayForDB, getDaysAgoForDB } from "@/lib/date-utils"

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
      },
    })

    if (!stock) {
      return NextResponse.json(
        { error: "銘柄が見つかりません" },
        { status: 404 }
      )
    }

    // 最新の購入判断を取得（過去7日以内）
    const sevenDaysAgo = getDaysAgoForDB(7)

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

    // リアルタイム株価を取得
    const realtimePrices = await fetchStockPrices([stock.tickerCode])
    const currentPrice = realtimePrices[0]?.currentPrice ?? null

    // レスポンス整形
    const response = {
      stockId: stock.id,
      stockName: stock.name,
      tickerCode: stock.tickerCode,
      currentPrice,
      recommendation: recommendation.recommendation,
      confidence: recommendation.confidence,
      reason: recommendation.reason,
      caution: recommendation.caution,
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
      analyzedAt: recommendation.updatedAt.toISOString(),
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
  const authResult = verifyCronOrSession(request, session)

  // 認証失敗の場合はエラーレスポンスを返す
  if (authResult instanceof NextResponse) {
    return authResult
  }

  const { userId } = authResult
  const { stockId } = await params

  try {
    // 銘柄情報を取得
    const stock = await prisma.stock.findUnique({
      where: { id: stockId },
      select: {
        id: true,
        tickerCode: true,
        name: true,
        sector: true,
      },
    })

    // ユーザー設定を取得（CRON経由の場合はスキップ）
    const userSettings = userId
      ? await prisma.userSettings.findUnique({
          where: { userId },
          select: {
            investmentPeriod: true,
            riskTolerance: true,
            investmentBudget: true,
          },
        })
      : null

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

    // テクニカル指標の計算（RSI/MACD）
    let technicalContext = ""
    if (prices.length >= 26) {
      // RSI/MACD計算用に価格データを古い順に並べ替え
      const pricesForCalc = [...prices].reverse().map(p => ({ close: p.close }))

      const rsi = calculateRSI(pricesForCalc, 14)
      const macd = calculateMACD(pricesForCalc)

      // RSIの初心者向け解釈
      let rsiInterpretation = ""
      if (rsi !== null) {
        if (rsi <= 30) {
          rsiInterpretation = `${rsi.toFixed(1)}（売られすぎ → 反発の可能性あり）`
        } else if (rsi <= 40) {
          rsiInterpretation = `${rsi.toFixed(1)}（やや売られすぎ）`
        } else if (rsi >= 70) {
          rsiInterpretation = `${rsi.toFixed(1)}（買われすぎ → 下落の可能性あり）`
        } else if (rsi >= 60) {
          rsiInterpretation = `${rsi.toFixed(1)}（やや買われすぎ）`
        } else {
          rsiInterpretation = `${rsi.toFixed(1)}（通常範囲）`
        }
      }

      // MACDの初心者向け解釈
      let macdInterpretation = ""
      if (macd.histogram !== null) {
        if (macd.histogram > 1) {
          macdInterpretation = "上昇トレンド（勢いあり）"
        } else if (macd.histogram > 0) {
          macdInterpretation = "やや上昇傾向"
        } else if (macd.histogram < -1) {
          macdInterpretation = "下落トレンド（勢いあり）"
        } else if (macd.histogram < 0) {
          macdInterpretation = "やや下落傾向"
        } else {
          macdInterpretation = "横ばい"
        }
      }

      if (rsi !== null || macd.histogram !== null) {
        technicalContext = `
【テクニカル指標】
${rsi !== null ? `- 売られすぎ/買われすぎ度合い: ${rsiInterpretation}` : ""}
${macd.histogram !== null ? `- トレンドの勢い: ${macdInterpretation}` : ""}
`
      }
    }

    // チャートパターン（複数足フォーメーション）の検出
    let chartPatternContext = ""
    if (prices.length >= 15) {
      const pricePoints: PricePoint[] = [...prices].reverse().map(p => ({
        date: p.date,
        open: p.open,
        high: p.high,
        low: p.low,
        close: p.close,
      }))
      const chartPatterns = detectChartPatterns(pricePoints)
      if (chartPatterns.length > 0) {
        chartPatternContext = "\n" + formatChartPatternsForPrompt(chartPatterns)
      }
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

    // リアルタイム株価を取得
    const realtimePricesPost = await fetchStockPrices([stock.tickerCode])
    const currentPrice = realtimePricesPost[0]?.currentPrice ?? (prices[0] ? Number(prices[0].close) : 0)

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

    const prompt = `あなたは投資を学びたい人向けのAIコーチです。
以下の銘柄について、詳細な購入判断をしてください。
テクニカル分析の結果を活用し、専門用語は解説を添えて使ってください。

【銘柄情報】
- 名前: ${stock.name}
- ティッカーコード: ${stock.tickerCode}
- セクター: ${stock.sector || "不明"}
- 現在価格: ${currentPrice}円
${userContext}${predictionContext}
【株価データ】
直近30日の終値: ${prices.length}件のデータあり
${patternContext}${technicalContext}${chartPatternContext}${newsContext}
【回答形式】
以下のJSON形式で回答してください。JSON以外のテキストは含めないでください。

{
  "recommendation": "buy" | "stay" | "remove",
  "confidence": 0.0から1.0の数値（小数点2桁）,
  "reason": "初心者に分かりやすい言葉で1-2文の理由",
  "caution": "注意点を1-2文",

  // B. 深掘り評価（文字列で返す。配列ではない）
  "positives": "・良い点1\n・良い点2\n・良い点3",
  "concerns": "・不安な点1\n・不安な点2\n・不安な点3",
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
- 決算発表、業績予想、M&A、人事異動など、提供されていない情報を創作しないでください
- 過去の一般知識（例:「○○社は過去に○○した」）は使用しないでください
- 「買い時」「今すぐ買うべき」などの断定的な表現は避け、「検討できる」「検討のタイミング」などの表現を使う
- 赤字企業の場合は concerns で必ず「業績が赤字である」ことに言及し、リスクを伝える
- 赤字かつ減益傾向の場合は、特に慎重な表現を使う
- 専門用語（RSI、MACD、チャートパターン名など）は使ってOKだが、必ず簡単な解説を添える
  例: 「RSI（売られすぎ・買われすぎを判断する指標）が30を下回り…」
  例: 「ダブルボトム（2回底を打って反転する形）が形成され…」
- チャートパターンが検出された場合は、reasonで言及する
- positives、concernsは「・項目1\n・項目2」形式の文字列で返す（配列ではない）
- ユーザー設定がない場合、パーソナライズ項目はnullにする

【テクニカル指標の重視】
- RSI・MACDなどのテクニカル指標が提供されている場合は、必ず判断根拠として活用する
- 複数の指標が同じ方向を示している場合（例: RSI売られすぎ + MACD上昇転換）は信頼度を高める
- 指標間で矛盾がある場合（例: RSI買われすぎ だが MACD上昇中）は慎重な判断とし、その旨をcautionで言及する

【過去の価格動向とボラティリティの考慮】
- 直近の価格変動幅（ボラティリティ）が大きい銘柄は、リスクが高いことをconcernsで必ず言及する
- 急騰・急落した銘柄は、反動リスクがあることを伝える
- 過去30日の値動きパターン（上昇トレンド/下落トレンド/横ばい）を判断に反映する

【"remove"（見送り推奨）について】
- "remove"はウォッチリストから外すことを推奨する判断です
- 以下の条件が複数揃い、回復の見込みが極めて低い場合のみ使用してください:
  * 赤字が継続し、業績改善の兆しがない
  * 下落トレンドが継続している（テクニカル指標がすべてネガティブ）
  * 悪材料が出ており、株価下落が続く見込み
- "remove"を選ぶ場合は、confidence を 0.8 以上に設定してください
- 迷う場合は "stay" を選んでください。"remove" は確信がある場合のみ使用
`

    // OpenAI API呼び出し（Structured Outputs使用）
    const openai = getOpenAIClient()
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a helpful investment coach for beginners.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.4,
      max_tokens: 800,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "purchase_recommendation",
          strict: true,
          schema: {
            type: "object",
            properties: {
              recommendation: { type: "string", enum: ["buy", "stay", "remove"] },
              confidence: { type: "number" },
              reason: { type: "string" },
              caution: { type: "string" },
              // B. 深掘り評価
              positives: { type: ["string", "null"] },
              concerns: { type: ["string", "null"] },
              suitableFor: { type: ["string", "null"] },
              // D. パーソナライズ
              userFitScore: { type: ["number", "null"] },
              budgetFit: { type: ["boolean", "null"] },
              periodFit: { type: ["boolean", "null"] },
              riskFit: { type: ["boolean", "null"] },
              personalizedReason: { type: ["string", "null"] },
            },
            required: [
              "recommendation", "confidence", "reason", "caution",
              "positives", "concerns", "suitableFor",
              "userFitScore", "budgetFit", "periodFit", "riskFit", "personalizedReason"
            ],
            additionalProperties: false,
          },
        },
      },
    })

    const content = response.choices[0].message.content?.trim() || "{}"
    const result = JSON.parse(content)

    // "remove" は confidence >= 0.8 の場合のみ許可（それ以下は "stay" にフォールバック）
    if (result.recommendation === "remove" && result.confidence < 0.8) {
      result.recommendation = "stay"
    }

    // データベースに保存（upsert）
    // JSTの今日00:00をUTCに変換
    const today = getTodayForDB()

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
        reason: result.reason,
        caution: result.caution,
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
        reason: result.reason,
        caution: result.caution,
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
      caution: result.caution,
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
