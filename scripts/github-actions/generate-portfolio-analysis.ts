#!/usr/bin/env npx tsx
/**
 * ポートフォリオ分析を生成するスクリプト
 *
 * 保有銘柄（PortfolioStock）に対して、毎日AI分析を行い売買判断を生成します。
 * - 短期予測（shortTerm）: 今週の売買判断
 * - 中期予測（mediumTerm）: 今月の売買判断
 * - 長期予測（longTerm）: 今後3ヶ月の売買判断
 */

import { PrismaClient, Prisma } from "@prisma/client"
import OpenAI from "openai"
import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import { getRelatedNews, formatNewsForPrompt } from "../lib/news-fetcher"
import { fetchHistoricalPrices } from "../../lib/stock-price-fetcher"

dayjs.extend(utc)

const prisma = new PrismaClient()
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// 時間帯コンテキスト
const TIME_CONTEXT = process.env.TIME_CONTEXT || "morning"

// 時間帯別のプロンプト設定
const TIME_CONTEXT_PROMPTS: Record<
  string,
  { intro: string; shortTerm: string; mediumTerm: string; longTerm: string }
> = {
  morning: {
    intro: "今日の取引開始前の分析です。",
    shortTerm: "今日の見通しとチェックポイントを初心者に分かりやすく2-3文で",
    mediumTerm: "今週の注目ポイントと目標を初心者に分かりやすく2-3文で",
    longTerm: "今後の成長シナリオを初心者に分かりやすく2-3文で",
  },
  noon: {
    intro: "前場の取引を踏まえた分析です。",
    shortTerm: "前場の動きを踏まえた後場の注目点を初心者に分かりやすく2-3文で",
    mediumTerm: "今日の値動きを踏まえた今週の見通しを初心者に分かりやすく2-3文で",
    longTerm: "今後の成長シナリオを初心者に分かりやすく2-3文で",
  },
  close: {
    intro: "本日の取引終了後の振り返りです。",
    shortTerm: "本日のまとめと明日への展望を初心者に分かりやすく2-3文で",
    mediumTerm: "今週の残りの見通しを初心者に分かりやすく2-3文で",
    longTerm: "今後の成長シナリオと来週以降の展望を初心者に分かりやすく2-3文で",
  },
}

interface PriceData {
  date: string
  close: number
  volume: number
}

interface PortfolioStockWithDetails {
  id: string
  userId: string
  stockId: string
  suggestedSellPrice: Prisma.Decimal | null
  stock: {
    tickerCode: string
    name: string
    sector: string | null
    marketCap: Prisma.Decimal | null
    dividendYield: Prisma.Decimal | null
    pbr: Prisma.Decimal | null
    per: Prisma.Decimal | null
    roe: Prisma.Decimal | null
    fiftyTwoWeekHigh: Prisma.Decimal | null
    fiftyTwoWeekLow: Prisma.Decimal | null
    beginnerScore: number | null
    growthScore: number | null
    dividendScore: number | null
    stabilityScore: number | null
  }
  transactions: {
    type: string
    quantity: number
    totalAmount: Prisma.Decimal
    transactionDate: Date
  }[]
}

async function getRecentPrices(tickerCode: string): Promise<PriceData[]> {
  try {
    // Stooq APIから1ヶ月分のデータを取得
    const historicalData = await fetchHistoricalPrices(tickerCode, "1m")

    if (!historicalData || historicalData.length === 0) {
      return []
    }

    const prices: PriceData[] = historicalData.map((d) => ({
      date: d.date,
      close: d.close,
      volume: d.volume,
    }))

    // 新しい順にソート
    return prices.sort((a, b) => b.date.localeCompare(a.date))
  } catch (error) {
    console.log(`Error fetching prices for ${tickerCode}: ${error}`)
    return []
  }
}

function calculateProfitLoss(
  averagePrice: number,
  currentPrice: number | null,
  quantity: number
): { profit: number | null; profitPercent: number | null } {
  if (!currentPrice || !averagePrice) {
    return { profit: null, profitPercent: null }
  }

  const totalCost = averagePrice * quantity
  const currentValue = currentPrice * quantity
  const profit = currentValue - totalCost
  const profitPercent = totalCost > 0 ? (profit / totalCost) * 100 : 0

  return { profit, profitPercent }
}

function formatFinancialMetrics(
  stock: PortfolioStockWithDetails["stock"],
  currentPrice: number | null
): string {
  const metrics: string[] = []

  // 時価総額
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

  // 配当利回り
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

  // 割安/割高判断（PBR）
  if (stock.pbr) {
    const pbr = Number(stock.pbr)
    if (pbr < 1) {
      metrics.push(`- 株価水準: 割安（資産価値より安い）`)
    } else if (pbr < 1.5) {
      metrics.push(`- 株価水準: 適正`)
    } else {
      metrics.push(`- 株価水準: やや割高`)
    }
  }

  // 52週高値/安値との比較
  if (stock.fiftyTwoWeekHigh && stock.fiftyTwoWeekLow && currentPrice) {
    const high = Number(stock.fiftyTwoWeekHigh)
    const low = Number(stock.fiftyTwoWeekLow)
    const position = high !== low ? ((currentPrice - low) / (high - low)) * 100 : 50
    metrics.push(
      `- 1年間の値動き: 高値${high.toFixed(0)}円〜安値${low.toFixed(0)}円（現在は${position.toFixed(0)}%の位置）`
    )
  }

  // スコア
  const scores: string[] = []
  if (stock.beginnerScore) scores.push(`初心者向け${stock.beginnerScore}点`)
  if (stock.growthScore) scores.push(`成長性${stock.growthScore}点`)
  if (stock.stabilityScore) scores.push(`安定性${stock.stabilityScore}点`)
  if (stock.dividendScore) scores.push(`配当${stock.dividendScore}点`)
  if (scores.length > 0) {
    metrics.push(`- 評価スコア（100点満点）: ${scores.join(", ")}`)
  }

  return metrics.length > 0 ? metrics.join("\n") : "財務データなし"
}

interface AnalysisResult {
  shortTerm: string
  mediumTerm: string
  longTerm: string
  emotionalCoaching: string
  simpleStatus: string
  statusType: string
  suggestedSellPrice: number | null
  sellCondition: string | null
}

async function generatePortfolioAnalysis(
  stock: PortfolioStockWithDetails,
  quantity: number,
  averagePrice: number,
  recentPrices: PriceData[],
  currentPrice: number | null,
  relatedNews: Awaited<ReturnType<typeof getRelatedNews>>,
  investmentStyle: string | null
): Promise<AnalysisResult | null> {
  const prompts = TIME_CONTEXT_PROMPTS[TIME_CONTEXT] || TIME_CONTEXT_PROMPTS.morning

  const styleContext = investmentStyle
    ? `

【ユーザーの投資スタイル】
${investmentStyle}
※ ユーザーの投資スタイルに合わせたアドバイスをしてください。`
    : ""

  const { profit, profitPercent } = calculateProfitLoss(averagePrice, currentPrice, quantity)
  const financialMetrics = formatFinancialMetrics(stock.stock, currentPrice)

  // AI提案の売却価格情報
  let targetInfo = ""
  if (stock.suggestedSellPrice) {
    const sellPrice = Number(stock.suggestedSellPrice)
    let progress = 0
    if (currentPrice && averagePrice && sellPrice > averagePrice) {
      progress = ((currentPrice - averagePrice) / (sellPrice - averagePrice)) * 100
      progress = Math.max(0, Math.min(100, progress))
    }
    targetInfo = `

【AI提案の売却目標】
- 提案売却価格: ${sellPrice.toLocaleString()}円（達成度: ${progress.toFixed(0)}%）
※ AIが分析した売却目標です。この目標に対する進捗も考慮してアドバイスしてください。`
  }

  const newsContext =
    relatedNews.length > 0
      ? `

【最新のニュース情報】
${formatNewsForPrompt(relatedNews)}
`
      : ""

  const profitLabel =
    profit !== null && profitPercent !== null
      ? `${profit.toLocaleString()}円 (${profitPercent >= 0 ? "+" : ""}${profitPercent.toFixed(2)}%)`
      : "不明"

  const prompt = `あなたは投資初心者向けのAIコーチです。
${prompts.intro}
以下の保有銘柄について、売買判断と感情コーチングを提供してください。

【銘柄情報】
- 名前: ${stock.stock.name}
- ティッカーコード: ${stock.stock.tickerCode}
- セクター: ${stock.stock.sector || "不明"}
- 保有数量: ${quantity}株
- 購入時単価: ${averagePrice}円
- 現在価格: ${currentPrice || "不明"}円
- 損益: ${profitLabel}${targetInfo}${styleContext}

【財務指標（初心者向け解説）】
${financialMetrics}

【株価データ】
直近30日の終値: ${recentPrices.length}件のデータあり
${newsContext}
【回答形式】
以下のJSON形式で回答してください。JSON以外のテキストは含めないでください。

{
  "shortTerm": "${prompts.shortTerm}（ニュース情報があれば参考にする）",
  "mediumTerm": "${prompts.mediumTerm}（ニュース情報があれば参考にする）",
  "longTerm": "${prompts.longTerm}（ニュース情報があれば参考にする）",
  "emotionalCoaching": "ユーザーの気持ちに寄り添うメッセージ（下落時は安心感、上昇時は冷静さを促す）",
  "simpleStatus": "現状を一言で表すステータス（好調/順調/様子見/注意/要確認のいずれか）",
  "statusType": "ステータスの種類（excellent/good/neutral/caution/warningのいずれか）",
  "suggestedSellPrice": "具体的な売却目標価格（数値のみ、円単位）",
  "sellCondition": "売却の条件や考え方（例：「+10%で半分利確、決算発表後に全売却検討」）"
}

【判断の指針】
- 財務指標（会社の規模、配当、株価水準、評価スコア）を分析に活用してください
- 提供されたニュース情報を参考にしてください
- ニュースにない情報は推測や創作をしないでください
- ユーザーの売却目標設定がある場合は、目標への進捗や損切ラインへの接近を考慮してください
- shortTerm: 「売り時」「保持」「買い増し時」のいずれかの判断を含める
- mediumTerm: 今月の見通しと推奨行動を含める
- longTerm: 今後3ヶ月の成長性と投資継続の判断を含める
- suggestedSellPrice: 現在の株価、財務指標、損益状況を考慮した具体的な売却目標価格を提案
- sellCondition: 「○○円で売る」だけでなく「なぜその価格か」「どんな条件で判断すべきか」を含める
- 専門用語は使わない（ROE、PER、株価収益率などは使用禁止）
- 「成長性」「安定性」「割安」「割高」のような平易な言葉を使う
- 中学生でも理解できる表現にする
- 損益状況と財務指標を考慮した実践的なアドバイスを含める

【感情コーチングの指針】
- 損益がマイナスの場合: 「株価は上下するもの」「長期で見れば」など安心感を与える
- 損益がプラスの場合: 「利確も検討しましょう」「欲張りすぎないことも大切」など冷静さを促す
- 横ばいの場合: 「焦らず見守りましょう」など落ち着きを与える

【ステータスの指針】
- 好調（excellent）: 利益率 +10%以上
- 順調（good）: 利益率 0%〜+10%
- 様子見（neutral）: 利益率 -5%〜0%
- 注意（caution）: 利益率 -10%〜-5%
- 要確認（warning）: 利益率 -10%以下`

  try {
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

    let content = response.choices[0].message.content?.trim() || ""

    // マークダウンコードブロックを削除
    if (content.startsWith("```json")) content = content.slice(7)
    else if (content.startsWith("```")) content = content.slice(3)
    if (content.endsWith("```")) content = content.slice(0, -3)
    content = content.trim()

    const result = JSON.parse(content) as AnalysisResult

    // バリデーション
    const requiredFields = ["shortTerm", "mediumTerm", "longTerm", "emotionalCoaching", "simpleStatus", "statusType"]
    for (const field of requiredFields) {
      if (!(field in result)) {
        throw new Error(`Missing required field: ${field}`)
      }
    }

    // suggestedSellPriceを数値に変換
    if (result.suggestedSellPrice) {
      try {
        result.suggestedSellPrice = parseFloat(String(result.suggestedSellPrice).replace(",", ""))
      } catch {
        result.suggestedSellPrice = null
      }
    }

    return result
  } catch (error) {
    console.log(`Error generating portfolio analysis: ${error}`)
    return null
  }
}

function formatInvestmentStyle(
  settings: { investmentPeriod: string | null; riskTolerance: string | null } | null
): string | null {
  if (!settings) return null

  const periodLabel: Record<string, string> = {
    short: "短期（1年以内）",
    medium: "中期（1〜3年）",
    long: "長期（3年以上）",
  }

  const riskLabel: Record<string, string> = {
    low: "低い（安定重視）",
    medium: "普通（バランス）",
    high: "高い（成長重視）",
  }

  const lines: string[] = []
  if (settings.investmentPeriod && periodLabel[settings.investmentPeriod]) {
    lines.push(`- 投資期間: ${periodLabel[settings.investmentPeriod]}`)
  }
  if (settings.riskTolerance && riskLabel[settings.riskTolerance]) {
    lines.push(`- リスク許容度: ${riskLabel[settings.riskTolerance]}`)
  }

  return lines.length > 0 ? lines.join("\n") : null
}

async function main(): Promise<void> {
  console.log("=== Starting Portfolio Analysis Generation ===")
  console.log(`Time: ${new Date().toISOString()}`)
  console.log(`Time context: ${TIME_CONTEXT}`)

  if (!process.env.OPENAI_API_KEY) {
    console.error("Error: OPENAI_API_KEY environment variable not set")
    process.exit(1)
  }

  try {
    // ポートフォリオ取得
    const portfolioStocks = await prisma.portfolioStock.findMany({
      include: {
        stock: true,
        transactions: {
          select: {
            type: true,
            quantity: true,
            totalAmount: true,
            transactionDate: true,
          },
        },
      },
    })
    console.log(`Found ${portfolioStocks.length} stocks in portfolio`)

    if (portfolioStocks.length === 0) {
      console.log("No stocks in portfolio. Exiting.")
      return
    }

    // 関連ニュースを一括取得
    const tickerCodes = portfolioStocks.map((ps) => ps.stock.tickerCode)
    const sectors = Array.from(new Set(portfolioStocks.map((ps) => ps.stock.sector).filter((s): s is string => !!s)))

    console.log(`Fetching related news for ${tickerCodes.length} stocks...`)
    const allNews = await getRelatedNews(prisma, tickerCodes, sectors, 20, 7)
    console.log(`Found ${allNews.length} related news articles`)

    let successCount = 0
    let errorCount = 0

    // ユーザーの投資スタイルをキャッシュ
    const userStyles = new Map<string, string | null>()

    for (const ps of portfolioStocks) {
      const stock = ps.stock
      console.log(`\n--- Processing: ${stock.name} (${stock.tickerCode}) ---`)

      // Transactionから数量と平均取得単価を計算
      let quantity = 0
      let totalBuyCost = 0
      let totalBuyQuantity = 0

      for (const t of ps.transactions) {
        if (t.type === "buy") {
          quantity += t.quantity
          totalBuyCost += Number(t.totalAmount)
          totalBuyQuantity += t.quantity
        } else {
          quantity -= t.quantity
        }
      }

      const averagePrice = totalBuyQuantity > 0 ? totalBuyCost / totalBuyQuantity : 0

      // 保有数量が0以下の場合はスキップ（売却済み）
      if (quantity <= 0) {
        console.log(`Skipping: No holdings (quantity: ${quantity})`)
        continue
      }

      // ユーザーの投資スタイルを取得（キャッシュ）
      let investmentStyle = userStyles.get(ps.userId)
      if (investmentStyle === undefined) {
        const settings = await prisma.userSettings.findUnique({
          where: { userId: ps.userId },
          select: { investmentPeriod: true, riskTolerance: true },
        })
        investmentStyle = formatInvestmentStyle(settings)
        userStyles.set(ps.userId, investmentStyle)
      }

      // この銘柄に関連するニュースをフィルタリング
      const stockNews = allNews
        .filter(
          (n) =>
            n.content.includes(stock.tickerCode) ||
            n.content.includes(stock.tickerCode.replace(".T", "")) ||
            n.sector === stock.sector
        )
        .slice(0, 5)

      console.log(`Found ${stockNews.length} news for this stock`)

      // 直近価格取得
      const recentPrices = await getRecentPrices(stock.tickerCode)
      const currentPrice = recentPrices.length > 0 ? recentPrices[0].close : null

      if (currentPrice) {
        console.log(`Current price: ${currentPrice.toLocaleString()}円`)
      } else {
        console.log("No price data available")
      }

      // ポートフォリオ分析生成
      const analysis = await generatePortfolioAnalysis(
        ps as PortfolioStockWithDetails,
        quantity,
        averagePrice,
        recentPrices,
        currentPrice,
        stockNews,
        investmentStyle
      )

      if (!analysis) {
        console.log(`Failed to generate analysis for ${stock.name}`)
        errorCount++
        continue
      }

      console.log(`Generated analysis:`)
      console.log(`Short-term: ${analysis.shortTerm.slice(0, 50)}...`)
      console.log(`Medium-term: ${analysis.mediumTerm.slice(0, 50)}...`)
      console.log(`Long-term: ${analysis.longTerm.slice(0, 50)}...`)
      console.log(`Status: ${analysis.simpleStatus} (${analysis.statusType})`)
      console.log(`Emotional coaching: ${analysis.emotionalCoaching.slice(0, 50)}...`)

      // データベース保存
      await prisma.portfolioStock.update({
        where: { id: ps.id },
        data: {
          lastAnalysis: new Date(),
          shortTerm: analysis.shortTerm,
          mediumTerm: analysis.mediumTerm,
          longTerm: analysis.longTerm,
          emotionalCoaching: analysis.emotionalCoaching,
          simpleStatus: analysis.simpleStatus,
          statusType: analysis.statusType,
          suggestedSellPrice: analysis.suggestedSellPrice,
          sellCondition: analysis.sellCondition,
        },
      })

      console.log(`Saved portfolio analysis for stock ${ps.id}`)
      successCount++
    }

    console.log(`\n=== Summary ===`)
    console.log(`Total stocks processed: ${portfolioStocks.length}`)
    console.log(`Success: ${successCount}`)
    console.log(`Errors: ${errorCount}`)

    if (errorCount > 0 && successCount === 0) {
      process.exit(1)
    }
  } catch (error) {
    console.error(`Error: ${error}`)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()

export {}
