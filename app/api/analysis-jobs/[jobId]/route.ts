import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

/**
 * GET /api/analysis-jobs/[jobId]
 * 分析ジョブの状態を取得（ポーリング用）
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 })
    }

    const { jobId } = await params

    const job = await prisma.analysisJob.findUnique({
      where: { id: jobId },
    })

    if (!job) {
      return NextResponse.json({ error: "ジョブが見つかりません" }, { status: 404 })
    }

    // 自分のジョブか確認
    if (job.userId !== session.user.id) {
      return NextResponse.json({ error: "アクセス権限がありません" }, { status: 403 })
    }

    return NextResponse.json({
      jobId: job.id,
      type: job.type,
      targetId: job.targetId,
      status: job.status,
      result: job.result,
      error: job.error,
      createdAt: job.createdAt.toISOString(),
      startedAt: job.startedAt?.toISOString() || null,
      completedAt: job.completedAt?.toISOString() || null,
    })
  } catch (error) {
    console.error("Error fetching analysis job:", error)
    return NextResponse.json(
      { error: "ジョブの取得に失敗しました" },
      { status: 500 }
    )
  }
}
