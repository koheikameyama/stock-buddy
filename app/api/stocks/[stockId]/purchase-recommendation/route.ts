import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import { verifyCronOrSession } from "@/lib/cron-auth"
import { getOpenAIClient } from "@/lib/openai"
import { getRelatedNews, formatNewsForPrompt } from "@/lib/news-rag"
import { fetchHistoricalPrices, fetchStockPrices } from "@/lib/stock-price-fetcher"
import {
  buildFinancialMetrics,
  buildCandlestickContext,
  buildTechnicalContext,
  buildChartPatternContext,
  buildWeekChangeContext,
  buildMarketContext,
  buildDeviationRateContext,
  buildDelistingContext,
  PROMPT_MARKET_SIGNAL_DEFINITION,
  PROMPT_NEWS_CONSTRAINTS,
} from "@/lib/stock-analysis-context"
import { MA_DEVIATION, SELL_TIMING } from "@/lib/constants"
import { calculateDeviationRate, calculateSMA, calculateRSI } from "@/lib/technical-indicators"
import { getTodayForDB, getDaysAgoForDB } from "@/lib/date-utils"
import { insertRecommendationOutcome, Prediction } from "@/lib/outcome-utils"
import { getNikkei225Data, MarketIndexData } from "@/lib/market-index"
import { calculatePortfolioFromTransactions } from "@/lib/portfolio-calculator"
import { isSurgeStock, isDangerousStock, isOverheated } from "@/lib/stock-safety-rules"
import { getSectorTrend, formatSectorTrendForPrompt } from "@/lib/sector-trend"

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

    const [recommendation, analysis] = await Promise.all([
      prisma.purchaseRecommendation.findFirst({
        where: {
          stockId,
          date: { gte: sevenDaysAgo },
        },
        orderBy: { date: "desc" },
      }),
      prisma.stockAnalysis.findFirst({
        where: { stockId },
        orderBy: { analyzedAt: "desc" },
      }),
    ])

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
      marketSignal: recommendation.marketSignal,
      recommendation: recommendation.recommendation,
      confidence: recommendation.confidence,
      reason: recommendation.reason,
      caution: recommendation.caution,
      // B. 深掘り評価
      positives: recommendation.positives,
      concerns: recommendation.concerns,
      suitableFor: recommendation.suitableFor,
      // C. 買い時条件
      buyCondition: recommendation.buyCondition,
      buyTiming: recommendation.buyTiming,
      dipTargetPrice: recommendation.dipTargetPrice ? Number(recommendation.dipTargetPrice) : null,
      sellTiming: recommendation.sellTiming,
      // D. パーソナライズ
      userFitScore: recommendation.userFitScore,
      budgetFit: recommendation.budgetFit,
      periodFit: recommendation.periodFit,
      riskFit: recommendation.riskFit,
      personalizedReason: recommendation.personalizedReason,
      analyzedAt: recommendation.updatedAt.toISOString(),
      // 価格帯予測（StockAnalysisから）
      shortTermTrend: analysis?.shortTermTrend ?? null,
      shortTermPriceLow: analysis?.shortTermPriceLow ? Number(analysis.shortTermPriceLow) : null,
      shortTermPriceHigh: analysis?.shortTermPriceHigh ? Number(analysis.shortTermPriceHigh) : null,
      shortTermText: analysis?.shortTermText ?? null,
      midTermTrend: analysis?.midTermTrend ?? null,
      midTermPriceLow: analysis?.midTermPriceLow ? Number(analysis.midTermPriceLow) : null,
      midTermPriceHigh: analysis?.midTermPriceHigh ? Number(analysis.midTermPriceHigh) : null,
      midTermText: analysis?.midTermText ?? null,
      longTermTrend: analysis?.longTermTrend ?? null,
      longTermPriceLow: analysis?.longTermPriceLow ? Number(analysis.longTermPriceLow) : null,
      longTermPriceHigh: analysis?.longTermPriceHigh ? Number(analysis.longTermPriceHigh) : null,
      longTermText: analysis?.longTermText ?? null,
      advice: analysis?.advice ?? null,
      // AI推奨価格（StockAnalysisから）
      limitPrice: analysis?.limitPrice ? Number(analysis.limitPrice) : null,
      stopLossPrice: analysis?.stopLossPrice ? Number(analysis.stopLossPrice) : null,
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
    // 銘柄情報を取得（財務指標も含む）
    const stock = await prisma.stock.findUnique({
      where: { id: stockId },
      select: {
        id: true,
        tickerCode: true,
        name: true,
        sector: true,
        // 財務指標
        marketCap: true,
        dividendYield: true,
        pbr: true,
        per: true,
        roe: true,
        isProfitable: true,
        profitTrend: true,
        revenueGrowth: true,
        eps: true,
        fiftyTwoWeekHigh: true,
        fiftyTwoWeekLow: true,
        volatility: true,
        isDelisted: true,
        fetchFailCount: true,
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

    // 残り予算を計算（総予算 - 現在保有中の株の取得コスト合計）
    // 保有コスト方式: 売却すれば（利確・損切り問わず）その分が予算に戻ってくる
    let remainingBudget: number | null = null
    if (userId && userSettings?.investmentBudget) {
      const userPortfolioStocks = await prisma.portfolioStock.findMany({
        where: { userId },
        select: {
          transactions: {
            select: { type: true, quantity: true, price: true, transactionDate: true },
            orderBy: { transactionDate: "asc" },
          },
        },
      })
      let holdingsCost = 0
      for (const ps of userPortfolioStocks) {
        const { quantity, averagePurchasePrice } = calculatePortfolioFromTransactions(ps.transactions)
        if (quantity > 0) {
          holdingsCost += quantity * averagePurchasePrice.toNumber()
        }
      }
      remainingBudget = Math.max(0, userSettings.investmentBudget - holdingsCost)
    }

    if (!stock) {
      return NextResponse.json(
        { error: "銘柄が見つかりません" },
        { status: 404 }
      )
    }

    // 直近30日の価格データを取得（yfinanceからリアルタイム取得）
    const historicalPrices = await fetchHistoricalPrices(stock.tickerCode, "1m")
    const prices = historicalPrices.slice(-30) // oldest-first（共通関数に合わせて古い順）

    if (prices.length === 0) {
      return NextResponse.json(
        { error: "価格データがありません" },
        { status: 400 }
      )
    }

    // ローソク足パターン分析
    const patternContext = buildCandlestickContext(prices)

    // テクニカル指標の計算（RSI/MACD）
    const technicalContext = buildTechnicalContext(prices)

    // チャートパターン（複数足フォーメーション）の検出
    const chartPatternContext = buildChartPatternContext(prices)

    // 移動平均乖離率
    const deviationRateContext = buildDeviationRateContext(prices)

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

    // 既存の予測データを取得（StockAnalysisから）
    const analysis = await prisma.stockAnalysis.findFirst({
      where: { stockId },
      orderBy: { analyzedAt: "desc" },
    })

    // 予測データをプロンプトに渡す（購入判断の重要な根拠）
    const trendLabel = (trend: string) =>
      trend === "up" ? "上昇" : trend === "down" ? "下落" : "横ばい"

    const predictionContext = analysis
      ? `
【AI予測データ（購入判断の重要な根拠として活用）】
※ 以下は事前に生成された価格予測です。この予測を踏まえて購入判断を出してください。

■ 短期予測（今週）: ${trendLabel(analysis.shortTermTrend)}
  - 予測価格帯: ${Number(analysis.shortTermPriceLow).toLocaleString()}円 〜 ${Number(analysis.shortTermPriceHigh).toLocaleString()}円
  - 解説: ${analysis.shortTermText || "解説なし"}

■ 中期予測（今月）: ${trendLabel(analysis.midTermTrend)}
  - 予測価格帯: ${Number(analysis.midTermPriceLow).toLocaleString()}円 〜 ${Number(analysis.midTermPriceHigh).toLocaleString()}円
  - 解説: ${analysis.midTermText || "解説なし"}

■ 長期予測（3ヶ月）: ${trendLabel(analysis.longTermTrend)}
  - 予測価格帯: ${Number(analysis.longTermPriceLow).toLocaleString()}円 〜 ${Number(analysis.longTermPriceHigh).toLocaleString()}円
  - 解説: ${analysis.longTermText || "解説なし"}

■ 総合判断: ${analysis.recommendation === "buy" ? "買い推奨" : analysis.recommendation === "sell" ? "売り推奨" : "ホールド"}
■ アドバイス: ${analysis.advice || "なし"}
■ 信頼度: ${(analysis.confidence * 100).toFixed(0)}%
`
      : ""

    // 市場全体の状況を取得
    let marketData: MarketIndexData | null = null
    try {
      marketData = await getNikkei225Data()
    } catch (error) {
      console.error("市場データ取得失敗（フォールバック）:", error)
    }

    // リアルタイム株価を取得
    const realtimePricesPost = await fetchStockPrices([stock.tickerCode])
    const currentPrice = realtimePricesPost[0]?.currentPrice ?? (prices[0] ? Number(prices[0].close) : 0)

    // 週間変化率を計算
    const { text: weekChangeContext, rate: weekChangeRate } = buildWeekChangeContext(prices, "watchlist")

    // 市場全体の状況コンテキスト
    const marketContext = buildMarketContext(marketData)

    // セクタートレンド
    let sectorTrendContext = ""
    if (stock.sector) {
      const sectorTrend = await getSectorTrend(stock.sector)
      if (sectorTrend) {
        sectorTrendContext = `\n【セクタートレンド】\n${formatSectorTrendForPrompt(sectorTrend)}\n`
      }
    }

    // 財務指標のフォーマット
    const financialMetrics = buildFinancialMetrics(stock, currentPrice)

    // 上場廃止コンテキスト
    const delistingContext = buildDelistingContext(stock.isDelisted, stock.fetchFailCount)

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
- 投資予算（合計）: ${userSettings.investmentBudget ? `${userSettings.investmentBudget.toLocaleString()}円` : "未設定"}
- 投資予算（残り）: ${remainingBudget !== null ? `${remainingBudget.toLocaleString()}円` : userSettings.investmentBudget ? "未計算" : "未設定"}
`
      : ""

    // 既存予測データがある場合は活用
    const hasPrediction = analysis !== null

    const prompt = `あなたは投資を学びたい人向けのAIコーチです。
以下の銘柄について、詳細な購入判断をしてください。
テクニカル分析の結果を活用し、専門用語は解説を添えて使ってください。
${hasPrediction ? "\n【重要】AI予測データが提供されています。この予測を購入判断の主要な根拠として活用してください。" : ""}

【銘柄情報】
- 名前: ${stock.name}
- ティッカーコード: ${stock.tickerCode}
- セクター: ${stock.sector || "不明"}
- 現在価格: ${currentPrice}円

【財務指標（銘柄の質を評価）】
${financialMetrics}
${userContext}${predictionContext}
【株価データ】
直近30日の終値: ${prices.length}件のデータあり
${delistingContext}${weekChangeContext}${marketContext}${sectorTrendContext}${patternContext}${technicalContext}${chartPatternContext}${deviationRateContext}${newsContext}
【回答形式】
以下のJSON形式で回答してください。JSON以外のテキストは含めないでください。
${hasPrediction ? "※ 価格帯予測は【AI予測データ】の値をそのまま使用してください。" : ""}

{
  "marketSignal": "bullish" | "neutral" | "bearish",

  // A. 価格帯予測${hasPrediction ? "（【AI予測データ】の値をそのまま使用）" : "（予測を根拠として購入判断の前に示す）"}
  "shortTermTrend": "up" | "neutral" | "down",
  "shortTermPriceLow": ${hasPrediction ? Number(analysis.shortTermPriceLow) : "短期（今週）の予測安値（数値のみ、円単位）"},
  "shortTermPriceHigh": ${hasPrediction ? Number(analysis.shortTermPriceHigh) : "短期（今週）の予測高値（数値のみ、円単位）"},
  "midTermTrend": "up" | "neutral" | "down",
  "midTermPriceLow": ${hasPrediction ? Number(analysis.midTermPriceLow) : "中期（今月）の予測安値（数値のみ、円単位）"},
  "midTermPriceHigh": ${hasPrediction ? Number(analysis.midTermPriceHigh) : "中期（今月）の予測高値（数値のみ、円単位）"},
  "longTermTrend": "up" | "neutral" | "down",
  "longTermPriceLow": ${hasPrediction ? Number(analysis.longTermPriceLow) : "長期（今後3ヶ月）の予測安値（数値のみ、円単位）"},
  "longTermPriceHigh": ${hasPrediction ? Number(analysis.longTermPriceHigh) : "長期（今後3ヶ月）の予測高値（数値のみ、円単位）"},
  "advice": "${hasPrediction ? "【AI予測データ】を踏まえた購入判断のアドバイス" : "上記予測を踏まえた総合アドバイス"}（100文字以内）",

  // B. 購入判断（${hasPrediction ? "【AI予測データ】を根拠として導出" : "価格帯予測を根拠として導出"}する）
  "recommendation": "buy" | "stay" | "avoid",
  "confidence": 0.0から1.0の数値（小数点2桁）,
  "reason": "初心者に分かりやすい言葉で1-2文の理由（${hasPrediction ? "AI予測の根拠を含める" : "価格予測の根拠を含める"}）",
  "caution": "注意点を1-2文",

  // C. 深掘り評価（文字列で返す。配列ではない）
  "positives": "・良い点1\n・良い点2\n・良い点3",
  "concerns": "・不安な点1\n・不安な点2\n・不安な点3",
  "suitableFor": "こんな人におすすめ（1-2文で具体的に）",

  // D. 買い時条件（recommendationがstayの場合のみ）
  "buyCondition": "どうなったら買い時か（例：「株価が○○円を下回ったら」「RSIが30を下回ったら」など具体的に）",

  // E. パーソナライズ（ユーザー設定がある場合）
  "userFitScore": 0-100のおすすめ度,
  "budgetFit": 予算内で購入可能か（true/false）,
  "periodFit": 投資期間にマッチするか（true/false）,
  "riskFit": リスク許容度に合うか（true/false）,
  "personalizedReason": "このユーザーにとってのおすすめ理由（2-3文）"
}

${PROMPT_MARKET_SIGNAL_DEFINITION}

【価格帯予測の指針】
${hasPrediction ? `
- 【重要】AI予測データが提供されている場合は、その値をそのまま使用してください
- 価格帯（priceLow/priceHigh）は提供された値を変更しないでください
- トレンド（shortTermTrend等）も提供された値に従ってください
- 購入判断（recommendation）は、この予測を根拠として導出してください
- 予測が「上昇」なら買い検討、「下落」なら様子見、という整合性を保ってください` : `
- 予測は提供されたテクニカル指標・チャートパターン・ファンダメンタルを根拠として算出する
- 現在価格を起点に、直近ボラティリティ・トレンドを反映した現実的な価格帯にすること
- shortTermPriceLow/High: 直近のボラティリティと今週のトレンドを基準（現在価格±5〜15%を目安）
- midTermPriceLow/High: 中期トレンド・ファンダメンタルを基準（現在価格±10〜25%を目安）
- longTermPriceLow/High: 事業展望・長期トレンドを基準（現在価格±15〜35%を目安）`}
- 予測レンジが recommendation と整合すること（例: buyならshortTermが上昇傾向）
- advice は価格帯予測の数値を踏まえた具体的なコメントにする（例:「今週は○○〜○○円で推移する見込みで...」）

【重要: この銘柄はまだ購入していません】
- この分析はウォッチリスト（購入検討中）の銘柄に対するものです
- ユーザーはまだこの株を保有していません
- 「損切り」「損切りライン」「利確」「利益確定」「売り時」「売却」「保有株」「含み損」「含み益」など、株を保有している前提の表現は絶対に使わないでください
- 代わりに「購入を検討」「エントリー」「買いのタイミング」「見送り」など、購入前の視点で表現してください

【制約】
${PROMPT_NEWS_CONSTRAINTS}
- 「買い時」「今すぐ買うべき」などの断定的な表現は避け、「検討できる」「検討のタイミング」などの表現を使う
- 赤字企業の場合は concerns で必ず「業績が赤字である」ことに言及し、リスクを伝える
- 赤字かつ減益傾向の場合は、特に慎重な表現を使う
- 専門用語（RSI、MACD、チャートパターン名など）は使ってOKだが、必ず簡単な解説を添える
  例: 「RSI（売られすぎ・買われすぎを判断する指標）が30を下回り…」
  例: 「ダブルボトム（2回底を打って反転する形）が形成され…」
- チャートパターンが検出された場合は、reasonで言及する
- positives、concernsは「・項目1\n・項目2」形式の文字列で返す（配列ではない）
- ユーザー設定がない場合、パーソナライズ項目はnullにする
- buyConditionはrecommendationが"stay"の場合のみ具体的な条件を記載し、"buy"や"avoid"の場合はnullにする

【財務指標の活用】
- 財務指標は銘柄の質を評価する参考情報として活用してください
- 財務に懸念点がある場合（割高、ROE低めなど）は、cautionやconcernsで言及してください
- テクニカルが良ければ買い推奨は出せますが、財務リスクは必ず伝えてください

【テクニカル指標の重視】
- RSI・MACDなどのテクニカル指標が提供されている場合は、必ず判断根拠として活用する
- 複数の指標が同じ方向を示している場合（例: RSI売られすぎ + MACD上昇転換）は信頼度を高める
- 指標間で矛盾がある場合（例: RSI買われすぎ だが MACD上昇中）は慎重な判断とし、その旨をcautionで言及する

【過去の価格動向とボラティリティの考慮】
- 直近の価格変動幅（ボラティリティ）が大きい銘柄は、リスクが高いことをconcernsで必ず言及する
- 急騰・急落した銘柄は、反動リスクがあることを伝える
- 過去30日の値動きパターン（上昇トレンド/下落トレンド/横ばい）を判断に反映する

【急騰銘柄への対応 - 重要】
- 週間変化率が+20%以上の銘柄は「上がりきった銘柄」の可能性が高い
- 週間変化率が+30%以上の銘柄は、原則として"buy"ではなく"stay"を推奨する
- 「今から買っても遅い」「すでに上昇している」という観点を必ず考慮する
- cautionで「急騰後の反落リスク」について必ず言及する
- RSIが70以上（買われすぎ）の場合は、特に慎重な判断をする

【株価変動時の原因分析】
- 週間変化率がマイナスの場合、reasonで下落の原因を以下の観点から推測し、自然な文章で説明する：
  - 地合い: 市場全体の資金の流れ（大型株への集中、セクターローテーションなど）
  - 材料: 銘柄固有のニュースや業績予想の変化
  - 需給: 利益確定売りやサポートラインの割り込み
- 週間変化率が+10%以上の場合、reasonで上昇の原因を以下の観点から推測し、自然な文章で説明する：
  - 地合い: 市場全体のリスクオン、セクター物色
  - 材料: 好決算、新製品発表、提携・買収など
  - 需給: 買い戻し、レジスタンスライン突破による買い加速
- 例（下落）: 「市場全体で大型株への資金シフトが進んでおり、中小型株は売られやすい地合いです」
- 例（上昇）: 「好決算を受けて買いが集中し、レジスタンスラインを突破しました」

【"avoid"（見送り推奨）について】
- "avoid"は購入を見送り、ウォッチリストから外すことを検討する判断です
- 以下の条件が複数揃い、回復の見込みが極めて低い場合のみ使用してください:
  * 赤字が継続し、業績改善の兆しがない
  * 下落トレンドが継続している（テクニカル指標がすべてネガティブ）
  * 悪材料が出ており、株価下落が続く見込み
- "avoid"を選ぶ場合は、confidence を 0.8 以上に設定してください
- 迷う場合は "stay" を選んでください。"avoid" は確信がある場合のみ使用
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
      max_tokens: 1200,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "purchase_recommendation",
          strict: true,
          schema: {
            type: "object",
            properties: {
              marketSignal: { type: "string", enum: ["bullish", "neutral", "bearish"] },
              // A. 価格帯予測
              shortTermTrend: { type: "string", enum: ["up", "neutral", "down"] },
              shortTermPriceLow: { type: "number" },
              shortTermPriceHigh: { type: "number" },
              midTermTrend: { type: "string", enum: ["up", "neutral", "down"] },
              midTermPriceLow: { type: "number" },
              midTermPriceHigh: { type: "number" },
              longTermTrend: { type: "string", enum: ["up", "neutral", "down"] },
              longTermPriceLow: { type: "number" },
              longTermPriceHigh: { type: "number" },
              advice: { type: "string" },
              // B. 購入判断
              recommendation: { type: "string", enum: ["buy", "stay", "avoid"] },
              confidence: { type: "number" },
              reason: { type: "string" },
              caution: { type: "string" },
              // C. 深掘り評価
              positives: { type: ["string", "null"] },
              concerns: { type: ["string", "null"] },
              suitableFor: { type: ["string", "null"] },
              // D. 買い時条件
              buyCondition: { type: ["string", "null"] },
              // E. パーソナライズ
              userFitScore: { type: ["number", "null"] },
              budgetFit: { type: ["boolean", "null"] },
              periodFit: { type: ["boolean", "null"] },
              riskFit: { type: ["boolean", "null"] },
              personalizedReason: { type: ["string", "null"] },
            },
            required: [
              "marketSignal",
              "shortTermTrend", "shortTermPriceLow", "shortTermPriceHigh",
              "midTermTrend", "midTermPriceLow", "midTermPriceHigh",
              "longTermTrend", "longTermPriceLow", "longTermPriceHigh",
              "advice",
              "recommendation", "confidence", "reason", "caution",
              "positives", "concerns", "suitableFor",
              "buyCondition",
              "userFitScore", "budgetFit", "periodFit", "riskFit", "personalizedReason"
            ],
            additionalProperties: false,
          },
        },
      },
    })

    const content = response.choices[0].message.content?.trim() || "{}"
    const result = JSON.parse(content)

    // "avoid" は confidence >= 0.8 の場合のみ許可（それ以下は "stay" にフォールバック）
    if (result.recommendation === "avoid" && result.confidence < 0.8) {
      result.recommendation = "stay"
    }

    // 急騰銘柄の強制補正: 週間+30%以上でbuyの場合はstayに変更
    if (isSurgeStock(weekChangeRate) && result.recommendation === "buy") {
      result.recommendation = "stay"
      result.caution = `週間+${weekChangeRate!.toFixed(0)}%の急騰銘柄のため、様子見を推奨します。${result.caution}`
    }

    // 危険銘柄の強制補正: 赤字 かつ 高ボラティリティでbuyの場合はstayに変更
    const volatility = stock.volatility ? Number(stock.volatility) : null

    if (isDangerousStock(stock.isProfitable, volatility) && result.recommendation === "buy") {
      result.recommendation = "stay"
      result.caution = `業績が赤字かつボラティリティが${volatility?.toFixed(0)}%と高いため、様子見を推奨します。${result.caution}`
    }

    // 市場急落時の強制補正: 日経平均が週間-5%以下でbuyの場合はstayに変更
    if (marketData?.isMarketCrash && result.recommendation === "buy") {
      result.recommendation = "stay"
      result.reason = `市場全体が急落しているため、様子見をおすすめします。${result.reason}`
      result.buyCondition = result.buyCondition || "市場が落ち着いてから検討してください"
    }

    // 移動平均乖離率による補正
    const pricesNewestFirst = [...prices].reverse().map(p => ({ close: p.close }))
    const deviationRate = calculateDeviationRate(pricesNewestFirst, MA_DEVIATION.PERIOD)

    // ルール4: 上方乖離 (+20%以上) でbuyの場合はstayに変更
    if (isOverheated(deviationRate) && result.recommendation === "buy") {
      result.recommendation = "stay"
      result.confidence = Math.max(0, result.confidence + MA_DEVIATION.CONFIDENCE_PENALTY)
      result.caution = `25日移動平均線から+${deviationRate!.toFixed(1)}%乖離しており過熱圏のため、様子見を推奨します。${result.caution}`
    }

    // ルール5: 下方乖離 (-20%以下) + 黒字 + 低ボラティリティ → confidenceボーナス
    const isLowVolatility = volatility !== null && volatility <= MA_DEVIATION.LOW_VOLATILITY_THRESHOLD
    if (
      deviationRate !== null &&
      deviationRate <= MA_DEVIATION.LOWER_THRESHOLD &&
      stock.isProfitable === true &&
      isLowVolatility
    ) {
      result.confidence = Math.min(1.0, result.confidence + MA_DEVIATION.CONFIDENCE_BONUS)
    }

    // 下方乖離 (-20%以下) → avoid→stay（パニック売り防止）
    if (
      deviationRate !== null &&
      deviationRate <= SELL_TIMING.PANIC_SELL_THRESHOLD &&
      result.recommendation === "avoid"
    ) {
      result.recommendation = "stay"
      result.caution = `25日移動平均線から${deviationRate.toFixed(1)}%下方乖離しており売られすぎです。大底で見送るのはもったいないため、様子見を推奨します。${result.caution}`
    }

    // 購入タイミング判断（成り行き / 押し目買い）
    let buyTiming: string | null = null
    let dipTargetPrice: number | null = null

    if (result.recommendation === "buy") {
      const rsi = calculateRSI(pricesNewestFirst, 14)
      const sma25 = calculateSMA(pricesNewestFirst, MA_DEVIATION.PERIOD)

      const isHighDeviation = deviationRate !== null && deviationRate > MA_DEVIATION.DIP_BUY_THRESHOLD
      const isOverboughtRSI = rsi !== null && rsi > MA_DEVIATION.RSI_OVERBOUGHT_THRESHOLD

      if (isHighDeviation || isOverboughtRSI) {
        buyTiming = "dip"
        dipTargetPrice = sma25
      } else {
        // 指標が計算できない場合も含め、買い推奨なら成行OK
        buyTiming = "market"
      }
    }

    // 売りタイミング判定（avoid推奨時のみ、テクニカルのみ）
    let sellTiming: string | null = null
    let sellTargetPrice: number | null = null

    if (result.recommendation === "avoid") {
      const rsi = calculateRSI(pricesNewestFirst, 14)
      const sma25 = calculateSMA(pricesNewestFirst, MA_DEVIATION.PERIOD)

      const isDeviationOk = deviationRate === null || deviationRate >= SELL_TIMING.DEVIATION_LOWER_THRESHOLD
      const isRsiOk = rsi === null || rsi >= SELL_TIMING.RSI_OVERSOLD_THRESHOLD

      if (isDeviationOk && isRsiOk) {
        sellTiming = "market"
      } else {
        sellTiming = "rebound"
        sellTargetPrice = sma25
      }
    }

    // データベースに保存（upsert）
    // JSTの今日00:00をUTCに変換
    const today = getTodayForDB()

    const savedRecommendation = await prisma.purchaseRecommendation.upsert({
      where: {
        stockId_date: {
          stockId,
          date: today,
        },
      },
      update: {
        marketSignal: result.marketSignal || null,
        recommendation: result.recommendation,
        confidence: result.confidence,
        reason: result.reason,
        caution: result.caution,
        // B. 深掘り評価
        positives: result.positives || null,
        concerns: result.concerns || null,
        suitableFor: result.suitableFor || null,
        // C. 買い時条件
        buyCondition: result.recommendation === "stay" ? (result.buyCondition || null) : null,
        buyTiming: buyTiming,
        dipTargetPrice: dipTargetPrice,
        sellTiming: sellTiming,
        sellTargetPrice: sellTargetPrice,
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
        marketSignal: result.marketSignal || null,
        recommendation: result.recommendation,
        confidence: result.confidence,
        reason: result.reason,
        caution: result.caution,
        // B. 深掘り評価
        positives: result.positives || null,
        concerns: result.concerns || null,
        suitableFor: result.suitableFor || null,
        // C. 買い時条件
        buyCondition: result.recommendation === "stay" ? (result.buyCondition || null) : null,
        buyTiming: buyTiming,
        dipTargetPrice: dipTargetPrice,
        sellTiming: sellTiming,
        sellTargetPrice: sellTargetPrice,
        // D. パーソナライズ
        userFitScore: result.userFitScore ?? null,
        budgetFit: result.budgetFit ?? null,
        periodFit: result.periodFit ?? null,
        riskFit: result.riskFit ?? null,
        personalizedReason: result.personalizedReason || null,
      },
    })

    // StockAnalysisに価格帯予測を保存（購入判断の根拠として）
    const now = new Date()
    await prisma.stockAnalysis.create({
      data: {
        stockId,
        shortTermTrend: result.shortTermTrend || "neutral",
        shortTermPriceLow: result.shortTermPriceLow || currentPrice || 0,
        shortTermPriceHigh: result.shortTermPriceHigh || currentPrice || 0,
        midTermTrend: result.midTermTrend || "neutral",
        midTermPriceLow: result.midTermPriceLow || currentPrice || 0,
        midTermPriceHigh: result.midTermPriceHigh || currentPrice || 0,
        longTermTrend: result.longTermTrend || "neutral",
        longTermPriceLow: result.longTermPriceLow || currentPrice || 0,
        longTermPriceHigh: result.longTermPriceHigh || currentPrice || 0,
        recommendation: result.recommendation === "buy" ? "buy" : result.recommendation === "avoid" ? "sell" : "hold",
        advice: result.advice || result.reason || "",
        confidence: result.confidence || 0.7,
        limitPrice: null,
        stopLossPrice: null,
        analyzedAt: now,
      },
    })

    // Outcome作成（推薦保存成功後）
    // 銘柄のvolatilityとmarketCapを取得
    const stockWithMetrics = await prisma.stock.findUnique({
      where: { id: stockId },
      select: { volatility: true, marketCap: true },
    })

    // predictionをOutcome用にマッピング
    const predictionMap: Record<string, Prediction> = {
      buy: "buy",
      stay: "stay",
      avoid: "remove",
    }

    await insertRecommendationOutcome({
      type: "purchase",
      recommendationId: savedRecommendation.id,
      stockId,
      tickerCode: stock.tickerCode,
      sector: stock.sector,
      recommendedAt: new Date(),
      priceAtRec: currentPrice,
      prediction: predictionMap[result.recommendation] || "stay",
      confidence: result.confidence,
      volatility: stockWithMetrics?.volatility ? Number(stockWithMetrics.volatility) : null,
      marketCap: stockWithMetrics?.marketCap ? BigInt(Number(stockWithMetrics.marketCap) * 100_000_000) : null,
    })

    // レスポンス
    return NextResponse.json({
      stockId: stock.id,
      stockName: stock.name,
      tickerCode: stock.tickerCode,
      currentPrice: currentPrice,
      marketSignal: result.marketSignal || null,
      // A. 価格帯予測
      shortTermTrend: result.shortTermTrend || null,
      shortTermPriceLow: result.shortTermPriceLow || null,
      shortTermPriceHigh: result.shortTermPriceHigh || null,
      midTermTrend: result.midTermTrend || null,
      midTermPriceLow: result.midTermPriceLow || null,
      midTermPriceHigh: result.midTermPriceHigh || null,
      longTermTrend: result.longTermTrend || null,
      longTermPriceLow: result.longTermPriceLow || null,
      longTermPriceHigh: result.longTermPriceHigh || null,
      advice: result.advice || null,
      // B. 購入判断
      recommendation: result.recommendation,
      confidence: result.confidence,
      reason: result.reason,
      caution: result.caution,
      // C. 深掘り評価
      positives: result.positives || null,
      concerns: result.concerns || null,
      suitableFor: result.suitableFor || null,
      // D. 買い時条件
      buyCondition: result.recommendation === "stay" ? (result.buyCondition || null) : null,
      buyTiming: buyTiming,
      dipTargetPrice: dipTargetPrice,
      // E. パーソナライズ
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
