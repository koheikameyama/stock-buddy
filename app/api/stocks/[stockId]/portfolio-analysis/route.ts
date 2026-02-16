import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import { verifyCronOrSession } from "@/lib/cron-auth"
import { getOpenAIClient } from "@/lib/openai"
import { getRelatedNews, formatNewsForPrompt } from "@/lib/news-rag"
import { fetchHistoricalPrices, fetchStockPrices } from "@/lib/stock-price-fetcher"
import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"

dayjs.extend(utc)
dayjs.extend(timezone)

/**
 * GET /api/stocks/[stockId]/portfolio-analysis
 * 指定された銘柄のポートフォリオ分析を取得
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ stockId: string }> }
) {
  const { stockId } = await params

  try {
    // 認証チェック
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "認証が必要です" },
        { status: 401 }
      )
    }

    const userId = session.user.id

    // ポートフォリオ分析とユーザー設定を取得
    const [portfolioStock, userSettings] = await Promise.all([
      prisma.portfolioStock.findFirst({
        where: {
          userId,
          stockId,
        },
        select: {
          shortTerm: true,
          mediumTerm: true,
          longTerm: true,
          lastAnalysis: true,
          emotionalCoaching: true,
          simpleStatus: true,
          statusType: true,
          suggestedSellPrice: true,
          sellCondition: true,
          transactions: {
            orderBy: { transactionDate: "asc" },
          },
        },
      }),
      prisma.userSettings.findUnique({
        where: { userId },
        select: { stopLossRate: true, targetReturnRate: true },
      }),
    ])

    if (!portfolioStock) {
      return NextResponse.json(
        { error: "この銘柄はポートフォリオに登録されていません" },
        { status: 404 }
      )
    }

    // 買値（平均取得単価）を計算
    let totalBuyCost = 0
    let totalBuyQuantity = 0
    for (const tx of portfolioStock.transactions) {
      if (tx.type === "buy") {
        totalBuyCost += Number(tx.totalAmount)
        totalBuyQuantity += tx.quantity
      }
    }
    const averagePurchasePrice = totalBuyQuantity > 0 ? totalBuyCost / totalBuyQuantity : null

    // 日本時間で今日の00:00:00を取得
    const todayJST = dayjs().tz("Asia/Tokyo").startOf("day")

    // ユーザー設定に基づく計算価格
    const targetReturnRate = userSettings?.targetReturnRate ?? null
    const stopLossRate = userSettings?.stopLossRate ?? null
    let userTargetPrice: number | null = null
    let userStopLossPrice: number | null = null

    if (averagePurchasePrice) {
      if (targetReturnRate !== null) {
        userTargetPrice = Math.round(averagePurchasePrice * (1 + targetReturnRate / 100))
      }
      if (stopLossRate !== null) {
        userStopLossPrice = Math.round(averagePurchasePrice * (1 + stopLossRate / 100))
      }
    }

    // 分析データがない場合
    if (!portfolioStock.lastAnalysis) {
      return NextResponse.json(
        {
          shortTerm: null,
          mediumTerm: null,
          longTerm: null,
          lastAnalysis: null,
          isToday: false,
          emotionalCoaching: null,
          simpleStatus: null,
          statusType: null,
          suggestedSellPrice: null,
          sellCondition: null,
          // 損切りアラート用
          averagePurchasePrice,
          stopLossRate,
          // ユーザー設定に基づく価格
          targetReturnRate,
          userTargetPrice,
          userStopLossPrice,
        },
        { status: 200 }
      )
    }

    // lastAnalysisが日本時間で当日かどうかを判定
    const lastAnalysisJST = dayjs(portfolioStock.lastAnalysis).tz("Asia/Tokyo").startOf("day")
    const isToday = lastAnalysisJST.isSame(todayJST, "day")

    // レスポンス整形
    const response = {
      shortTerm: portfolioStock.shortTerm,
      mediumTerm: portfolioStock.mediumTerm,
      longTerm: portfolioStock.longTerm,
      lastAnalysis: portfolioStock.lastAnalysis.toISOString(),
      isToday,
      emotionalCoaching: portfolioStock.emotionalCoaching,
      simpleStatus: portfolioStock.simpleStatus,
      statusType: portfolioStock.statusType,
      suggestedSellPrice: portfolioStock.suggestedSellPrice ? Number(portfolioStock.suggestedSellPrice) : null,
      sellCondition: portfolioStock.sellCondition,
      // 損切りアラート用
      averagePurchasePrice,
      stopLossRate,
      // ユーザー設定に基づく価格
      targetReturnRate,
      userTargetPrice,
      userStopLossPrice,
    }

    return NextResponse.json(response, { status: 200 })
  } catch (error) {
    console.error("Error fetching portfolio analysis:", error)
    return NextResponse.json(
      { error: "分析の取得に失敗しました" },
      { status: 500 }
    )
  }
}

/**
 * POST /api/stocks/[stockId]/portfolio-analysis
 * ポートフォリオ銘柄の売買分析をオンデマンドで生成
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

  const { stockId } = await params

  // CRON経由の場合はリクエストボディからuserIdを取得
  let userId: string
  if (authResult.isCron) {
    const body = await request.json()
    if (!body.userId) {
      return NextResponse.json({ error: "userId is required for CRON requests" }, { status: 400 })
    }
    userId = body.userId
  } else {
    userId = authResult.userId!
  }

  try {
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
      return NextResponse.json(
        { error: "この銘柄はポートフォリオに登録されていません" },
        { status: 404 }
      )
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

    // 直近30日の価格データを取得（yfinanceからリアルタイム取得）
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

    // PER（株価収益率）
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

    // ROE（自己資本利益率）
    if (stock.roe) {
      const roe = Number(stock.roe) * 100 // 小数点で保存されている場合
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

    // 業績トレンド
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

    // 売上成長率
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

    // EPS（1株当たり利益）
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

        // 1週間の変動率を計算
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
  "simpleStatus": "現状を一言で表すステータス（好調/順調/やや低調/注意/要確認のいずれか）",
  "statusType": "ステータスの種類（excellent/good/neutral/caution/warningのいずれか）",

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
- 決算発表、業績予想、M&A、人事異動など、提供されていない情報を創作しないでください
- 過去の一般知識（例:「○○社は過去に○○した」）は使用しないでください
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

【ステータスの指針】
- 好調（excellent）: 利益率 +10%以上
- 順調（good）: 利益率 0%〜+10%
- やや低調（neutral）: 利益率 -5%〜0%
- 注意（caution）: 利益率 -10%〜-5%
- 要確認（warning）: 利益率 -10%以下

【表現の指針】
- 専門用語は使わない（ROE、PER、株価収益率などは使用禁止）
- 「成長性」「安定性」「割安」「割高」のような平易な言葉を使う
- 中学生でも理解できる表現にする
- 損益状況と財務指標を考慮した実践的なアドバイスを含める
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
              shortTerm: { type: "string" },
              mediumTerm: { type: "string" },
              longTerm: { type: "string" },
              suggestedSellPrice: { type: ["number", "null"] },
              suggestedStopLossPrice: { type: ["number", "null"] },
              sellCondition: { type: ["string", "null"] },
              emotionalCoaching: { type: "string" },
              simpleStatus: { type: "string", enum: ["好調", "順調", "やや低調", "注意", "要確認"] },
              statusType: { type: "string", enum: ["excellent", "good", "neutral", "caution", "warning"] },
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

    // PortfolioStockとStockAnalysisを同時に更新
    await prisma.$transaction([
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
      // StockAnalysisの作成（カード一覧でのrecommendation表示用）
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

    // レスポンス
    return NextResponse.json({
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
    })
  } catch (error) {
    console.error("Error generating portfolio analysis:", error)
    return NextResponse.json(
      { error: "分析の生成に失敗しました" },
      { status: 500 }
    )
  }
}
