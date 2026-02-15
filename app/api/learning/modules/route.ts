import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    const { searchParams } = new URL(request.url)
    const category = searchParams.get("category")
    const difficulty = searchParams.get("difficulty")

    const where: {
      isPublished: boolean
      category?: string
      difficulty?: string
    } = {
      isPublished: true,
    }

    if (category) {
      where.category = category
    }

    if (difficulty) {
      where.difficulty = difficulty
    }

    const modules = await prisma.learningModule.findMany({
      where,
      orderBy: { order: "asc" },
      include: {
        _count: {
          select: { lessons: true },
        },
      },
    })

    // ログインしている場合は進捗も取得
    const progressMap: Record<string, { status: string; completedLessons: number }> = {}
    if (session?.user?.email) {
      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
      })

      if (user) {
        const moduleProgress = await prisma.userModuleProgress.findMany({
          where: { userId: user.id },
        })

        const lessonProgress = await prisma.userLessonProgress.findMany({
          where: { userId: user.id, isCompleted: true },
          include: { lesson: { select: { moduleId: true } } },
        })

        // モジュールごとの完了レッスン数を集計
        const completedByModule: Record<string, number> = {}
        lessonProgress.forEach((lp) => {
          const moduleId = lp.lesson.moduleId
          completedByModule[moduleId] = (completedByModule[moduleId] || 0) + 1
        })

        moduleProgress.forEach((mp) => {
          progressMap[mp.moduleId] = {
            status: mp.status,
            completedLessons: completedByModule[mp.moduleId] || 0,
          }
        })
      }
    }

    const modulesWithProgress = modules.map((module) => ({
      ...module,
      lessonCount: module._count.lessons,
      progress: progressMap[module.id] || null,
    }))

    return NextResponse.json({ modules: modulesWithProgress })
  } catch (error) {
    console.error("Error fetching modules:", error)
    return NextResponse.json(
      { error: "モジュールの取得に失敗しました" },
      { status: 500 }
    )
  }
}
