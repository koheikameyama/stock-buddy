import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { PrismaClient } from "@prisma/client"
import {
  calculateRSI,
  calculateSMA,
  calculateMACD,
  getTechnicalSignal,
} from "@/lib/technical-indicators"

const prisma = new PrismaClient()

// 予算内の銘柄組み合わせを生成
interface StockWithPrice {
  tickerCode: string
  name: string
  sector: string | null
  currentPrice: number
  beginnerScore: number | null
  growthScore: number | null
  dividendScore: number | null
  stabilityScore: number | null
  liquidityScore: number | null
}

interface StockPortfolio {
  stocks: StockWithPrice[]
  totalCost: number
  avgBeginnerScore: number
  avgGrowthScore: number
  avgStabilityScore: number
}

function generatePortfolioCombinations(
  stocks: StockWithPrice[],
  budget: number,
  targetStockCount: number,
  scoreWeights: { beginner: number; growth: number; stability: number }
): StockPortfolio[] {
  const portfolios: StockPortfolio[] = []
  const maxBudget = budget * 0.9 // 予算の90%まで使用

  // スコアで並び替え
  const sortedStocks = [...stocks].sort((a, b) => {
    const scoreA =
      (a.beginnerScore || 0) * scoreWeights.beginner +
      (a.growthScore || 0) * scoreWeights.growth +
      (a.stabilityScore || 0) * scoreWeights.stability
    const scoreB =
      (b.beginnerScore || 0) * scoreWeights.beginner +
      (b.growthScore || 0) * scoreWeights.growth +
      (b.stabilityScore || 0) * scoreWeights.stability
    return scoreB - scoreA
  })

  // 上位銘柄から組み合わせを生成（貪欲法）
  const topStocks = sortedStocks.slice(0, targetStockCount * 3)

  // 複数の組み合わせを試す
  for (let startIdx = 0; startIdx < Math.min(5, topStocks.length - targetStockCount); startIdx++) {
    const portfolio: StockWithPrice[] = []
    let totalCost = 0

    for (let i = startIdx; i < topStocks.length && portfolio.length < targetStockCount; i++) {
      const stock = topStocks[i]
      const cost = stock.currentPrice * 100

      if (totalCost + cost <= maxBudget) {
        portfolio.push(stock)
        totalCost += cost
      }
    }

    if (portfolio.length >= 2) {
      const avgBeginnerScore =
        portfolio.reduce((sum, s) => sum + (s.beginnerScore || 0), 0) / portfolio.length
      const avgGrowthScore =
        portfolio.reduce((sum, s) => sum + (s.growthScore || 0), 0) / portfolio.length
      const avgStabilityScore =
        portfolio.reduce((sum, s) => sum + (s.stabilityScore || 0), 0) / portfolio.length

      portfolios.push({
        stocks: portfolio,
        totalCost,
        avgBeginnerScore,
        avgGrowthScore,
        avgStabilityScore,
      })
    }
  }

  return portfolios
}

export async function POST(request: NextRequest) {
  try {
    // 認証チェック
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { budget, monthlyAmount, investmentPeriod, riskTolerance } = await request.json()

    // バリデーション
    const budgetNum = parseInt(budget)
    const monthlyNum = parseInt(monthlyAmount || "0")

    if (isNaN(budgetNum) || budgetNum < 0) {
      return NextResponse.json(
        { error: "投資金額を正しく指定してください" },
        { status: 400 }
      )
    }

    if (isNaN(monthlyNum) || monthlyNum < 0) {
      return NextResponse.json(
        { error: "月々の積立金額を正しく入力してください" },
        { status: 400 }
      )
    }

    // ユーザー情報を取得
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        settings: true,
        portfolio: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // ユーザー設定を保存または更新
    // 投資スタイルは保存せず、銘柄提案のみ生成
    // 保存は /api/onboarding/complete で行う

    // DBから実際の銘柄データを取得（最新株価付き）
    const allStocks = await prisma.stock.findMany({
      where: {
        tickerCode: {
          endsWith: ".T",
        },
      },
      include: {
        prices: {
          orderBy: {
            date: "desc",
          },
          take: 30, // 直近30日分
        },
      },
    })

    // 予算内で購入可能な銘柄のみにフィルタリング（最低100株）
    const maxPricePerShare = budgetNum * 0.5 / 100 // 予算の50%を1銘柄に使うと仮定
    let stocks = allStocks.filter(stock => {
      const latestPrice = stock.prices[0]?.close
      if (!latestPrice) return false
      const priceNum = parseFloat(latestPrice.toString())
      // 100株買える価格であること
      return priceNum * 100 <= budgetNum * 0.75
    })

    // 予算に応じてスコアでフィルタリング（優先順位付け）
    if (budgetNum <= 100000) {
      // 10万円以下：初心者スコアが高い銘柄を優先
      stocks = stocks
        .filter(s => s.beginnerScore !== null && s.beginnerScore >= 50)
        .sort((a, b) => (b.beginnerScore || 0) - (a.beginnerScore || 0))
        .slice(0, 30) // 上位30銘柄
    } else if (budgetNum <= 500000) {
      // 50万円以下：初心者スコアと安定性スコアのバランス
      stocks = stocks
        .filter(s => s.beginnerScore !== null || s.stabilityScore !== null)
        .sort((a, b) => {
          const scoreA = ((a.beginnerScore || 0) + (a.stabilityScore || 0)) / 2
          const scoreB = ((b.beginnerScore || 0) + (b.stabilityScore || 0)) / 2
          return scoreB - scoreA
        })
        .slice(0, 50) // 上位50銘柄
    }
    // 50万円以上：全銘柄から選択可能（スコアフィルタなし）

    console.log(`Total stocks: ${allStocks.length}, Affordable stocks (max ${Math.floor(maxPricePerShare)}円/株): ${stocks.length}`)

    // DBから最新の市場ニュースを取得
    const recentNews = await prisma.marketNews.findMany({
      where: {
        publishedAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 過去7日
        },
      },
      orderBy: {
        publishedAt: "desc",
      },
      take: 5, // 最新5件
    })

    const marketNews = recentNews.length > 0
      ? recentNews
          .map(
            (n) =>
              `- [${n.sector || "全般"}/${n.sentiment}] ${n.title}: ${n.content.substring(0, 150)}...`
          )
          .join("\n")
      : ""

    // 株価データがある銘柄のみをフィルタ
    const stocksWithPrice = stocks
      .filter((s) => s.prices.length > 0)
      .map((s) => {
        const latestPrice = s.prices[0]
        const priceHistory = s.prices.slice(0, 30)

        // 価格変動率を計算（過去30日）
        const oldestPrice = priceHistory[priceHistory.length - 1]
        const priceChange =
          oldestPrice
            ? ((Number(latestPrice.close) - Number(oldestPrice.close)) /
                Number(oldestPrice.close)) *
              100
            : 0

        // 平均出来高を計算
        const avgVolume =
          priceHistory.reduce((sum, p) => sum + Number(p.volume), 0) /
          priceHistory.length

        // 技術指標を計算
        const priceData = priceHistory.map((p) => ({
          close: Number(p.close),
          high: Number(p.high),
          low: Number(p.low),
        }))

        const rsi = calculateRSI(priceData)
        const sma25 = calculateSMA(priceData, 25)
        const macd = calculateMACD(priceData)
        const technicalSignal = getTechnicalSignal(priceData)

        return {
          tickerCode: s.tickerCode.replace(".T", ""),
          name: s.name,
          sector: s.sector,
          currentPrice: Number(latestPrice.close),
          priceChange30d: Math.round(priceChange * 100) / 100,
          avgVolume: Math.round(avgVolume),
          // 技術指標を追加
          rsi: rsi,
          sma25: sma25,
          macd: macd.macd,
          macdSignal: macd.signal,
          technicalSignal: technicalSignal.signal,
          technicalStrength: technicalSignal.strength,
          technicalReasons: technicalSignal.reasons,
          // スコア情報を追加
          beginnerScore: s.beginnerScore,
          growthScore: s.growthScore,
          dividendScore: s.dividendScore,
          stabilityScore: s.stabilityScore,
          liquidityScore: s.liquidityScore,
        }
      })

    // 3つのプラン用の銘柄組み合わせを生成
    const stocksForPortfolio: StockWithPrice[] = stocksWithPrice.map(s => ({
      tickerCode: s.tickerCode,
      name: s.name,
      sector: s.sector,
      currentPrice: s.currentPrice,
      beginnerScore: s.beginnerScore,
      growthScore: s.growthScore,
      dividendScore: s.dividendScore,
      stabilityScore: s.stabilityScore,
      liquidityScore: s.liquidityScore,
    }))

    // 目標銘柄数を決定
    const targetStockCount = budgetNum <= 100000 ? 3 : budgetNum <= 500000 ? 4 : 5

    // 保守的プラン: 初心者スコアと安定性重視
    const conservativePortfolios = generatePortfolioCombinations(
      stocksForPortfolio,
      budgetNum,
      targetStockCount,
      { beginner: 0.5, growth: 0.1, stability: 0.4 }
    )

    // バランスプラン: 全スコアバランス
    const balancedPortfolios = generatePortfolioCombinations(
      stocksForPortfolio,
      budgetNum,
      targetStockCount,
      { beginner: 0.3, growth: 0.4, stability: 0.3 }
    )

    // 積極的プラン: 成長性重視
    const aggressivePortfolios = generatePortfolioCombinations(
      stocksForPortfolio,
      budgetNum,
      targetStockCount,
      { beginner: 0.1, growth: 0.7, stability: 0.2 }
    )

    console.log(`Generated portfolios - Conservative: ${conservativePortfolios.length}, Balanced: ${balancedPortfolios.length}, Aggressive: ${aggressivePortfolios.length}`)

    if (conservativePortfolios.length === 0 || balancedPortfolios.length === 0 || aggressivePortfolios.length === 0) {
      return NextResponse.json(
        { error: "予算内で適切なポートフォリオを作成できませんでした。予算を増やすか、条件を変更してください。" },
        { status: 400 }
      )
    }

    // 最良の組み合わせを選択
    const conservativePortfolio = conservativePortfolios[0]
    const balancedPortfolio = balancedPortfolios[0]
    const aggressivePortfolio = aggressivePortfolios[0]

    // AIに実データを渡して提案
    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `あなたは日本株の投資アドバイザーです。

**重要: 各プラン用に予算内で購入可能な銘柄セットが既に用意されています**
- 保守的プラン用の銘柄セット
- バランスプラン用の銘柄セット
- 積極的プラン用の銘柄セット

**あなたの役割**:
提供された各銘柄セットについて、以下を説明してください：
1. 各銘柄の推奨理由（100文字程度）
2. 各銘柄の将来性・見通し（100文字程度）
3. 各銘柄のリスク要因（80文字程度）
4. プラン全体の戦略説明（150文字程度）

**重要な制約**:
- **提供された銘柄セットをそのまま使用してください（変更・追加・削除禁止）**
- **quantityは必ず100（固定）**
- **recommendedPriceは提供されたcurrentPriceをそのまま使用**

必ず以下の形式でJSONを返してください：
{
  "plans": [
    {
      "type": "conservative",
      "name": "保守的プラン",
      "description": "安定性を最優先。大型株中心で値動きが穏やか",
      "expectedReturn": "年5-8%程度",
      "riskLevel": "低",
      "strategy": "このプラン全体の戦略を150文字程度で説明",
      "stocks": [
        {
          "tickerCode": "7203",
          "name": "トヨタ自動車",
          "recommendedPrice": 3347,
          "quantity": 100,
          "reason": "推奨理由を100文字程度で",
          "futureOutlook": "将来性を100文字程度で",
          "risks": "リスクを80文字程度で"
        }
      ]
    },
    {
      "type": "balanced",
      "name": "バランスプラン",
      "description": "成長性と安定性のバランス",
      "expectedReturn": "年10-15%程度",
      "riskLevel": "中",
      "strategy": "戦略説明",
      "stocks": [...]
    },
    {
      "type": "aggressive",
      "name": "積極的プラン",
      "description": "高成長を狙う攻めの姿勢",
      "expectedReturn": "年15-25%程度",
      "riskLevel": "高",
      "strategy": "戦略説明",
      "stocks": [...]
    }
  ]
}`,
          },
          {
            role: "user",
            content: `以下の3つの銘柄セットについて、推奨理由・将来性・リスクを説明してください。

【ユーザーの投資スタイル】
- 予算: ${budget}円
- 投資期間: ${investmentPeriod}
- リスク許容度: ${riskTolerance}

${marketNews ? `【市場の最新動向】\n${marketNews}\n\n` : ""}【保守的プラン用の銘柄セット】
合計金額: ${conservativePortfolio.totalCost.toLocaleString()}円
${JSON.stringify(conservativePortfolio.stocks.map(s => ({
  tickerCode: s.tickerCode,
  name: s.name,
  sector: s.sector,
  currentPrice: s.currentPrice,
  beginnerScore: s.beginnerScore,
  stabilityScore: s.stabilityScore,
})), null, 2)}

【バランスプラン用の銘柄セット】
合計金額: ${balancedPortfolio.totalCost.toLocaleString()}円
${JSON.stringify(balancedPortfolio.stocks.map(s => ({
  tickerCode: s.tickerCode,
  name: s.name,
  sector: s.sector,
  currentPrice: s.currentPrice,
  beginnerScore: s.beginnerScore,
  growthScore: s.growthScore,
})), null, 2)}

【積極的プラン用の銘柄セット】
合計金額: ${aggressivePortfolio.totalCost.toLocaleString()}円
${JSON.stringify(aggressivePortfolio.stocks.map(s => ({
  tickerCode: s.tickerCode,
  name: s.name,
  sector: s.sector,
  currentPrice: s.currentPrice,
  growthScore: s.growthScore,
  liquidityScore: s.liquidityScore,
})), null, 2)}

**重要**: 上記の銘柄セットをそのまま使用し、各銘柄について「推奨理由」「将来性」「リスク要因」を説明してください。
各銘柄は100株ずつ購入します。${marketNews ? "市場動向も考慮してください。" : ""}`,
          },
        ],
        temperature: 0.7,
      }),
    })

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text()
      console.error("OpenAI API error:", errorText)
      throw new Error("OpenAI API request failed")
    }

    const openaiData = await openaiResponse.json()
    const response = JSON.parse(openaiData.choices[0].message.content)

    // 3つのプランを検証
    console.log(`Budget: ${budgetNum}`)
    console.log(`Generated ${response.plans.length} plans`)

    response.plans.forEach((plan: any) => {
      // quantityを100に統一（AIが守らない場合のフェイルセーフ）
      plan.stocks = plan.stocks.map((stock: any) => ({
        ...stock,
        quantity: 100,
      }))

      const totalInvestment = plan.stocks.reduce(
        (sum: number, stock: any) => sum + stock.recommendedPrice * 100,
        0
      )

      console.log(`\n${plan.name}:`)
      console.log(`- ${plan.stocks.length} stocks`)
      console.log(`- Total: ${totalInvestment}円 (${Math.round(totalInvestment / budgetNum * 100)}% of budget)`)
      plan.stocks.forEach((stock: any) => {
        console.log(`  - ${stock.tickerCode}: ${stock.recommendedPrice}円 × 100株`)
      })
    })

    // 提案はすぐに保存せず、フロントエンドに返すだけ
    // 保存は /api/onboarding/complete で行う
    return NextResponse.json({
      success: true,
      plans: response.plans,
    })
  } catch (error) {
    console.error("Error in onboarding:", error)

    // エラーの詳細をログに出力
    let errorMessage = "銘柄の提案に失敗しました"

    if (error instanceof Error) {
      // Prismaのデータベース接続エラー
      if (error.message.includes("Can't reach database")) {
        errorMessage = "データベースに接続できませんでした。しばらく待ってから再度お試しください。"
      }
      // OpenAI APIエラー
      else if (error.message.includes("OpenAI")) {
        errorMessage = "AI分析サービスでエラーが発生しました。もう一度お試しください。"
      }
      // その他のエラーはメッセージをそのまま使用
      else if (error.message) {
        errorMessage = error.message
      }
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}
