import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const session = await auth()
    const { slug } = await params

    const learningModule = await prisma.learningModule.findUnique({
      where: { slug, isPublished: true },
      include: {
        lessons: {
          orderBy: { order: "asc" },
          select: {
            id: true,
            slug: true,
            title: true,
            order: true,
          },
        },
        quizzes: {
          select: {
            id: true,
            title: true,
            passingScore: true,
            _count: {
              select: { questions: true },
            },
          },
        },
      },
    })

    if (!learningModule) {
      return NextResponse.json(
        { error: "モジュールが見つかりません" },
        { status: 404 }
      )
    }

    // ログインしている場合は進捗も取得
    const lessonProgressMap: Record<string, { isCompleted: boolean; readLevel: string }> = {}
    let learningModuleProgress = null
    let quizAttempts: Array<{ quizId: string; score: number; passed: boolean }> = []

    if (session?.user?.email) {
      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
      })

      if (user) {
        // モジュール進捗
        const mp = await prisma.userModuleProgress.findUnique({
          where: { userId_moduleId: { userId: user.id, moduleId: learningModule.id } },
        })
        learningModuleProgress = mp ? { status: mp.status, startedAt: mp.startedAt, completedAt: mp.completedAt } : null

        // レッスン進捗
        const lessonIds = learningModule.lessons.map((l) => l.id)
        const lessonProgress = await prisma.userLessonProgress.findMany({
          where: { userId: user.id, lessonId: { in: lessonIds } },
        })
        lessonProgress.forEach((lp) => {
          lessonProgressMap[lp.lessonId] = {
            isCompleted: lp.isCompleted,
            readLevel: lp.readLevel,
          }
        })

        // クイズ履歴（最新の結果のみ）
        const quizIds = learningModule.quizzes.map((q) => q.id)
        const attempts = await prisma.userQuizAttempt.findMany({
          where: { userId: user.id, quizId: { in: quizIds } },
          orderBy: { createdAt: "desc" },
          distinct: ["quizId"],
        })
        quizAttempts = attempts.map((a) => ({
          quizId: a.quizId,
          score: a.score,
          passed: a.passed,
        }))
      }
    }

    const lessonsWithProgress = learningModule.lessons.map((lesson) => ({
      ...lesson,
      progress: lessonProgressMap[lesson.id] || null,
    }))

    const quizzesWithAttempts = learningModule.quizzes.map((quiz) => ({
      ...quiz,
      questionCount: quiz._count.questions,
      lastAttempt: quizAttempts.find((a) => a.quizId === quiz.id) || null,
    }))

    return NextResponse.json({
      learningModule: {
        ...learningModule,
        lessons: lessonsWithProgress,
        quizzes: quizzesWithAttempts,
        progress: learningModuleProgress,
      },
    })
  } catch (error) {
    console.error("Error fetching learningModule:", error)
    return NextResponse.json(
      { error: "モジュールの取得に失敗しました" },
      { status: 500 }
    )
  }
}
