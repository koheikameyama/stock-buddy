import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { runPortfolioAnalysis, runPurchaseRecommendation } from "@/lib/analysis-job-runner"

/**
 * GET /api/analysis-jobs
 * 処理中のジョブを取得（type, targetIdでフィルタ）
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const type = searchParams.get("type")
    const targetId = searchParams.get("targetId")

    // 処理中（pending/processing）のジョブを取得
    const job = await prisma.analysisJob.findFirst({
      where: {
        userId: session.user.id,
        status: { in: ["pending", "processing"] },
        ...(type && { type }),
        ...(targetId && { targetId }),
      },
      orderBy: { createdAt: "desc" },
    })

    if (!job) {
      return NextResponse.json({ job: null })
    }

    return NextResponse.json({
      job: {
        jobId: job.id,
        type: job.type,
        targetId: job.targetId,
        status: job.status,
        createdAt: job.createdAt.toISOString(),
      },
    })
  } catch (error) {
    console.error("Error fetching analysis jobs:", error)
    return NextResponse.json(
      { error: "ジョブの取得に失敗しました" },
      { status: 500 }
    )
  }
}

/**
 * POST /api/analysis-jobs
 * 分析ジョブを作成し、非同期で処理を開始
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 })
    }

    const body = await request.json()
    const { type, targetId } = body

    // バリデーション
    if (!type) {
      return NextResponse.json({ error: "typeは必須です" }, { status: 400 })
    }

    const validTypes = ["portfolio-analysis", "purchase-recommendation", "overall-analysis"]
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: "無効なtypeです" }, { status: 400 })
    }

    if ((type === "portfolio-analysis" || type === "purchase-recommendation") && !targetId) {
      return NextResponse.json({ error: "targetId（stockId）は必須です" }, { status: 400 })
    }

    // ジョブを作成
    const job = await prisma.analysisJob.create({
      data: {
        userId: session.user.id,
        type,
        targetId: targetId || null,
        status: "pending",
      },
    })

    // 非同期で処理を開始（レスポンス後に実行）
    // Next.jsではPromise.resolve().then()で非同期処理を開始できる
    const userId = session.user.id
    Promise.resolve().then(async () => {
      try {
        if (type === "portfolio-analysis" && targetId) {
          await runPortfolioAnalysis(job.id, userId, targetId)
        } else if (type === "purchase-recommendation" && targetId) {
          await runPurchaseRecommendation(job.id, userId, targetId)
        }
        // 他のtypeも将来的にここに追加
      } catch (error) {
        console.error(`Error running analysis job ${job.id}:`, error)
        // エラーは各runner内で処理される
      }
    })

    return NextResponse.json({
      jobId: job.id,
      status: job.status,
    })
  } catch (error) {
    console.error("Error creating analysis job:", error)
    return NextResponse.json(
      { error: "ジョブの作成に失敗しました" },
      { status: 500 }
    )
  }
}
