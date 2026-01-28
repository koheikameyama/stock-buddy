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

// 候補銘柄の型定義
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

    // 3つのプラン用の候補銘柄を生成（AIが選択しやすいように）
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

    // 各プラン用に候補銘柄を絞る（予算内で購入可能な銘柄のみ）
    const conservativeCandidates = stocksForPortfolio
      .filter(s => s.currentPrice * 100 <= budgetNum * 0.4) // 予算の40%以内
      .sort((a, b) => {
        const scoreA = (a.beginnerScore || 0) * 0.5 + (a.stabilityScore || 0) * 0.4 + (a.growthScore || 0) * 0.1
        const scoreB = (b.beginnerScore || 0) * 0.5 + (b.stabilityScore || 0) * 0.4 + (b.growthScore || 0) * 0.1
        return scoreB - scoreA
      })
      .slice(0, 12) // 上位12銘柄をAIに渡す

    const balancedCandidates = stocksForPortfolio
      .filter(s => s.currentPrice * 100 <= budgetNum * 0.35)
      .sort((a, b) => {
        const scoreA = (a.beginnerScore || 0) * 0.3 + (a.growthScore || 0) * 0.4 + (a.stabilityScore || 0) * 0.3
        const scoreB = (b.beginnerScore || 0) * 0.3 + (b.growthScore || 0) * 0.4 + (b.stabilityScore || 0) * 0.3
        return scoreB - scoreA
      })
      .slice(0, 12)

    const aggressiveCandidates = stocksForPortfolio
      .filter(s => s.currentPrice * 100 <= budgetNum * 0.35)
      .sort((a, b) => {
        const scoreA = (a.beginnerScore || 0) * 0.1 + (a.growthScore || 0) * 0.7 + (a.stabilityScore || 0) * 0.2
        const scoreB = (b.beginnerScore || 0) * 0.1 + (b.growthScore || 0) * 0.7 + (b.stabilityScore || 0) * 0.2
        return scoreB - scoreA
      })
      .slice(0, 12)

    console.log(`Candidate stocks - Conservative: ${conservativeCandidates.length}, Balanced: ${balancedCandidates.length}, Aggressive: ${aggressiveCandidates.length}`)

    if (conservativeCandidates.length < targetStockCount || balancedCandidates.length < targetStockCount || aggressiveCandidates.length < targetStockCount) {
      return NextResponse.json(
        { error: "予算内で適切なポートフォリオを作成できませんでした。予算を増やすか、条件を変更してください。" },
        { status: 400 }
      )
    }

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

**あなたの役割**:
各プラン用に提供された候補銘柄リストから、最適な銘柄を選択してポートフォリオを構成してください。

**重要な選択基準**:
1. **セクター分散**: 同じセクターから最大2銘柄まで。最低2セクター以上
2. **予算遵守**: 選択した銘柄の合計金額が予算の90%以内
3. **各銘柄100株ずつ購入**: quantityは必ず100

**保守的プラン**:
- ${targetStockCount}銘柄を選択
- 初心者スコアと安定性スコアが高い銘柄を優先
- セクター分散を重視

**バランスプラン**:
- ${targetStockCount}銘柄を選択
- 成長性と安定性のバランス
- セクター分散を重視

**積極的プラン**:
- ${targetStockCount}銘柄を選択
- 成長性スコアが高い銘柄を優先
- セクター分散を重視

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
            content: `以下の候補銘柄リストから最適な銘柄を選択し、3つのプランを作成してください。

【ユーザーの投資スタイル】
- 予算: ${budget}円（選択した銘柄の合計金額が予算の90%以内になるようにしてください）
- 投資期間: ${investmentPeriod}
- リスク許容度: ${riskTolerance}

${marketNews ? `【市場の最新動向】\n${marketNews}\n\n` : ""}【保守的プラン用の候補銘柄】（この中から${targetStockCount}銘柄を選択）
${JSON.stringify(conservativeCandidates.map(s => ({
  tickerCode: s.tickerCode,
  name: s.name,
  sector: s.sector,
  currentPrice: s.currentPrice,
  cost100Shares: s.currentPrice * 100,
  beginnerScore: s.beginnerScore,
  stabilityScore: s.stabilityScore,
})), null, 2)}

【バランスプラン用の候補銘柄】（この中から${targetStockCount}銘柄を選択）
${JSON.stringify(balancedCandidates.map(s => ({
  tickerCode: s.tickerCode,
  name: s.name,
  sector: s.sector,
  currentPrice: s.currentPrice,
  cost100Shares: s.currentPrice * 100,
  beginnerScore: s.beginnerScore,
  growthScore: s.growthScore,
})), null, 2)}

【積極的プラン用の候補銘柄】（この中から${targetStockCount}銘柄を選択）
${JSON.stringify(aggressiveCandidates.map(s => ({
  tickerCode: s.tickerCode,
  name: s.name,
  sector: s.sector,
  currentPrice: s.currentPrice,
  cost100Shares: s.currentPrice * 100,
  growthScore: s.growthScore,
  liquidityScore: s.liquidityScore,
})), null, 2)}

**重要な制約**:
1. 各プランで${targetStockCount}銘柄を選択
2. 同じセクターから最大2銘柄まで
3. 合計金額が予算${budget}円の90%以内
4. 各銘柄100株ずつ購入
5. recommendedPriceはcurrentPriceをそのまま使用

各銘柄について「推奨理由」「将来性」「リスク要因」を説明してください。${marketNews ? "市場動向も考慮してください。" : ""}`,
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
