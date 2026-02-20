import { prisma } from "@/lib/prisma"
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
import { getNikkei225Data } from "@/lib/market-index"
import { getSectorTrend, formatSectorTrendForPrompt } from "@/lib/sector-trend"
import { calculateDeviationRate, calculateRSI, calculateSMA } from "@/lib/technical-indicators"
import { MA_DEVIATION, SELL_TIMING } from "@/lib/constants"
import { isSurgeStock, isDangerousStock } from "@/lib/stock-safety-rules"
import { insertRecommendationOutcome, Prediction } from "@/lib/outcome-utils"
import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"

dayjs.extend(utc)
dayjs.extend(timezone)

export class AnalysisError extends Error {
  constructor(
    message: string,
    public readonly code: "NOT_FOUND" | "STALE_DATA" | "NO_PRICE_DATA" | "INTERNAL"
  ) {
    super(message)
  }
}

export interface PortfolioAnalysisResult {
  shortTerm: string
  mediumTerm: string
  longTerm: string
  statusType: string
  marketSignal: string | null
  suggestedSellPrice: number | null
  suggestedSellPercent: number | null
  sellReason: string | null
  sellCondition: string | null
  sellTiming: string | null
  sellTargetPrice: number | null
  recommendation: string | null
  lastAnalysis: string
  isToday: true
}

/**
 * ポートフォリオ分析のコアロジック
 * APIルート・fire-and-forget両方から呼ばれる単一ソースオブトゥルース
 */
export async function executePortfolioAnalysis(
  userId: string,
  stockId: string
): Promise<PortfolioAnalysisResult> {
  // ポートフォリオ銘柄と株式情報を取得
  const portfolioStock = await prisma.portfolioStock.findFirst({
    where: {
      userId,
      stockId,
    },
    include: {
      stock: true,
      transactions: {
        orderBy: { transactionDate: "asc" },
      },
    },
  })

  if (!portfolioStock) {
    throw new AnalysisError("この銘柄はポートフォリオに登録されていません", "NOT_FOUND")
  }

  // ユーザー設定を取得
  const userSettings = await prisma.userSettings.findUnique({
    where: { userId },
    select: {
      investmentPeriod: true,
      riskTolerance: true,
    },
  })

  // 保有数量と平均取得単価を計算
  let quantity = 0
  let totalBuyCost = 0
  let totalBuyQuantity = 0

  for (const tx of portfolioStock.transactions) {
    if (tx.type === "buy") {
      quantity += tx.quantity
      totalBuyCost += Number(tx.totalAmount)
      totalBuyQuantity += tx.quantity
    } else {
      quantity -= tx.quantity
    }
  }

  const averagePrice = totalBuyQuantity > 0 ? totalBuyCost / totalBuyQuantity : 0

  // staleチェック: 株価データが古すぎる銘柄は分析スキップ
  const { prices: realtimePrices, staleTickers: staleCheck } = await fetchStockPrices([portfolioStock.stock.tickerCode])
  if (staleCheck.includes(portfolioStock.stock.tickerCode)) {
    throw new AnalysisError("最新の株価が取得できないため分析がおこなえません", "STALE_DATA")
  }

  // リアルタイム株価を取得
  const currentPrice = realtimePrices[0]?.currentPrice ?? null

  // 損益計算
  let profit: number | null = null
  let profitPercent: number | null = null
  if (currentPrice && averagePrice > 0 && quantity > 0) {
    const totalCost = averagePrice * quantity
    const currentValue = currentPrice * quantity
    profit = currentValue - totalCost
    profitPercent = (profit / totalCost) * 100
  }

  // 直近30日の価格データを取得（yfinanceからリアルタイム取得）
  const historicalPrices = await fetchHistoricalPrices(portfolioStock.stock.tickerCode, "1m")
  const prices = historicalPrices.slice(-30) // oldest-first

  // ローソク足パターン分析
  const patternContext = buildCandlestickContext(prices)

  // テクニカル指標（RSI / MACD）
  const technicalContext = buildTechnicalContext(prices)

  // チャートパターン（複数足フォーメーション）の検出
  const chartPatternContext = buildChartPatternContext(prices)

  // 週間変化率
  const { text: weekChangeContext, rate: weekChangeRate } = buildWeekChangeContext(prices, "portfolio")

  // 乖離率コンテキスト
  const deviationRateContext = buildDeviationRateContext(prices)

  // 関連ニュースを取得
  const tickerCode = portfolioStock.stock.tickerCode.replace(".T", "")
  const news = await getRelatedNews({
    tickerCodes: [tickerCode],
    sectors: portfolioStock.stock.sector ? [portfolioStock.stock.sector] : [],
    limit: 5,
    daysAgo: 7,
  })
  const newsContext = news.length > 0
    ? `\n【最新のニュース情報】\n${formatNewsForPrompt(news)}`
    : ""

  // 財務指標のフォーマット
  const stock = portfolioStock.stock
  const financialMetrics = buildFinancialMetrics(stock, currentPrice)

  // 上場廃止コンテキスト
  const delistingContext = buildDelistingContext(stock.isDelisted, stock.fetchFailCount)

  // 日経平均の市場文脈を取得
  let marketData = null
  try {
    marketData = await getNikkei225Data()
  } catch (error) {
    console.error("市場データ取得失敗（フォールバック）:", error)
  }
  const marketContext = buildMarketContext(marketData)

  // セクタートレンド
  let sectorTrendContext = ""
  if (stock.sector) {
    const sectorTrend = await getSectorTrend(stock.sector)
    if (sectorTrend) {
      sectorTrendContext = `\n【セクタートレンド】\n${formatSectorTrendForPrompt(sectorTrend)}\n`
    }
  }

  // ユーザー設定コンテキスト
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
    ? `\n【ユーザーの投資設定】
- 投資期間: ${periodMap[userSettings.investmentPeriod] || userSettings.investmentPeriod}
- リスク許容度: ${riskMap[userSettings.riskTolerance] || userSettings.riskTolerance}
`
    : ""

  // プロンプト構築
  const prompt = `あなたは投資初心者向けのAIアナリストです。
以下の保有銘柄について、テクニカル分析と売買判断を提供してください。

【絶対ルール】
- 「焦らないで」「大丈夫です」「株価は上下するもの」などの感情的な励ましは絶対に書かない
- すべての判断に具体的な根拠（テクニカル指標・ニュース・市場環境・財務指標）を必ず1つ以上挙げる
- 文章は必ず「〇〇な理由で → △△な判断」の順番で書く
- 専門用語を使う場合は必ず括弧内に解説を添える（例: RSI（売られすぎ・買われすぎの指標）、MACD（トレンドの勢いを示す指標））

【銘柄情報】
- 名前: ${stock.name}
- ティッカーコード: ${stock.tickerCode}
- セクター: ${stock.sector || "不明"}
- 保有数量: ${quantity}株
- 平均取得単価: ${averagePrice.toFixed(0)}円
- 現在価格: ${currentPrice ? currentPrice.toLocaleString() : "不明"}円
- 損益: ${profit !== null && profitPercent !== null ? `${profit.toLocaleString()}円 (${profitPercent >= 0 ? "+" : ""}${profitPercent.toFixed(2)}%)` : "不明"}
${userContext}
【財務指標（初心者向け解説）】
${financialMetrics}

【テクニカル分析】${weekChangeContext}${patternContext}${technicalContext}${chartPatternContext}${deviationRateContext}
【株価データ】
直近30日の終値: ${prices.length}件のデータあり
${newsContext}${marketContext}${sectorTrendContext}

【回答形式】
以下のJSON形式で回答してください。JSON以外のテキストは含めないでください。

{
  "marketSignal": "bullish" | "neutral" | "bearish",
  "shortTerm": "【必須】テクニカル指標・ニュース等の具体的な根拠を1-2文で述べた後、今週の判断（様子見/買い増し検討/売却検討）を1文で結論づける。合計2-3文。感情的な励ましは書かない。",
  "mediumTerm": "【必須】ファンダメンタル・中期トレンドの根拠を1-2文で述べた後、今月の判断を1文で結論づける。合計2-3文。感情的な励ましは書かない。",
  "longTerm": "【必須】事業展望・財務状況の根拠を1-2文で述べた後、長期継続の判断を1文で結論づける。合計2-3文。感情的な励ましは書かない。",
  "suggestedSellPrice": 売却目標価格（数値のみ、円単位、現在価格・平均取得単価・市場分析を総合的に考慮）,
  "suggestedSellPercent": 推奨売却割合（25, 50, 75, 100のいずれか。一部利確なら25-75、全売却なら100）,
  "sellReason": "具体的なシグナルや指標名を挙げて売却理由を説明する（例：「RSI（売られすぎ・買われすぎの指標）が70超の買われすぎ水準で、レジスタンスラインに到達」）",
  "suggestedStopLossPrice": 損切りライン価格（数値のみ、円単位、現在価格と平均取得単価を考慮した適切な水準）,
  "sellCondition": "どの指標がどの水準になったら売るかを具体的に記述（例：「RSIが再び70を超えたら追加売却、MACDがデッドクロスしたら全売却」）",
  "statusType": "ステータス（good/neutral/warningのいずれか）",

  "shortTermTrend": "up" | "neutral" | "down",
  "shortTermPriceLow": 短期予測の下限価格（数値のみ）,
  "shortTermPriceHigh": 短期予測の上限価格（数値のみ）,
  "midTermTrend": "up" | "neutral" | "down",
  "midTermPriceLow": 中期予測の下限価格（数値のみ）,
  "midTermPriceHigh": 中期予測の上限価格（数値のみ）,
  "longTermTrend": "up" | "neutral" | "down",
  "longTermPriceLow": 長期予測の下限価格（数値のみ）,
  "longTermPriceHigh": 長期予測の上限価格（数値のみ）,
  "recommendation": "buy" | "hold" | "sell",
  "advice": "テクニカル・ファンダメンタルの根拠に基づく具体的なアドバイス（100文字以内）",
  "confidence": 0.0〜1.0の信頼度
}

${PROMPT_MARKET_SIGNAL_DEFINITION}

【判断の指針】
- テクニカル指標（RSI・MACD・ローソク足・チャートパターン）を必ず分析に活用してください
- 財務指標（会社の規模、配当、株価水準）を分析に活用してください
${PROMPT_NEWS_CONSTRAINTS}
- ユーザーの売却目標設定がある場合は、目標への進捗や損切ラインへの接近を考慮してください
- ユーザーの投資期間設定がある場合は、期間に応じて判断の重みを調整してください（短期→shortTerm重視、長期→longTerm重視）
- ユーザーのリスク許容度が低い場合は早めの売却検討を、高い場合は許容幅を広げてください

【業績に基づく判断の指針】
- 赤字企業の場合は、shortTermで必ず「業績が赤字であること」とその判断への影響を言及する
- 赤字かつ減益傾向の場合は、買い増しには慎重な判断を示す
- 黒字かつ増益傾向の場合は、より前向きな評価ができる

【売買判断の指針】
- shortTerm: 主にテクニカル指標を根拠として、「様子見」「買い増し検討」「売却検討」のいずれかの判断を必ず結論に含める
- mediumTerm: 主にファンダメンタルとトレンドを根拠として、今月の見通しと推奨行動を必ず結論に含める
- longTerm: 主に事業展望・財務状況を根拠として、長期継続の判断を必ず結論に含める
- suggestedSellPrice: 現在価格と平均取得単価の両方を考慮し、適切な売却目標価格を提案
- suggestedStopLossPrice: 平均取得単価を基準に、現在の含み益/含み損を考慮した適切な損切りラインを提案
- sellCondition: どの指標がどの水準になったら売るかを具体的に記述する
- 損切りも重要な選択肢: 損失が大きく、回復の見込みが薄い場合は損切りを提案する

【利確・損切りラインの指針】
- 利確目標（suggestedSellPrice）:
  - 含み益がある場合: 現在の利益を確保しつつ、さらなる上昇余地を考慮した目標価格
  - 含み損がある場合: 平均取得単価への回復を目標とするか、市場分析に基づく現実的な水準
- 損切りライン（suggestedStopLossPrice）:
  - 含み益がある場合: 利益が消えないライン（例：平均取得単価の少し上）
  - 含み損がある場合: これ以上の損失拡大を防ぐライン（例：現在価格から-5%〜-10%）

【売却割合の判断指針】
- suggestedSellPercent: 市場状況と損益に応じて適切な売却割合を判断
  - 25%: 利益確定しつつ上昇余地も狙う
  - 50%: 利益を半分確保、残りで上値追い
  - 75%: 大部分を利確、少量残して様子見
  - 100%: 全売却推奨
- sellReason: テクニカル・ファンダメンタルに基づく具体的な売却理由を記載（指標名と数値を必ず含める）
- 【重要】statusType と recommendation の整合性（必ず守ること）:
  - recommendation が "sell" → statusType は必ず "warning" にし、sellReason に理由を記載
  - recommendation が "buy" → statusType は "good" または "neutral"（"warning" にしない）
  - suggestedSellPrice が現在価格に近い（±2%以内）場合 → recommendation は "sell" とし、statusType は "warning" にする
  - statusType が "neutral" または "good" の場合 → sellReason と suggestedSellPercent は null にする

【損切り提案の指針】
- 損失率が-15%以上かつ下落トレンドが続いている場合は、損切りを選択肢として提示
- 損切りを提案する場合は感情的な言葉を使わず、根拠（テクニカル指標・損失率）を示す
- 例（良い）: 「RSIが20台の売られすぎ水準が2週間続き、損失率-18%に達しているため、損切りを検討してください」
- 例（悪い）: 「損失を抱えていますが、次の投資機会のため決断しましょう」

【株価変動時の原因分析】
- 週間変化率がマイナスの場合、shortTermで下落の原因を以下の観点から推測し、自然な文章で説明する：
  - 地合い: 市場全体の資金の流れ（大型株への集中、セクターローテーションなど）
  - 材料: 銘柄固有のニュースや業績予想の変化
  - 需給: 利益確定売りやサポートラインの割り込み
- 週間変化率が+10%以上の場合、shortTermで上昇の原因を以下の観点から推測し、自然な文章で説明する：
  - 地合い: 市場全体のリスクオン、セクター物色
  - 材料: 好決算、新製品発表、提携・買収など
  - 需給: 買い戻し、レジスタンスライン突破による買い加速
- 例（下落）: 「市場全体で大型株への資金シフトが進んでおり、中小型株は売られやすい地合いです」
- 例（上昇）: 「好決算を受けて買いが集中し、レジスタンスラインを突破しました」

【ステータスの指針（3段階）】
- good（買増検討）: 利益率 +5%以上、または上昇トレンド
- neutral（様子見）: 利益率 -10%〜+5%、横ばい
- warning（売却推奨）: 利益率 -10%以下、または下落トレンド・急落中

【表現の指針】
- 専門用語を使う場合は必ず括弧内に解説を添える（例: RSI（売られすぎ・買われすぎの指標）、ダブルボトム（2回底を打って反転するパターン））
- 感情的な励まし・慰めの言葉は一切使わない
- 根拠のない楽観・悲観は書かない
- テクニカル指標と財務指標を根拠にした具体的な判断を示す
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
    temperature: 0.3,
    max_tokens: 800,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "portfolio_analysis",
        strict: true,
        schema: {
          type: "object",
          properties: {
            marketSignal: { type: "string", enum: ["bullish", "neutral", "bearish"] },
            shortTerm: { type: "string" },
            mediumTerm: { type: "string" },
            longTerm: { type: "string" },
            suggestedSellPrice: { type: ["number", "null"] },
            suggestedSellPercent: { type: ["integer", "null"], enum: [25, 50, 75, 100, null] },
            sellReason: { type: ["string", "null"] },
            suggestedStopLossPrice: { type: ["number", "null"] },
            sellCondition: { type: ["string", "null"] },
            statusType: { type: "string", enum: ["good", "neutral", "warning"] },
            shortTermTrend: { type: "string", enum: ["up", "neutral", "down"] },
            shortTermPriceLow: { type: "number" },
            shortTermPriceHigh: { type: "number" },
            midTermTrend: { type: "string", enum: ["up", "neutral", "down"] },
            midTermPriceLow: { type: "number" },
            midTermPriceHigh: { type: "number" },
            longTermTrend: { type: "string", enum: ["up", "neutral", "down"] },
            longTermPriceLow: { type: "number" },
            longTermPriceHigh: { type: "number" },
            recommendation: { type: "string", enum: ["buy", "hold", "sell"] },
            advice: { type: "string" },
            confidence: { type: "number" },
          },
          required: [
            "marketSignal",
            "shortTerm", "mediumTerm", "longTerm",
            "suggestedSellPrice", "suggestedSellPercent", "sellReason",
            "suggestedStopLossPrice", "sellCondition",
            "statusType",
            "shortTermTrend", "shortTermPriceLow", "shortTermPriceHigh",
            "midTermTrend", "midTermPriceLow", "midTermPriceHigh",
            "longTermTrend", "longTermPriceLow", "longTermPriceHigh",
            "recommendation", "advice", "confidence"
          ],
          additionalProperties: false,
        },
      },
    },
  })

  const content = response.choices[0].message.content?.trim() || "{}"
  const result = JSON.parse(content)

  let statusType = result.statusType as string

  // 乖離率・RSI計算（売りタイミング判定用）
  const pricesNewestFirst = [...prices].reverse().map(p => ({ close: p.close }))
  const deviationRate = calculateDeviationRate(pricesNewestFirst, MA_DEVIATION.PERIOD)
  const rsiValue = calculateRSI(pricesNewestFirst)
  const sma25 = calculateSMA(pricesNewestFirst, MA_DEVIATION.PERIOD)

  // 強制補正: 乖離率-20%以下 → sell→hold（パニック売り防止）
  if (
    deviationRate !== null &&
    deviationRate <= SELL_TIMING.PANIC_SELL_THRESHOLD &&
    result.recommendation === "sell"
  ) {
    result.recommendation = "hold"
    result.statusType = "neutral"
    statusType = "neutral"
    result.sellReason = null
    result.suggestedSellPercent = null
    result.sellCondition = `25日移動平均線から${deviationRate.toFixed(1)}%下方乖離しており異常な売られすぎです。大底で手放すリスクが高いため、自律反発を待つことを推奨します。`
  }

  // 上場廃止銘柄の強制補正
  if (stock.isDelisted) {
    statusType = "warning"
    result.statusType = "warning"
    result.recommendation = "sell"
    result.shortTerm = `この銘柄は上場廃止されています。保有している場合は証券会社に確認してください。${result.shortTerm}`
  }

  // 急騰銘柄の買い増し抑制: 週間+30%以上でbuy→hold
  if (isSurgeStock(weekChangeRate) && result.recommendation === "buy") {
    result.recommendation = "hold"
    result.shortTerm = `週間+${weekChangeRate!.toFixed(0)}%の急騰後のため、買い増しは高値掴みのリスクがあります。${result.shortTerm}`
  }

  // 危険銘柄の買い増し抑制: 赤字+高ボラでbuy→hold
  const volatility = stock.volatility ? Number(stock.volatility) : null
  if (isDangerousStock(stock.isProfitable, volatility) && result.recommendation === "buy") {
    result.recommendation = "hold"
    result.shortTerm = `業績が赤字かつボラティリティが${volatility?.toFixed(0)}%と高いため、買い増しは慎重に検討してください。${result.shortTerm}`
  }

  // statusType と recommendation の整合性補正
  if (result.recommendation === "sell" && statusType !== "warning") {
    statusType = "warning"
    result.statusType = "warning"
  }
  if (
    result.recommendation === "hold" &&
    result.suggestedSellPrice &&
    currentPrice &&
    Math.abs(result.suggestedSellPrice - currentPrice) / currentPrice < 0.02
  ) {
    result.recommendation = "sell"
    statusType = "warning"
    result.statusType = "warning"
  }
  if (result.recommendation === "buy" && statusType === "warning") {
    statusType = "neutral"
    result.statusType = "neutral"
  }

  // 売りタイミング判定（sell推奨時のみ）
  let sellTiming: string | null = null
  let sellTargetPrice: number | null = null

  if (result.recommendation === "sell") {
    if (profitPercent !== null && profitPercent <= SELL_TIMING.STOP_LOSS_THRESHOLD) {
      sellTiming = "market"
    } else if (profitPercent !== null && profitPercent >= SELL_TIMING.PROFIT_TAKING_THRESHOLD) {
      sellTiming = "market"
    } else {
      const isDeviationOk = deviationRate === null || deviationRate >= SELL_TIMING.DEVIATION_LOWER_THRESHOLD
      const isRsiOk = rsiValue === null || rsiValue >= SELL_TIMING.RSI_OVERSOLD_THRESHOLD

      if (deviationRate === null && rsiValue === null) {
        sellTiming = null
      } else if (isDeviationOk && isRsiOk) {
        sellTiming = "market"
      } else {
        sellTiming = "rebound"
        sellTargetPrice = sma25
      }
    }
  }

  // データベースに保存
  const now = dayjs.utc().toDate()

  const [, createdAnalysis] = await prisma.$transaction([
    prisma.portfolioStock.update({
      where: { id: portfolioStock.id },
      data: {
        shortTerm: result.shortTerm,
        mediumTerm: result.mediumTerm,
        longTerm: result.longTerm,
        statusType,
        marketSignal: result.marketSignal || null,
        suggestedSellPrice: result.suggestedSellPrice ? result.suggestedSellPrice : null,
        suggestedSellPercent: result.suggestedSellPercent || null,
        sellReason: result.sellReason || null,
        sellCondition: result.sellCondition || null,
        sellTiming: sellTiming,
        sellTargetPrice: sellTargetPrice,
        lastAnalysis: now,
        updatedAt: now,
      },
    }),
    prisma.stockAnalysis.create({
      data: {
        stockId,
        shortTermTrend: result.shortTermTrend || "neutral",
        shortTermPriceLow: result.shortTermPriceLow || currentPrice || 0,
        shortTermPriceHigh: result.shortTermPriceHigh || currentPrice || 0,
        shortTermText: result.shortTerm || null,
        midTermTrend: result.midTermTrend || "neutral",
        midTermPriceLow: result.midTermPriceLow || currentPrice || 0,
        midTermPriceHigh: result.midTermPriceHigh || currentPrice || 0,
        midTermText: result.mediumTerm || null,
        longTermTrend: result.longTermTrend || "neutral",
        longTermPriceLow: result.longTermPriceLow || currentPrice || 0,
        longTermPriceHigh: result.longTermPriceHigh || currentPrice || 0,
        longTermText: result.longTerm || null,
        recommendation: result.recommendation,
        advice: result.advice || result.shortTerm || "",
        confidence: result.confidence || 0.7,
        limitPrice: result.suggestedSellPrice || null,
        stopLossPrice: result.suggestedStopLossPrice || null,
        statusType: statusType || null,
        sellCondition: result.sellCondition || null,
        analyzedAt: now,
      },
    }),
  ])

  // Outcome追跡
  const trendToPrediction: Record<string, Prediction> = {
    up: "up",
    down: "down",
    neutral: "neutral",
  }

  await insertRecommendationOutcome({
    type: "analysis",
    recommendationId: createdAnalysis.id,
    stockId,
    tickerCode: stock.tickerCode,
    sector: stock.sector,
    recommendedAt: now,
    priceAtRec: currentPrice || 0,
    prediction: trendToPrediction[result.shortTermTrend] || "neutral",
    confidence: result.confidence || 0.7,
    volatility: stock.volatility ? Number(stock.volatility) : null,
    marketCap: stock.marketCap ? BigInt(Number(stock.marketCap) * 100_000_000) : null,
  })

  return {
    shortTerm: result.shortTerm,
    mediumTerm: result.mediumTerm,
    longTerm: result.longTerm,
    statusType,
    marketSignal: result.marketSignal || null,
    suggestedSellPrice: result.suggestedSellPrice || null,
    suggestedSellPercent: result.suggestedSellPercent || null,
    sellReason: result.sellReason || null,
    sellCondition: result.sellCondition || null,
    sellTiming: sellTiming,
    sellTargetPrice: sellTargetPrice,
    recommendation: result.recommendation || null,
    lastAnalysis: now.toISOString(),
    isToday: true,
  }
}
