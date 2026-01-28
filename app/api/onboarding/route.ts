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
            content: `あなたは日本株の投資アドバイザーです。ユーザーの投資スタイルに基づいて、**3つの異なるポートフォリオプラン**を提案してください。

**3つのプラン**:
1. **保守的プラン**: 安定性重視、リスク最小限
2. **バランスプラン**: リスクとリターンのバランス（ユーザーのリスク許容度に最も近い）
3. **積極的プラン**: 成長性重視、高リターン狙い

**重要: 提供される銘柄リストについて**
- すでに予算内で購入可能な銘柄のみがリストされています
- 予算の計算は不要です。リストから投資スタイルに合った銘柄を選ぶだけです

**各プランの銘柄選択ルール**:
1. 各プランで3〜5銘柄を推奨（リストが少ない場合は2〜3銘柄）
2. 各銘柄は100株で提案（quantityは必ず100）
3. セクター分散を意識
4. プランごとに異なるリスク・リターン特性を持たせる

**技術的制約**:
- **quantityは必ず100（固定）**
- **tickerCodeは提供されたリストから正確に選択（数字のみ、.Tは付けない）**
- **recommendedPriceは必ずcurrentPriceを使用**

**技術指標の活用**:
- rsi: RSI（相対力指数）。30以下は売られすぎ（買いチャンス）、70以上は買われすぎ（注意）
- sma25: 25日移動平均。currentPrice > sma25 なら上昇トレンド
- macd: MACD指標。プラスなら上昇モメンタム、マイナスなら下降モメンタム
- technicalSignal: 総合シグナル。プラスなら買いシグナル、マイナスなら売りシグナル
- technicalStrength: "強い買い"、"買い"、"中立"、"売り"、"強い売り"
- technicalReasons: シグナルの理由（配列）

**投資スコア（0-100）の活用**:
- beginnerScore: 初心者おすすめ度（安定性・知名度・分かりやすさ）。保守的プランで重視
- growthScore: 成長性スコア（値上がり期待）。積極的プランで重視
- dividendScore: 高配当スコア（インカムゲイン重視）。長期保有・安定収入狙いで重視
- stabilityScore: 安定性スコア（低リスク・低変動）。保守的プランで重視
- liquidityScore: 流動性スコア（売買のしやすさ）。全プランで基準値以上を推奨

**プラン別スコア活用ガイド**:
1. 保守的プラン: beginnerScore 60+, stabilityScore 60+, liquidityScore 50+ を優先
2. バランスプラン: 各スコアのバランス、特にbeginnerScore 50+とgrowthScore 40+
3. 積極的プラン: growthScore 60+, liquidityScore 50+ を優先。リスクを取って高リターン狙い

各銘柄について以下の情報をJSON形式で返してください：
- tickerCode: 銘柄コード（提供リストから選択、例: "7203"）
- name: 銘柄名
- recommendedPrice: 推奨購入価格（currentPriceの値を使用）
- quantity: 推奨購入株数（必ず100）
- reason: 推奨理由（技術指標を含めて100文字程度）
- futureOutlook: 将来性・見通し（今後の成長期待を100文字程度で説明）
- risks: リスク要因（懸念点を80文字程度で説明）

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
          "reason": "RSI 52で適正水準。MACDプラスで買いシグナル。大型株で安定。",
          "futureOutlook": "EV市場への投資加速。2025年以降の新型車投入で売上増期待。",
          "risks": "円高による輸出採算悪化。半導体不足の長期化リスク。"
        }
      ]
    },
    {
      "type": "balanced",
      "name": "バランスプラン",
      "description": "成長性と安定性のバランス",
      "expectedReturn": "年10-15%程度",
      "riskLevel": "中",
      "strategy": "このプラン全体の戦略を150文字程度で説明",
      "stocks": [...]
    },
    {
      "type": "aggressive",
      "name": "積極的プラン",
      "description": "高成長を狙う攻めの姿勢",
      "expectedReturn": "年15-25%程度",
      "riskLevel": "高",
      "strategy": "このプラン全体の戦略を150文字程度で説明",
      "stocks": [...]
    }
  ]
}`,
          },
          {
            role: "user",
            content: `以下の条件で**3つのプラン**を提案してください：

【ユーザーの投資スタイル】
- 投資期間: ${investmentPeriod}
- リスク許容度: ${riskTolerance}

【提供される銘柄リスト】
以下の銘柄はすべて予算内（${budget}円）で購入可能です。各銘柄100株ずつ購入できます。

${marketNews ? `【市場の最新動向】\n${marketNews}\n\n` : ""}【購入可能な銘柄データ】
${JSON.stringify(stocksWithPrice, null, 2)}

上記のリストから、以下の3つのプランを作成してください：
1. **保守的プラン**: リスク最小限、安定性重視
2. **バランスプラン**: ユーザーのリスク許容度（${riskTolerance}）に最も近いバランス型
3. **積極的プラン**: 高成長狙い、高リスク高リターン

各プランには3〜5銘柄を含め、各銘柄には「推奨理由」「将来性」「リスク要因」を必ず記載してください。
プラン全体の戦略説明も忘れずに。${marketNews ? "\n市場動向も考慮してください。" : ""}`,
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
