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

    if (isNaN(budgetNum) || budgetNum < 10000) {
      return NextResponse.json(
        { error: "予算は10,000円以上を指定してください" },
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
    if (user.settings) {
      await prisma.userSettings.update({
        where: { userId: user.id },
        data: {
          investmentAmount: budgetNum,
          monthlyAmount: monthlyNum,
          investmentPeriod,
          riskTolerance,
        },
      })
    } else {
      await prisma.userSettings.create({
        data: {
          userId: user.id,
          investmentAmount: budgetNum,
          monthlyAmount: monthlyNum,
          investmentPeriod,
          riskTolerance,
        },
      })
    }

    // DBから実際の銘柄データを取得（最新株価付き）
    const stocks = await prisma.stock.findMany({
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
        messages: [
          {
            role: "system",
            content: `あなたは日本株の投資アドバイザーです。以下の実際の株価データと技術指標を基に、ユーザーの投資スタイルに適した銘柄を3〜5個提案してください。

**重要な制約**:
- 提案する全銘柄の合計投資金額は、必ずユーザーの予算の80%以内に収めてください
- 予算が少ない場合は、銘柄数を減らしてください（1〜2銘柄でも可）
- 単元株制度を考慮し、quantityは100株単位を基本としてください
- 1銘柄あたりの投資額が予算の50%を超えないように分散してください
- **tickerCodeは提供されたリストから正確に選択してください（数字のみ、.Tは付けない）**
- **recommendedPriceは必ずcurrentPriceを使用してください**

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
- 予算: ${budget}円
- 投資期間: ${investmentPeriod}
- リスク許容度: ${riskTolerance}

${marketNews ? `【市場の最新動向】\n${marketNews}\n\n` : ""}【利用可能な銘柄データ（実際の株価）】
${JSON.stringify(stocksWithPrice, null, 2)}

上記のデータから適切な銘柄を選んで、JSON形式で返してください。${marketNews ? "市場動向も考慮してください。" : ""}`,
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

    // 提案をウォッチリストに保存
    const watchlistPromises = recommendations.stocks.map(async (stock: any) => {
      // 銘柄がDBに存在するか確認（.Tあり/なし両方に対応）
      const tickerCodeWithT = stock.tickerCode.includes(".T")
        ? stock.tickerCode
        : `${stock.tickerCode}.T`

      let dbStock = await prisma.stock.findFirst({
        where: {
          OR: [{ tickerCode: stock.tickerCode }, { tickerCode: tickerCodeWithT }],
        },
      })

      // 存在しない場合は作成
      if (!dbStock) {
        dbStock = await prisma.stock.create({
          data: {
            tickerCode: stock.tickerCode,
            name: stock.name,
            market: "TSE",
          },
        })
      }

      // ウォッチリストに追加（既存の場合は更新）
      return prisma.watchlist.upsert({
        where: {
          userId_stockId: {
            userId: user.id,
            stockId: dbStock.id,
          },
        },
        update: {
          recommendedPrice: stock.recommendedPrice,
          recommendedQty: stock.quantity,
          reason: stock.reason,
          source: "onboarding",
        },
        create: {
          userId: user.id,
          stockId: dbStock.id,
          recommendedPrice: stock.recommendedPrice,
          recommendedQty: stock.quantity,
          reason: stock.reason,
          source: "onboarding",
        },
      })
    })

    await Promise.all(watchlistPromises)

    return NextResponse.json({
      success: true,
      recommendations: recommendations.stocks,
    })
  } catch (error) {
    console.error("Error in onboarding:", error)
    return NextResponse.json(
      { error: "銘柄の提案に失敗しました" },
      { status: 500 }
    )
  }
}
