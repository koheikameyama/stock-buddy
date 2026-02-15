import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; lessonSlug: string }> }
) {
  try {
    const session = await auth()
    const { slug: learningModuleSlug, lessonSlug } = await params

    // モジュールとレッスンを取得
    const learningModule = await prisma.learningModule.findUnique({
      where: { slug: learningModuleSlug, isPublished: true },
      select: { id: true, slug: true, title: true },
    })

    if (!learningModule) {
      return NextResponse.json(
        { error: "モジュールが見つかりません" },
        { status: 404 }
      )
    }

    const lesson = await prisma.lesson.findUnique({
      where: { moduleId_slug: { moduleId: learningModule.id, slug: lessonSlug } },
    })

    if (!lesson) {
      return NextResponse.json(
        { error: "レッスンが見つかりません" },
        { status: 404 }
      )
    }

    // 前後のレッスンを取得
    const [prevLesson, nextLesson] = await Promise.all([
      prisma.lesson.findFirst({
        where: { moduleId: learningModule.id, order: { lt: lesson.order } },
        orderBy: { order: "desc" },
        select: { slug: true, title: true },
      }),
      prisma.lesson.findFirst({
        where: { moduleId: learningModule.id, order: { gt: lesson.order } },
        orderBy: { order: "asc" },
        select: { slug: true, title: true },
      }),
    ])

    // 関連用語を取得
    let relatedTerms = null
    if (lesson.relatedTermSlugs) {
      const slugs = lesson.relatedTermSlugs.split(",").map((s) => s.trim())
      relatedTerms = await prisma.term.findMany({
        where: { slug: { in: slugs } },
        select: { slug: true, name: true, simpleDescription: true },
      })
    }

    // ログインしている場合は進捗も取得・更新
    let progress = null
    if (session?.user?.email) {
      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
      })

      if (user) {
        // レッスン進捗を取得または作成
        progress = await prisma.userLessonProgress.upsert({
          where: { userId_lessonId: { userId: user.id, lessonId: lesson.id } },
          create: {
            userId: user.id,
            lessonId: lesson.id,
            readLevel: "simple",
          },
          update: {},
        })

        // モジュール進捗を開始
        await prisma.userModuleProgress.upsert({
          where: { userId_moduleId: { userId: user.id, moduleId: learningModule.id } },
          create: {
            userId: user.id,
            moduleId: learningModule.id,
            status: "in_progress",
            startedAt: new Date(),
          },
          update: {
            status: "in_progress",
            startedAt: new Date(),
          },
        })
      }
    }

    return NextResponse.json({
      lesson,
      learningModule,
      prevLesson,
      nextLesson,
      relatedTerms,
      progress,
    })
  } catch (error) {
    console.error("Error fetching lesson:", error)
    return NextResponse.json(
      { error: "レッスンの取得に失敗しました" },
      { status: 500 }
    )
  }
}
