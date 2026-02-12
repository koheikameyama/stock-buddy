import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import { OpenAI } from "openai"
import { getRelatedNews, formatNewsForPrompt } from "@/lib/news-rag"
import { fetchHistoricalPrices, fetchStockPrices } from "@/lib/stock-price-fetcher"
import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"

dayjs.extend(utc)
dayjs.extend(timezone)

function getOpenAIClient() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })
}

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

    // ポートフォリオ分析を取得
    const portfolioStock = await prisma.portfolioStock.findFirst({
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
      },
    })

    if (!portfolioStock) {
      return NextResponse.json(
        { error: "この銘柄はポートフォリオに登録されていません" },
        { status: 404 }
      )
    }

    // 日本時間で今日の00:00:00を取得
    const todayJST = dayjs().tz("Asia/Tokyo").startOf("day")

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
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user.id
  const { stockId } = await params

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
        metrics.push("- 株価水準: 割安（資産価値より安い）")
      } else if (pbr < 1.5) {
        metrics.push("- 株価水準: 適正")
      } else {
        metrics.push("- 株価水準: やや割高")
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
- 購入時単価: ${averagePrice.toFixed(0)}円
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
  "suggestedSellPrice": 具体的な売却目標価格（数値のみ、円単位）,
  "sellCondition": "売却の条件や考え方（例：「+10%で半分利確、決算発表後に全売却検討」）",
  "emotionalCoaching": "ユーザーの気持ちに寄り添うメッセージ（下落時は安心感、上昇時は冷静さを促す）",
  "simpleStatus": "現状を一言で表すステータス（好調/順調/様子見/注意/要確認のいずれか）",
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
- ユーザーの売却目標設定がある場合は、目標への進捗や損切ラインへの接近を考慮してください

【売買判断の指針】
- shortTerm: 「売り時」「保持」「買い増し時」のいずれかの判断を含める
- mediumTerm: 今月の見通しと推奨行動を含める
- longTerm: 今後3ヶ月の成長性と投資継続の判断を含める
- suggestedSellPrice: 現在の株価、財務指標、損益状況を考慮した具体的な売却目標価格を提案
- sellCondition: 「○○円で売る」だけでなく「なぜその価格か」「どんな条件で判断すべきか」を含める

【感情コーチングの指針】
- 損益がマイナスの場合: 「株価は上下するもの」「長期で見れば」など安心感を与える
- 損益がプラスの場合: 「利確も検討しましょう」「欲張りすぎないことも大切」など冷静さを促す
- 横ばいの場合: 「焦らず見守りましょう」など落ち着きを与える

【ステータスの指針】
- 好調（excellent）: 利益率 +10%以上
- 順調（good）: 利益率 0%〜+10%
- 様子見（neutral）: 利益率 -5%〜0%
- 注意（caution）: 利益率 -10%〜-5%
- 要確認（warning）: 利益率 -10%以下

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
          content: "You are a helpful investment coach for beginners. Always respond in JSON format.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 600,
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
    const requiredFields = ["shortTerm", "mediumTerm", "longTerm", "emotionalCoaching", "simpleStatus", "statusType", "recommendation"]
    for (const field of requiredFields) {
      if (!result[field]) {
        throw new Error(`Missing required field: ${field}`)
      }
    }

    // recommendationのバリデーション
    if (!["buy", "hold", "sell"].includes(result.recommendation)) {
      result.recommendation = "hold" // デフォルト値
    }

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
