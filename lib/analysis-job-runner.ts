import { prisma } from "@/lib/prisma"
import { getOpenAIClient } from "@/lib/openai"
import { getRelatedNews, formatNewsForPrompt } from "@/lib/news-rag"
import { fetchHistoricalPrices, fetchStockPrices } from "@/lib/stock-price-fetcher"
import { analyzeSingleCandle, CandlestickData } from "@/lib/candlestick-patterns"
import { detectChartPatterns, formatChartPatternsForPrompt, PricePoint } from "@/lib/chart-patterns"
import { calculateRSI, calculateMACD } from "@/lib/technical-indicators"
import { getTodayForDB } from "@/lib/date-utils"
import { insertRecommendationOutcome, Prediction } from "@/lib/outcome-utils"
import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"

dayjs.extend(utc)
dayjs.extend(timezone)

/**
 * ポートフォリオ分析ジョブを実行
 */
export async function runPortfolioAnalysis(
  jobId: string,
  userId: string,
  stockId: string
): Promise<void> {
  try {
    // ジョブをprocessingに更新
    await prisma.analysisJob.update({
      where: { id: jobId },
      data: {
        status: "processing",
        startedAt: new Date(),
      },
    })

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
      throw new Error("この銘柄はポートフォリオに登録されていません")
    }

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

    // リアルタイム株価を取得
    const realtimePrices = await fetchStockPrices([portfolioStock.stock.tickerCode])
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

    // 直近30日の価格データを取得
    const historicalPrices = await fetchHistoricalPrices(portfolioStock.stock.tickerCode, "1m")
    const prices = historicalPrices.slice(-30)

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
    const metrics: string[] = []

    if (stock.marketCap) {
      const marketCap = Number(stock.marketCap)
      if (marketCap >= 10000) {
        metrics.push(`- 会社の規模: 大企業（時価総額${(marketCap / 10000).toFixed(1)}兆円）`)
      } else if (marketCap >= 1000) {
        metrics.push(`- 会社の規模: 中堅企業（時価総額${marketCap.toFixed(0)}億円）`)
      } else {
        metrics.push(`- 会社の規模: 小型企業（時価総額${marketCap.toFixed(0)}億円）`)
      }
    }

    if (stock.dividendYield) {
      const divYield = Number(stock.dividendYield)
      if (divYield >= 4) {
        metrics.push(`- 配当: 高配当（年${divYield.toFixed(2)}%）`)
      } else if (divYield >= 2) {
        metrics.push(`- 配当: 普通（年${divYield.toFixed(2)}%）`)
      } else if (divYield > 0) {
        metrics.push(`- 配当: 低め（年${divYield.toFixed(2)}%）`)
      } else {
        metrics.push("- 配当: なし")
      }
    }

    if (stock.pbr) {
      const pbr = Number(stock.pbr)
      if (pbr < 1) {
        metrics.push("- 株価水準(PBR): 割安（資産価値より安い）")
      } else if (pbr < 1.5) {
        metrics.push("- 株価水準(PBR): 適正")
      } else {
        metrics.push("- 株価水準(PBR): やや割高")
      }
    }

    if (stock.per) {
      const per = Number(stock.per)
      if (per < 0) {
        metrics.push("- 収益性(PER): 赤字のため算出不可")
      } else if (per < 10) {
        metrics.push(`- 収益性(PER): 割安（${per.toFixed(1)}倍）`)
      } else if (per < 20) {
        metrics.push(`- 収益性(PER): 適正（${per.toFixed(1)}倍）`)
      } else if (per < 30) {
        metrics.push(`- 収益性(PER): やや割高（${per.toFixed(1)}倍）`)
      } else {
        metrics.push(`- 収益性(PER): 割高（${per.toFixed(1)}倍）`)
      }
    }

    if (stock.roe) {
      const roe = Number(stock.roe) * 100
      if (roe >= 15) {
        metrics.push(`- 経営効率(ROE): 優秀（${roe.toFixed(1)}%）`)
      } else if (roe >= 10) {
        metrics.push(`- 経営効率(ROE): 良好（${roe.toFixed(1)}%）`)
      } else if (roe >= 5) {
        metrics.push(`- 経営効率(ROE): 普通（${roe.toFixed(1)}%）`)
      } else if (roe > 0) {
        metrics.push(`- 経営効率(ROE): 低め（${roe.toFixed(1)}%）`)
      } else {
        metrics.push(`- 経営効率(ROE): 赤字`)
      }
    }

    if (stock.isProfitable !== null && stock.isProfitable !== undefined) {
      if (stock.isProfitable) {
        if (stock.profitTrend === "increasing") {
          metrics.push("- 業績: 黒字（利益増加傾向）")
        } else if (stock.profitTrend === "decreasing") {
          metrics.push("- 業績: 黒字（利益減少傾向）")
        } else {
          metrics.push("- 業績: 黒字")
        }
      } else {
        metrics.push("- 業績: 赤字")
      }
    }

    if (stock.revenueGrowth) {
      const growth = Number(stock.revenueGrowth)
      if (growth >= 20) {
        metrics.push(`- 売上成長: 急成長（前年比+${growth.toFixed(1)}%）`)
      } else if (growth >= 10) {
        metrics.push(`- 売上成長: 好調（前年比+${growth.toFixed(1)}%）`)
      } else if (growth >= 0) {
        metrics.push(`- 売上成長: 安定（前年比+${growth.toFixed(1)}%）`)
      } else if (growth >= -10) {
        metrics.push(`- 売上成長: やや減少（前年比${growth.toFixed(1)}%）`)
      } else {
        metrics.push(`- 売上成長: 減少傾向（前年比${growth.toFixed(1)}%）`)
      }
    }

    if (stock.eps) {
      const eps = Number(stock.eps)
      if (eps > 0) {
        metrics.push(`- 1株利益(EPS): ${eps.toFixed(0)}円`)
      } else {
        metrics.push(`- 1株利益(EPS): 赤字`)
      }
    }

    if (stock.fiftyTwoWeekHigh && stock.fiftyTwoWeekLow && currentPrice) {
      const high = Number(stock.fiftyTwoWeekHigh)
      const low = Number(stock.fiftyTwoWeekLow)
      const position = high !== low ? ((currentPrice - low) / (high - low)) * 100 : 50
      metrics.push(`- 1年間の値動き: 高値${high.toFixed(0)}円〜安値${low.toFixed(0)}円（現在は${position.toFixed(0)}%の位置）`)
    }

    const financialMetrics = metrics.length > 0 ? metrics.join("\n") : "財務データなし"

    // 日経平均の市場文脈を取得
    let marketContext = ""
    try {
      const nikkeiPrices = await fetchStockPrices(["^N225"])
      if (nikkeiPrices.length > 0) {
        const nikkei = nikkeiPrices[0]
        const nikkeiHistorical = await fetchHistoricalPrices("^N225", "1m")
        let weeklyChangePercent: number | null = null
        if (nikkeiHistorical.length >= 5) {
          const oneWeekAgo = nikkeiHistorical[Math.max(0, nikkeiHistorical.length - 6)]
          weeklyChangePercent = ((nikkei.currentPrice - oneWeekAgo.close) / oneWeekAgo.close) * 100
        }

        marketContext = `

【市場全体の状況】
- 日経平均: ${Math.round(nikkei.currentPrice).toLocaleString()}円（前日比 ${nikkei.change >= 0 ? "+" : ""}${Math.round(nikkei.change).toLocaleString()}円、${nikkei.changePercent >= 0 ? "+" : ""}${nikkei.changePercent.toFixed(2)}%）
${weeklyChangePercent !== null ? `- 直近1週間: ${weeklyChangePercent >= 0 ? "+" : ""}${weeklyChangePercent.toFixed(2)}%` : ""}
※ 市場全体の動きと比較して、この銘柄がどう動いているかも考慮してアドバイスしてください。`
      }
    } catch (error) {
      console.error("Error fetching Nikkei context:", error)
    }

    // プロンプト構築
    const prompt = `あなたは投資初心者向けのAIコーチです。
以下の保有銘柄について、売買判断と感情コーチングを提供してください。

【銘柄情報】
- 名前: ${stock.name}
- ティッカーコード: ${stock.tickerCode}
- セクター: ${stock.sector || "不明"}
- 保有数量: ${quantity}株
- 平均取得単価: ${averagePrice.toFixed(0)}円
- 現在価格: ${currentPrice ? currentPrice.toLocaleString() : "不明"}円
- 損益: ${profit !== null && profitPercent !== null ? `${profit.toLocaleString()}円 (${profitPercent >= 0 ? "+" : ""}${profitPercent.toFixed(2)}%)` : "不明"}

【財務指標（初心者向け解説）】
${financialMetrics}

【株価データ】
直近30日の終値: ${prices.length}件のデータあり
${newsContext}${marketContext}

【回答形式】
以下のJSON形式で回答してください。JSON以外のテキストは含めないでください。

{
  "shortTerm": "短期予測（今週）の分析結果を初心者に分かりやすく2-3文で",
  "mediumTerm": "中期予測（今月）の分析結果を初心者に分かりやすく2-3文で",
  "longTerm": "長期予測（今後3ヶ月）の分析結果を初心者に分かりやすく2-3文で",
  "suggestedSellPrice": 売却目標価格（数値のみ、円単位、現在価格・平均取得単価・市場分析を総合的に考慮）,
  "suggestedStopLossPrice": 損切りライン価格（数値のみ、円単位、現在価格と平均取得単価を考慮した適切な水準）,
  "sellCondition": "売却の条件や考え方（例：「+10%で半分利確、決算発表後に全売却検討」）",
  "emotionalCoaching": "ユーザーの気持ちに寄り添うメッセージ（下落時は安心感、上昇時は冷静さを促す）",
  "simpleStatus": "現状を一言で表すステータス（好調/様子見/注意/警戒のいずれか）",
  "statusType": "ステータスの種類（good/neutral/caution/warningのいずれか）",

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
  "advice": "初心者向けのアドバイス（100文字以内、優しい言葉で）",
  "confidence": 0.0〜1.0の信頼度
}

【判断の指針】
- 財務指標（会社の規模、配当、株価水準、評価スコア）を分析に活用してください
- 提供されたニュース情報を参考にしてください
- ニュースにない情報は推測や創作をしないでください
- ユーザーの売却目標設定がある場合は、目標への進捗や損切ラインへの接近を考慮してください

【業績に基づく判断の指針】
- 赤字企業の場合は、adviceで必ず「業績が赤字である」ことに言及し、リスクを伝える
- 赤字かつ減益傾向の場合は、買い増しには慎重な姿勢を示す
- 黒字かつ増益傾向の場合は、より前向きな評価ができる

【売買判断の指針】
- shortTerm: 「売り検討」「保持」「買い増し検討」のいずれかの判断を含める
- mediumTerm: 今月の見通しと推奨行動を含める
- longTerm: 今後3ヶ月の成長性と投資継続の判断を含める
- suggestedSellPrice: 現在価格と平均取得単価の両方を考慮し、ユーザーの含み益/含み損の状況に応じた適切な売却目標価格を提案
- suggestedStopLossPrice: 平均取得単価を基準に、現在の含み益/含み損を考慮した適切な損切りラインを提案
- sellCondition: 「○○円で売る」だけでなく「なぜその価格か」「どんな条件で判断すべきか」を含める
- 損切りも重要な選択肢: 損失が大きく、回復の見込みが薄い場合は損切りを提案する

【利確・損切りラインの指針】
- 利確目標（suggestedSellPrice）:
  - 含み益がある場合: 現在の利益を確保しつつ、さらなる上昇余地を考慮した目標価格
  - 含み損がある場合: 平均取得単価への回復を目標とするか、市場分析に基づく現実的な水準
- 損切りライン（suggestedStopLossPrice）:
  - 含み益がある場合: 利益が消えないライン（例：平均取得単価の少し上）
  - 含み損がある場合: これ以上の損失拡大を防ぐライン（例：現在価格から-5%〜-10%）

【損切り提案の指針】
- 損失率が-15%以上かつ業績悪化や株価下落トレンドが続いている場合は、損切りを選択肢として提示
- 損切りは「負け」ではなく「次の投資機会を守る判断」として前向きに伝える
- 例: 「損失を抱えていますが、これ以上悪化する前に売却を検討してもいいかもしれません」
- 例: 「今売ることで、より良い銘柄に資金を回せます」

【感情コーチングの指針】
- 損益が軽微なマイナス（-10%未満）の場合: 「株価は上下するもの」「長期で見れば」など安心感を与える
- 損益が大きなマイナス（-15%以上）の場合: 損切りも選択肢として提示しつつ、決断を後押しする
- 損益がプラスの場合: 「利確も検討しましょう」「欲張りすぎないことも大切」など冷静さを促す
- 横ばいの場合: 「焦らず見守りましょう」など落ち着きを与える

【トレンド変化への対応】
- 提供されたニュース情報に重要な材料（決算発表、業績修正、M&A、不祥事など）がある場合は、必ず判断に反映する
- 直近の株価動向が急変している場合（急騰・急落）は、その原因と今後の見通しを分析する
- 市場全体（日経平均）の動きと比較して、個別銘柄が逆行している場合はその理由を考察する
- トレンド転換の兆候（上昇→下落、下落→上昇）が見られる場合は、早めに注意喚起する

【ステータスの指針】
- 好調（good）: 利益率 +5%以上、または上昇トレンド
- 様子見（neutral）: 利益率 -5%〜+5%、横ばい
- 注意（caution）: 利益率 -5%〜-15%、または下落トレンド
- 警戒（warning）: 利益率 -15%以下、または急落中

【表現の指針】
- 専門用語は使わない（ROE、PER、株価収益率などは使用禁止）
- 「成長性」「安定性」「割安」「割高」のような平易な言葉を使う
- 中学生でも理解できる表現にする
- 損益状況と財務指標を考慮した実践的なアドバイスを含める
`

    // OpenAI API呼び出し
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
              shortTerm: { type: "string" },
              mediumTerm: { type: "string" },
              longTerm: { type: "string" },
              suggestedSellPrice: { type: ["number", "null"] },
              suggestedStopLossPrice: { type: ["number", "null"] },
              sellCondition: { type: ["string", "null"] },
              emotionalCoaching: { type: "string" },
              simpleStatus: { type: "string", enum: ["好調", "様子見", "注意", "警戒"] },
              statusType: { type: "string", enum: ["good", "neutral", "caution", "warning"] },
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
              "shortTerm", "mediumTerm", "longTerm",
              "suggestedSellPrice", "suggestedStopLossPrice", "sellCondition",
              "emotionalCoaching", "simpleStatus", "statusType",
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

    // データベースに保存
    const now = dayjs.utc().toDate()

    const [, createdAnalysis] = await prisma.$transaction([
      // PortfolioStockの更新
      prisma.portfolioStock.update({
        where: { id: portfolioStock.id },
        data: {
          shortTerm: result.shortTerm,
          mediumTerm: result.mediumTerm,
          longTerm: result.longTerm,
          emotionalCoaching: result.emotionalCoaching,
          simpleStatus: result.simpleStatus,
          statusType: result.statusType,
          suggestedSellPrice: result.suggestedSellPrice ? result.suggestedSellPrice : null,
          sellCondition: result.sellCondition || null,
          lastAnalysis: now,
          updatedAt: now,
        },
      }),
      // StockAnalysisの作成
      prisma.stockAnalysis.create({
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
          recommendation: result.recommendation,
          advice: result.advice || result.emotionalCoaching || "",
          confidence: result.confidence || 0.7,
          limitPrice: result.suggestedSellPrice || null,
          stopLossPrice: result.suggestedStopLossPrice || null,
          analyzedAt: now,
        },
      }),
    ])

    // Outcome作成（分析保存成功後）
    // shortTermTrendをOutcomeのpredictionにマッピング
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

    // ジョブを完了に更新
    await prisma.analysisJob.update({
      where: { id: jobId },
      data: {
        status: "completed",
        completedAt: new Date(),
        result: {
          shortTerm: result.shortTerm,
          mediumTerm: result.mediumTerm,
          longTerm: result.longTerm,
          emotionalCoaching: result.emotionalCoaching,
          simpleStatus: result.simpleStatus,
          statusType: result.statusType,
          suggestedSellPrice: result.suggestedSellPrice || null,
          sellCondition: result.sellCondition || null,
          lastAnalysis: now.toISOString(),
          isToday: true,
        },
      },
    })
  } catch (error) {
    console.error(`Error in runPortfolioAnalysis for job ${jobId}:`, error)

    // ジョブを失敗に更新
    await prisma.analysisJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
        completedAt: new Date(),
        error: error instanceof Error ? error.message : "分析の生成に失敗しました",
      },
    })
  }
}

/**
 * 購入判断分析ジョブを実行
 */
export async function runPurchaseRecommendation(
  jobId: string,
  userId: string,
  stockId: string
): Promise<void> {
  try {
    // ジョブをprocessingに更新
    await prisma.analysisJob.update({
      where: { id: jobId },
      data: {
        status: "processing",
        startedAt: new Date(),
      },
    })

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

    if (!stock) {
      throw new Error("銘柄が見つかりません")
    }

    // ユーザー設定を取得
    const userSettings = await prisma.userSettings.findUnique({
      where: { userId },
      select: {
        investmentPeriod: true,
        riskTolerance: true,
        investmentBudget: true,
      },
    })

    // 直近30日の価格データを取得（yfinanceからリアルタイム取得）
    const historicalPrices = await fetchHistoricalPrices(stock.tickerCode, "1m")
    const prices = historicalPrices.slice(-30).reverse() // 新しい順に

    if (prices.length === 0) {
      throw new Error("価格データがありません")
    }

    // 週間変化率の計算（急騰銘柄対策）
    let weekChangeRate: number | null = null
    let weekChangeContext = ""
    if (prices.length >= 5) {
      const latestClose = Number(prices[0].close)
      const weekAgoClose = Number(prices[Math.min(4, prices.length - 1)].close)
      weekChangeRate = ((latestClose - weekAgoClose) / weekAgoClose) * 100

      if (weekChangeRate >= 30) {
        weekChangeContext = `
【警告: 急騰銘柄】
- 週間変化率: +${weekChangeRate.toFixed(1)}%（非常に高い）
- 急騰後は反落リスクが高いため、今買うのは危険な可能性があります
- 「上がりきった銘柄」を避けるため、stayまたはavoidを検討してください`
      } else if (weekChangeRate >= 20) {
        weekChangeContext = `
【注意: 上昇率が高い】
- 週間変化率: +${weekChangeRate.toFixed(1)}%
- すでに上昇している可能性があるため、追加上昇余地を慎重に判断してください`
      } else if (weekChangeRate <= -20) {
        weekChangeContext = `
【注意: 大幅下落】
- 週間変化率: ${weekChangeRate.toFixed(1)}%
- 大幅下落後は反発の可能性もありますが、下落トレンドが続く可能性もあります`
      }
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

    // 前回の購入判断データを取得（一貫性のため）
    const previousRecommendation = await prisma.purchaseRecommendation.findFirst({
      where: { stockId },
      orderBy: { date: "desc" },
    })

    const previousAnalysisContext = previousRecommendation
      ? `
【前回の分析結果】
- 判断: ${previousRecommendation.recommendation === "buy" ? "買い検討" : previousRecommendation.recommendation === "stay" ? "様子見" : "見送り"}
- 理由: ${previousRecommendation.reason}
- 不安な点: ${previousRecommendation.concerns || "なし"}
※ 前回の分析を参考にしつつ、最新の状況に基づいて判断してください。急激な判断変更は避け、一貫性を保ってください。
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
${userContext}${predictionContext}${previousAnalysisContext}
【株価データ】
直近30日の終値: ${prices.length}件のデータあり
${weekChangeContext}${patternContext}${technicalContext}${chartPatternContext}${newsContext}
【回答形式】
以下のJSON形式で回答してください。JSON以外のテキストは含めないでください。

{
  "recommendation": "buy" | "stay" | "avoid",
  "confidence": 0.0から1.0の数値（小数点2桁）,
  "reason": "初心者に分かりやすい言葉で1-2文の理由",
  "caution": "注意点を1-2文",

  // B. 深掘り評価（文字列で返す。配列ではない）
  "positives": "・良い点1\n・良い点2\n・良い点3",
  "concerns": "・不安な点1\n・不安な点2\n・不安な点3",
  "suitableFor": "こんな人におすすめ（1-2文で具体的に）",

  // C. 買い時条件（recommendationがstayの場合のみ）
  "buyCondition": "どうなったら買い時か（例：「株価が○○円を下回ったら」「RSIが30を下回ったら」など具体的に）",

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
- チャートパターンが検出された場合は、reasonで言及する
- positives、concernsは「・項目1\n・項目2」形式の文字列で返す（配列ではない）
- ユーザー設定がない場合、パーソナライズ項目はnullにする
- buyConditionはrecommendationが"stay"の場合のみ具体的な条件を記載し、"buy"や"avoid"の場合はnullにする

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
      max_tokens: 800,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "purchase_recommendation",
          strict: true,
          schema: {
            type: "object",
            properties: {
              recommendation: { type: "string", enum: ["buy", "stay", "avoid"] },
              confidence: { type: "number" },
              reason: { type: "string" },
              caution: { type: "string" },
              // B. 深掘り評価
              positives: { type: ["string", "null"] },
              concerns: { type: ["string", "null"] },
              suitableFor: { type: ["string", "null"] },
              // C. 買い時条件
              buyCondition: { type: ["string", "null"] },
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
    if (weekChangeRate !== null && weekChangeRate >= 30 && result.recommendation === "buy") {
      result.recommendation = "stay"
      result.caution = `週間+${weekChangeRate.toFixed(0)}%の急騰銘柄のため、様子見を推奨します。${result.caution}`
    }

    // データベースに保存（upsert）
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
        // C. 買い時条件
        buyCondition: result.recommendation === "stay" ? (result.buyCondition || null) : null,
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
        // C. 買い時条件
        buyCondition: result.recommendation === "stay" ? (result.buyCondition || null) : null,
        // D. パーソナライズ
        userFitScore: result.userFitScore ?? null,
        budgetFit: result.budgetFit ?? null,
        periodFit: result.periodFit ?? null,
        riskFit: result.riskFit ?? null,
        personalizedReason: result.personalizedReason || null,
      },
    })

    // ジョブを完了に更新
    await prisma.analysisJob.update({
      where: { id: jobId },
      data: {
        status: "completed",
        completedAt: new Date(),
        result: {
          stockId: stock.id,
          stockName: stock.name,
          tickerCode: stock.tickerCode,
          currentPrice,
          recommendation: result.recommendation,
          confidence: result.confidence,
          reason: result.reason,
          caution: result.caution,
          positives: result.positives || null,
          concerns: result.concerns || null,
          suitableFor: result.suitableFor || null,
          buyCondition: result.recommendation === "stay" ? (result.buyCondition || null) : null,
          userFitScore: result.userFitScore ?? null,
          budgetFit: result.budgetFit ?? null,
          periodFit: result.periodFit ?? null,
          riskFit: result.riskFit ?? null,
          personalizedReason: result.personalizedReason || null,
          analyzedAt: today.toISOString(),
        },
      },
    })
  } catch (error) {
    console.error(`Error in runPurchaseRecommendation for job ${jobId}:`, error)

    // ジョブを失敗に更新
    await prisma.analysisJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
        completedAt: new Date(),
        error: error instanceof Error ? error.message : "購入判断の生成に失敗しました",
      },
    })
  }
}

