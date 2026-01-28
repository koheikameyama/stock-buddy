import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export async function POST(request: NextRequest) {
  try {
    // 認証チェック
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { budget, investmentPeriod, riskTolerance } = await request.json()

    // バリデーション
    if (!budget || budget < 10000) {
      return NextResponse.json(
        { error: "予算は10,000円以上を指定してください" },
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
          investmentAmount: parseInt(budget),
          investmentPeriod,
          riskTolerance,
        },
      })
    } else {
      await prisma.userSettings.create({
        data: {
          userId: user.id,
          investmentAmount: parseInt(budget),
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

        return {
          tickerCode: s.tickerCode.replace(".T", ""),
          name: s.name,
          sector: s.sector,
          currentPrice: Number(latestPrice.close),
          priceChange30d: priceChange,
          avgVolume: avgVolume,
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
            content: `あなたは日本株の投資アドバイザーです。以下の実際の株価データを基に、ユーザーの投資スタイルに適した銘柄を3〜5個提案してください。

**重要な制約**:
- 提案する全銘柄の合計投資金額は、必ずユーザーの予算の80%以内に収めてください
- 予算が少ない場合は、銘柄数を減らしてください（1〜2銘柄でも可）
- 単元株制度を考慮し、quantityは100株単位を基本としてください
- 1銘柄あたりの投資額が予算の50%を超えないように分散してください
- **tickerCodeは提供されたリストから正確に選択してください（数字のみ、.Tは付けない）**
- **recommendedPriceは必ずcurrentPriceを使用してください**

各銘柄について以下の情報をJSON形式で返してください：
- tickerCode: 銘柄コード（提供リストから選択、例: "7203"）
- name: 銘柄名
- recommendedPrice: 推奨購入価格（currentPriceの値を使用）
- quantity: 推奨購入株数（100株単位）
- reason: 推奨理由（セクター、価格動向、出来高などを考慮して100文字程度）

リスク許容度の考慮：
- low: 価格変動が小さい安定した大型株を優先（priceChange30dが小さい銘柄）
- medium: 適度な成長性と安定性のバランス
- high: 成長性が高い銘柄を優先（priceChange30dがプラスの銘柄）

投資期間の考慮：
- short: 出来高が多く流動性が高い銘柄
- medium: 安定した業績が期待できるセクター
- long: 配当や長期成長が期待できる銘柄

必ず以下の形式でJSONを返してください：
{
  "stocks": [
    {
      "tickerCode": "7203",
      "name": "トヨタ自動車",
      "recommendedPrice": 3347,
      "quantity": 100,
      "reason": "輸送用機器セクターの大型株。直近30日で安定した値動き。高い流動性で売買しやすい。"
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

【利用可能な銘柄データ（実際の株価）】
${JSON.stringify(stocksWithPrice, null, 2)}

上記のデータから適切な銘柄を選んで、JSON形式で返してください。`,
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
