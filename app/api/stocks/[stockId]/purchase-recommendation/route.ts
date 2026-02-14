import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import { verifyCronOrSession } from "@/lib/cron-auth"
import { OpenAI } from "openai"
import { getRelatedNews, formatNewsForPrompt } from "@/lib/news-rag"
import { analyzeSingleCandle, CandlestickData } from "@/lib/candlestick-patterns"
import { detectChartPatterns, formatChartPatternsForPrompt, PricePoint } from "@/lib/chart-patterns"
import { fetchHistoricalPrices, fetchStockPrices } from "@/lib/stock-price-fetcher"
import { calculateRSI, calculateMACD, calculateBollingerBands } from "@/lib/technical-indicators"
import { getTodayForDB, getDaysAgoForDB } from "@/lib/date-utils"

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
      // A. 買い時判断
      shouldBuyToday: recommendation.shouldBuyToday,
      idealEntryPrice: recommendation.idealEntryPrice
        ? Number(recommendation.idealEntryPrice)
        : null,
      idealEntryPriceExpiry: recommendation.idealEntryPriceExpiry
        ? recommendation.idealEntryPriceExpiry.toISOString()
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
    // 銘柄情報を取得（ファンダメンタルズ情報も含む）
    const stock = await prisma.stock.findUnique({
      where: { id: stockId },
      select: {
        id: true,
        tickerCode: true,
        name: true,
        sector: true,
        isProfitable: true,
        profitTrend: true,
        per: true,
        pbr: true,
        dividendYield: true,
        marketCap: true,
        volatility: true,
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

    // テクニカル指標の計算（RSI/MACD/ボリンジャーバンド）
    let technicalContext = ""
    if (prices.length >= 26) {
      // RSI/MACD計算用に価格データを古い順に並べ替え
      const pricesForCalc = [...prices].reverse().map(p => ({ close: p.close }))

      const rsi = calculateRSI(pricesForCalc, 14)
      const macd = calculateMACD(pricesForCalc)
      const bollinger = calculateBollingerBands(pricesForCalc, 20, 2)

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

      // ボリンジャーバンドの初心者向け解釈
      let bollingerInterpretation = ""
      if (bollinger.upper !== null && bollinger.lower !== null && bollinger.middle !== null) {
        const latestClose = prices[0].close
        if (latestClose >= bollinger.upper) {
          bollingerInterpretation = `上限バンド(${bollinger.upper.toFixed(0)}円)を超え → 過熱感あり、調整の可能性`
        } else if (latestClose <= bollinger.lower) {
          bollingerInterpretation = `下限バンド(${bollinger.lower.toFixed(0)}円)を下回り → 売られすぎ、反発の可能性`
        } else if (latestClose > bollinger.middle) {
          bollingerInterpretation = `中心線(${bollinger.middle.toFixed(0)}円)より上 → やや強気圏`
        } else {
          bollingerInterpretation = `中心線(${bollinger.middle.toFixed(0)}円)より下 → やや弱気圏`
        }
      }

      if (rsi !== null || macd.histogram !== null || bollingerInterpretation) {
        technicalContext = `
【テクニカル指標】
${rsi !== null ? `- 売られすぎ/買われすぎ度合い: ${rsiInterpretation}` : ""}
${macd.histogram !== null ? `- トレンドの勢い: ${macdInterpretation}` : ""}
${bollingerInterpretation ? `- ボリンジャーバンド（値動きの範囲を示す指標）: ${bollingerInterpretation}` : ""}
`
      }
    }

    // 出来高分析
    let volumeContext = ""
    if (prices.length >= 7) {
      const recentVolumes = prices.slice(0, 7).map(p => p.volume).filter((v): v is number => v != null && v > 0)
      const allVolumes = prices.map(p => p.volume).filter((v): v is number => v != null && v > 0)
      if (recentVolumes.length > 0 && allVolumes.length > 7) {
        const recentAvg = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length
        const allAvg = allVolumes.reduce((a, b) => a + b, 0) / allVolumes.length
        const volumeRatio = allAvg > 0 ? recentAvg / allAvg : 1
        let volumeInterpretation = ""
        if (volumeRatio >= 2.0) {
          volumeInterpretation = `通常の${volumeRatio.toFixed(1)}倍（非常に注目度が高い。急騰・急落に注意）`
        } else if (volumeRatio >= 1.5) {
          volumeInterpretation = `通常の${volumeRatio.toFixed(1)}倍（注目度が上昇中）`
        } else if (volumeRatio <= 0.5) {
          volumeInterpretation = `通常の${volumeRatio.toFixed(1)}倍（関心が低下。流動性リスクに注意）`
        } else {
          volumeInterpretation = `通常の${volumeRatio.toFixed(1)}倍（通常水準）`
        }
        volumeContext = `\n【出来高分析（取引の活発さ）】\n- 直近7日の出来高: ${volumeInterpretation}`
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

    // ファンダメンタルズ情報
    let fundamentalsContext = ""
    const fundamentals: string[] = []
    if (stock.isProfitable === true) {
      fundamentals.push(`- 業績: 黒字${stock.profitTrend === "increasing" ? "（増益傾向）" : stock.profitTrend === "decreasing" ? "（減益傾向）" : ""}`)
    } else if (stock.isProfitable === false) {
      fundamentals.push(`- 業績: 赤字${stock.profitTrend === "decreasing" ? "（赤字拡大傾向）" : ""}`)
    }
    if (stock.per) {
      const perVal = Number(stock.per)
      const perEval = perVal > 30 ? "（割高感あり）" : perVal < 10 ? "（割安感あり）" : "（標準的）"
      fundamentals.push(`- PER（株価収益率）: ${perVal.toFixed(1)}倍${perEval}`)
    }
    if (stock.pbr) {
      const pbrEval = Number(stock.pbr) > 3 ? "（割高感あり）" : Number(stock.pbr) < 1 ? "（割安感あり）" : "（標準的）"
      fundamentals.push(`- PBR（株価純資産倍率）: ${Number(stock.pbr).toFixed(2)}倍${pbrEval}`)
    }
    if (stock.dividendYield && Number(stock.dividendYield) > 0) {
      const divEval = Number(stock.dividendYield) >= 3 ? "（高配当）" : Number(stock.dividendYield) >= 1.5 ? "（標準的）" : "（低め）"
      fundamentals.push(`- 配当利回り: ${Number(stock.dividendYield).toFixed(2)}%${divEval}`)
    }
    if (stock.marketCap) {
      const mcBillion = Number(stock.marketCap)
      const mcLabel = mcBillion >= 10000 ? "大型株" : mcBillion >= 1000 ? "中型株" : "小型株"
      fundamentals.push(`- 時価総額: ${mcBillion.toLocaleString()}億円（${mcLabel}）`)
    }
    if (stock.volatility) {
      const volEval = Number(stock.volatility) > 40 ? "（値動きが非常に激しい）" : Number(stock.volatility) > 25 ? "（値動きがやや大きい）" : "（安定的）"
      fundamentals.push(`- ボラティリティ: ${Number(stock.volatility).toFixed(1)}%${volEval}`)
    }
    if (fundamentals.length > 0) {
      fundamentalsContext = `\n【ファンダメンタルズ（企業の基礎情報）】\n${fundamentals.join("\n")}`
    }

    const prompt = `あなたは投資を学びたい人向けのAIコーチです。
以下の銘柄について、テクニカル分析とファンダメンタルズの両面から多角的に購入判断をしてください。
専門用語は解説を添えて使ってください。

【銘柄情報】
- 名前: ${stock.name}
- ティッカーコード: ${stock.tickerCode}
- セクター: ${stock.sector || "不明"}
- 現在価格: ${currentPrice}円
${userContext}${fundamentalsContext}${predictionContext}
【株価データ】
直近30日の終値: ${prices.length}件のデータあり
${patternContext}${technicalContext}${volumeContext}${chartPatternContext}${newsContext}
【回答形式】
以下のJSON形式で回答してください。JSON以外のテキストは含めないでください。

{
  "recommendation": "buy" | "stay" | "remove",
  "confidence": 0.0から1.0の数値（小数点2桁）,
  "reason": "初心者に分かりやすい言葉で1-2文の理由",
  "caution": "注意点を1-2文",

  // A. 買い時判断
  "shouldBuyToday": true | false,
  "idealEntryPrice": 理想の買い値（整数）,
  "idealEntryPriceExpiry": "理想の買い値の有効期限（ISO 8601形式、例: 2026-02-20）",
  "priceGap": 現在価格との差（マイナス=割安、プラス=割高）,
  "buyTimingExplanation": "購入タイミングの説明（例: あと50円下がったら良い買い場です / 購入を検討できるタイミングです）",

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
- 「買い時」「今すぐ買うべき」などの断定的な表現は避け、「検討できる」「検討のタイミング」などの表現を使う
- 赤字企業の場合は concerns で必ず「業績が赤字である」ことに言及し、リスクを伝える
- 赤字かつ減益傾向の場合は、特に慎重な表現を使う
- 専門用語（RSI、MACD、チャートパターン名など）は使ってOKだが、必ず簡単な解説を添える
  例: 「RSI（売られすぎ・買われすぎを判断する指標）が30を下回り…」
  例: 「ダブルボトム（2回底を打って反転する形）が形成され…」
- チャートパターンが検出された場合は、reasonやbuyTimingExplanationで言及する
- positives、concernsは「・項目1\n・項目2」形式の文字列で返す（配列ではない）
- idealEntryPriceは現実的な価格を設定（現在価格の±10%程度）
- idealEntryPriceExpiryは市場状況に応じて1日〜2週間程度の範囲で設定（短期的な値動きが予想される場合は短め、安定している場合は長め）
- ユーザー設定がない場合、パーソナライズ項目はnullにする

【多角的分析の実施】
テクニカル分析だけでなく、ファンダメンタルズ・市場環境・出来高を総合的に評価してください:

1. テクニカル分析:
   - RSI・MACD・ボリンジャーバンドなどの指標が提供されている場合は、必ず判断根拠として活用する
   - 複数の指標が同じ方向を示している場合（例: RSI売られすぎ + MACD上昇転換）は信頼度を高める
   - 指標間で矛盾がある場合（例: RSI買われすぎ だが MACD上昇中）は慎重な判断とし、その旨をcautionで言及する

2. ファンダメンタルズ分析:
   - PER・PBRが提供されている場合は、割高/割安の判断に活用する
   - 業績（黒字/赤字、増益/減益）は購入判断の重要な要素として扱う
   - 赤字+減益の銘柄は、テクニカルが良くても慎重に判断する
   - 配当利回りが高い銘柄は長期保有の観点で言及する

3. 出来高・市場環境:
   - 出来高が急増している場合は、その理由（好材料/悪材料）を考慮する
   - 出来高が極端に少ない場合は流動性リスクに言及する

【過去の価格動向とボラティリティの考慮】
- 直近の価格変動幅（ボラティリティ）が大きい銘柄は、リスクが高いことをconcernsで必ず言及する
- 急騰・急落した銘柄は、反動リスクがあることを伝える
- 過去30日の値動きパターン（上昇トレンド/下落トレンド/横ばい）を判断に反映する
- ボリンジャーバンドの上限/下限への接近は重要なシグナルとして活用する

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
              // A. 買い時判断
              shouldBuyToday: { type: "boolean" },
              idealEntryPrice: { type: ["number", "null"] },
              idealEntryPriceExpiry: { type: ["string", "null"] },
              priceGap: { type: ["number", "null"] },
              buyTimingExplanation: { type: ["string", "null"] },
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
              "shouldBuyToday", "idealEntryPrice", "idealEntryPriceExpiry",
              "priceGap", "buyTimingExplanation",
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
        // A. 買い時判断
        shouldBuyToday: result.shouldBuyToday ?? null,
        idealEntryPrice: result.idealEntryPrice || null,
        idealEntryPriceExpiry: result.idealEntryPriceExpiry ? new Date(result.idealEntryPriceExpiry) : null,
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
        reason: result.reason,
        caution: result.caution,
        // A. 買い時判断
        shouldBuyToday: result.shouldBuyToday ?? null,
        idealEntryPrice: result.idealEntryPrice || null,
        idealEntryPriceExpiry: result.idealEntryPriceExpiry ? new Date(result.idealEntryPriceExpiry) : null,
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
      caution: result.caution,
      // A. 買い時判断
      shouldBuyToday: result.shouldBuyToday ?? null,
      idealEntryPrice: result.idealEntryPrice || null,
      idealEntryPriceExpiry: result.idealEntryPriceExpiry || null,
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
