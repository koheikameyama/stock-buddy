import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ quizId: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "ログインが必要です" },
        { status: 401 }
      )
    }

    const { quizId } = await params
    const body = await request.json()
    const { answers } = body // { questionId: selectedOption }

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

    // クイズと問題を取得
    const quiz = await prisma.quiz.findUnique({
      where: { id: quizId },
      include: {
        questions: {
          orderBy: { order: "asc" },
        },
      },
    })

    if (!quiz) {
      return NextResponse.json(
        { error: "クイズが見つかりません" },
        { status: 404 }
      )
    }

    // 採点
    let correctCount = 0
    const results = quiz.questions.map((question) => {
      const userAnswer = answers[question.id]
      const isCorrect = userAnswer === question.correctOption
      if (isCorrect) correctCount++

      return {
        questionId: question.id,
        question: question.question,
        options: question.options,
        userAnswer,
        correctOption: question.correctOption,
        isCorrect,
        explanation: question.explanation,
      }
    })

    const totalCount = quiz.questions.length
    const score = Math.round((correctCount / totalCount) * 100)
    const passed = score >= quiz.passingScore

    // 結果を保存
    const attempt = await prisma.userQuizAttempt.create({
      data: {
        userId: user.id,
        quizId,
        score,
        correctCount,
        totalCount,
        answers,
        passed,
      },
    })

    return NextResponse.json({
      attempt: {
        id: attempt.id,
        score,
        correctCount,
        totalCount,
        passed,
        passingScore: quiz.passingScore,
      },
      results,
    })
  } catch (error) {
    console.error("Error submitting quiz:", error)
    return NextResponse.json(
      { error: "クイズの提出に失敗しました" },
      { status: 500 }
    )
  }
}
