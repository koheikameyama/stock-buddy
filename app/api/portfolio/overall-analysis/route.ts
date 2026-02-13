import { NextResponse } from "next/server"
import { auth } from "@/auth"
import {
  getPortfolioOverallAnalysis,
  generatePortfolioOverallAnalysis,
} from "@/lib/portfolio-overall-analysis"

/**
 * GET /api/portfolio/overall-analysis
 * ポートフォリオ総評分析を取得
 */
export async function GET() {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const result = await getPortfolioOverallAnalysis(session.user.id)
    return NextResponse.json(result)
  } catch (error) {
    console.error("Error fetching portfolio overall analysis:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

/**
 * POST /api/portfolio/overall-analysis
 * ポートフォリオ総評分析をオンデマンドで生成
 */
export async function POST() {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const result = await generatePortfolioOverallAnalysis(session.user.id)
    return NextResponse.json(result)
  } catch (error) {
    console.error("Error generating portfolio overall analysis:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
