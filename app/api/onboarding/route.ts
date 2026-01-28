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
    const stocks = allStocks.filter(stock => {
      const latestPrice = stock.prices[0]?.close
      if (!latestPrice) return false
      const priceNum = parseFloat(latestPrice.toString())
      // 100株買える価格であること
      return priceNum * 100 <= budgetNum * 0.75
    })

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
            content: `あなたは日本株の投資アドバイザーです。ユーザーの投資スタイルに適した銘柄を3〜5個提案してください。

**重要: 提供される銘柄リストについて**
- すでに予算内で購入可能な銘柄のみがリストされています
- 予算の計算は不要です。リストから投資スタイルに合った銘柄を選ぶだけです

**銘柄選択のルール**:
1. 提供された銘柄リストから、投資スタイル（期間・リスク）に最も適した銘柄を選択
2. 3〜5銘柄を推奨（リストが少ない場合は1〜2銘柄でも可）
3. 各銘柄は100株で提案（quantityは必ず100）
4. 分散投資を意識して、異なるセクターから選ぶ

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

各銘柄について以下の情報をJSON形式で返してください：
- tickerCode: 銘柄コード（提供リストから選択、例: "7203"）
- name: 銘柄名
- recommendedPrice: 推奨購入価格（currentPriceの値を使用）
- quantity: 推奨購入株数（100株単位）
- reason: 推奨理由（技術指標を含めて150文字程度。例: "RSI 45で適正水準。25日移動平均を上回り上昇トレンド。MACDもプラスで買いシグナル。"）

リスク許容度の考慮：
- low: technicalSignalが中立〜買いの安定した大型株を優先。RSIが30-70の範囲内
- medium: 適度な成長性と安定性のバランス。technicalSignalがプラスの銘柄
- high: technicalSignalが強い買いの成長株を優先。上昇トレンドが明確な銘柄

投資期間の考慮：
- short: 出来高が多く、technicalSignalが明確（買いまたは売り）な銘柄
- medium: 移動平均線を基準にトレンドが安定している銘柄
- long: RSIが適正水準（30-70）で、長期的な上昇トレンドにある銘柄

必ず以下の形式でJSONを返してください：
{
  "stocks": [
    {
      "tickerCode": "7203",
      "name": "トヨタ自動車",
      "recommendedPrice": 3347,
      "quantity": 100,
      "reason": "RSI 52で適正水準。25日移動平均3,500円を若干下回るも、出来高が高く流動性◎。MACDが上向きで買いシグナル。輸送用機器セクターの大型株で安定性も高い。"
    }
  ]
}`,
          },
          {
            role: "user",
            content: `以下の条件で銘柄を提案してください：

【投資条件】
- 投資期間: ${investmentPeriod}
- リスク許容度: ${riskTolerance}

【提供される銘柄リスト】
以下の銘柄はすべて予算内（${budget}円）で購入可能です。各銘柄100株ずつ購入できます。

${marketNews ? `【市場の最新動向】\n${marketNews}\n\n` : ""}【購入可能な銘柄データ】
${JSON.stringify(stocksWithPrice, null, 2)}

上記のリストから、投資スタイルに合った銘柄を3〜5個選んでJSON形式で返してください。
各銘柄のquantityは必ず100にしてください。${marketNews ? "\n市場動向も考慮してください。" : ""}`,
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
    const recommendations = JSON.parse(openaiData.choices[0].message.content)

    // 予算チェック: すべて100株で提案されているはず
    const totalInvestment = recommendations.stocks.reduce(
      (sum: number, stock: any) => sum + stock.recommendedPrice * 100,
      0
    )

    console.log(`Budget: ${budgetNum}`)
    console.log(`Recommended ${recommendations.stocks.length} stocks:`)
    recommendations.stocks.forEach((stock: any) => {
      console.log(`- ${stock.tickerCode}: ${stock.recommendedPrice}円 × 100株 = ${stock.recommendedPrice * 100}円`)
    })
    console.log(`Total: ${totalInvestment}円 (${Math.round(totalInvestment / budgetNum * 100)}% of budget)`)

    // quantityを100に統一（AIが守らない場合のフェイルセーフ）
    recommendations.stocks = recommendations.stocks.map((stock: any) => ({
      ...stock,
      quantity: 100,
    }))

    // 提案はすぐに保存せず、フロントエンドに返すだけ
    // 保存は /api/onboarding/complete で行う
    return NextResponse.json({
      success: true,
      recommendations: recommendations.stocks,
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
