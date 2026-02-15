import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "ログインが必要です" },
        { status: 401 }
      )
    }

    const { lessonId } = await params
    const body = await request.json()
    const { readLevel } = body // "simple" | "detailed" | "technical"

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

    // レッスンを取得
    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { module: true },
    })

    if (!lesson) {
      return NextResponse.json(
        { error: "レッスンが見つかりません" },
        { status: 404 }
      )
    }

    // レッスン進捗を更新
    const progress = await prisma.userLessonProgress.upsert({
      where: { userId_lessonId: { userId: user.id, lessonId } },
      create: {
        userId: user.id,
        lessonId,
        isCompleted: true,
        completedAt: new Date(),
        readLevel: readLevel || "simple",
      },
      update: {
        isCompleted: true,
        completedAt: new Date(),
        readLevel: readLevel || "simple",
      },
    })

    // モジュール内の全レッスンが完了したかチェック
    const totalLessons = await prisma.lesson.count({
      where: { moduleId: lesson.moduleId },
    })

    const completedLessons = await prisma.userLessonProgress.count({
      where: {
        userId: user.id,
        isCompleted: true,
        lesson: { moduleId: lesson.moduleId },
      },
    })

    // 全レッスン完了時はモジュールを完了にする
    if (completedLessons >= totalLessons) {
      await prisma.userModuleProgress.update({
        where: { userId_moduleId: { userId: user.id, moduleId: lesson.moduleId } },
        data: {
          status: "completed",
          completedAt: new Date(),
        },
      })
    }

    return NextResponse.json({
      success: true,
      progress,
      moduleCompleted: completedLessons >= totalLessons,
      completedLessons,
      totalLessons,
    })
  } catch (error) {
    console.error("Error completing lesson:", error)
    return NextResponse.json(
      { error: "レッスン完了の保存に失敗しました" },
      { status: 500 }
    )
  }
}
