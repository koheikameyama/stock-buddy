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

    // OpenAI APIを使って銘柄を提案
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
            content: `あなたは日本株の投資アドバイザーです。ユーザーの投資スタイルに基づいて、適切な銘柄を3〜5個提案してください。

**重要な制約**:
- 提案する全銘柄の合計投資金額（recommendedPrice × quantity）は、必ずユーザーの予算の80%以内に収めてください
- 予算が少ない場合は、銘柄数を減らしてください（1〜2銘柄でも可）
- 単元株制度を考慮し、quantityは100株単位を基本としてください
- 1銘柄あたりの投資額が予算の50%を超えないように分散してください

各銘柄について以下の情報をJSON形式で返してください：
- tickerCode: 銘柄コード（数字のみ、例: 7203）
- name: 銘柄名
- recommendedPrice: 推奨購入価格（円）
- quantity: 推奨購入株数
- reason: 推奨理由（100文字程度）

リスク許容度：
- low: 大型株、配当銘柄中心
- medium: 成長株と安定株のバランス
- high: 成長株、新興市場も含む

投資期間：
- short: 短期的な値動きが期待できる銘柄
- medium: 中期的な成長が見込める銘柄
- long: 長期保有に適した安定銘柄

必ず以下の形式でJSONを返してください：
{
  "stocks": [
    {
      "tickerCode": "7203",
      "name": "トヨタ自動車",
      "recommendedPrice": 2500,
      "quantity": 100,
      "reason": "..."
    }
  ]
}`,
          },
          {
            role: "user",
            content: `以下の条件で銘柄を提案してください：
- 予算: ${budget}円
- 投資期間: ${investmentPeriod}
- リスク許容度: ${riskTolerance}

JSON形式で返してください。`,
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

    // ポートフォリオを作成または取得
    let portfolio = user.portfolio
    if (!portfolio) {
      portfolio = await prisma.portfolio.create({
        data: {
          userId: user.id,
          name: "マイポートフォリオ",
        },
      })
    }

    // 推奨銘柄を保存
    const stockPromises = recommendations.stocks.map(async (stock: any) => {
      // 銘柄がDBに存在するか確認
      let dbStock = await prisma.stock.findFirst({
        where: { tickerCode: stock.tickerCode },
      })

      // 存在しない場合は作成
      if (!dbStock) {
        dbStock = await prisma.stock.create({
          data: {
            tickerCode: stock.tickerCode,
            name: stock.name,
            market: "TSE", // デフォルトで東証
          },
        })
      }

      // 既存のポートフォリオ銘柄を確認
      const existing = await prisma.portfolioStock.findUnique({
        where: {
          portfolioId_stockId: {
            portfolioId: portfolio.id,
            stockId: dbStock.id,
          },
        },
      })

      if (existing) {
        // 既存の場合は更新
        return prisma.portfolioStock.update({
          where: { id: existing.id },
          data: {
            quantity: stock.quantity,
            averagePrice: stock.recommendedPrice,
          },
        })
      } else {
        // 新規作成
        return prisma.portfolioStock.create({
          data: {
            portfolioId: portfolio.id,
            stockId: dbStock.id,
            quantity: stock.quantity,
            averagePrice: stock.recommendedPrice,
          },
        })
      }
    })

    await Promise.all(stockPromises)

    return NextResponse.json({
      success: true,
      portfolioId: portfolio.id,
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
