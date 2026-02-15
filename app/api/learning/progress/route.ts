import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "ログインが必要です" },
        { status: 401 }
      )
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    })

    if (!user) {
      return NextResponse.json(
        { error: "ユーザーが見つかりません" },
        { status: 404 }
      )
    }

    // 全モジュール数
    const totalModules = await prisma.learningModule.count({
      where: { isPublished: true },
    })

    // 完了モジュール数
    const completedModules = await prisma.userModuleProgress.count({
      where: { userId: user.id, status: "completed" },
    })

    // 進行中モジュール数
    const inProgressModules = await prisma.userModuleProgress.count({
      where: { userId: user.id, status: "in_progress" },
    })

    // 全レッスン数
    const totalLessons = await prisma.lesson.count({
      where: { module: { isPublished: true } },
    })

    // 完了レッスン数
    const completedLessons = await prisma.userLessonProgress.count({
      where: { userId: user.id, isCompleted: true },
    })

    // クイズ合格数
    const passedQuizzes = await prisma.userQuizAttempt.groupBy({
      by: ["quizId"],
      where: { userId: user.id, passed: true },
    })

    // 最近の学習履歴
    const recentProgress = await prisma.userLessonProgress.findMany({
      where: { userId: user.id, isCompleted: true },
      orderBy: { completedAt: "desc" },
      take: 5,
      include: {
        lesson: {
          select: {
            title: true,
            module: {
              select: { slug: true, title: true },
            },
          },
        },
      },
    })

    return NextResponse.json({
      summary: {
        totalModules,
        completedModules,
        inProgressModules,
        totalLessons,
        completedLessons,
        passedQuizzes: passedQuizzes.length,
      },
      recentProgress: recentProgress.map((p) => ({
        lessonTitle: p.lesson.title,
        moduleSlug: p.lesson.module.slug,
        moduleTitle: p.lesson.module.title,
        completedAt: p.completedAt,
      })),
    })
  } catch (error) {
    console.error("Error fetching progress:", error)
    return NextResponse.json(
      { error: "進捗の取得に失敗しました" },
      { status: 500 }
    )
  }
}
