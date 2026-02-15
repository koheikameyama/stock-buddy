import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ quizId: string }> }
) {
  try {
    const { quizId } = await params

    const quiz = await prisma.quiz.findUnique({
      where: { id: quizId },
      include: {
        module: {
          select: { slug: true, title: true },
        },
        questions: {
          orderBy: { order: "asc" },
          select: {
            id: true,
            order: true,
            question: true,
            options: true,
            // 正解と解説は回答後に返す
          },
        },
      },
    })

    if (!quiz) {
      return NextResponse.json(
        { error: "クイズが見つかりません" },
        { status: 404 }
      )
    }

    return NextResponse.json({ quiz })
  } catch (error) {
    console.error("Error fetching quiz:", error)
    return NextResponse.json(
      { error: "クイズの取得に失敗しました" },
      { status: 500 }
    )
  }
}
