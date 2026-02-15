"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

type Option = {
  id: string
  text: string
}

type Question = {
  id: string
  order: number
  question: string
  options: Option[]
}

type Quiz = {
  id: string
  title: string
  description: string | null
  passingScore: number
  module: { slug: string; title: string }
  questions: Question[]
}

type QuizResult = {
  questionId: string
  question: string
  options: Option[]
  userAnswer: string
  correctOption: string
  isCorrect: boolean
  explanation: string
}

type AttemptResult = {
  id: string
  score: number
  correctCount: number
  totalCount: number
  passed: boolean
  passingScore: number
}

export default function QuizView({ quizId }: { quizId: string }) {
  const router = useRouter()
  const [quiz, setQuiz] = useState<Quiz | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{
    attempt: AttemptResult
    results: QuizResult[]
  } | null>(null)

  useEffect(() => {
    const fetchQuiz = async () => {
      try {
        const res = await fetch(`/api/learning/quizzes/${quizId}`)
        if (!res.ok) {
          if (res.status === 404) {
            setError("クイズが見つかりません")
            return
          }
          throw new Error("Failed to fetch quiz")
        }
        const data = await res.json()
        setQuiz(data.quiz)
      } catch (error) {
        console.error("Error fetching quiz:", error)
        setError("クイズの取得に失敗しました")
      } finally {
        setLoading(false)
      }
    }
    fetchQuiz()
  }, [quizId])

  const handleAnswer = (questionId: string, optionId: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: optionId }))
  }

  const handleNext = () => {
    if (quiz && currentIndex < quiz.questions.length - 1) {
      setCurrentIndex(currentIndex + 1)
    }
  }

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1)
    }
  }

  const handleSubmit = async () => {
    if (!quiz) return

    // 未回答の問題があるか確認
    const unanswered = quiz.questions.filter((q) => !answers[q.id])
    if (unanswered.length > 0) {
      toast.error(`${unanswered.length}問が未回答です`)
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/learning/quizzes/${quizId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      })

      if (!res.ok) throw new Error("Failed to submit quiz")

      const data = await res.json()
      setResult(data)

      if (data.attempt.passed) {
        toast.success("合格です！おめでとうございます！")
      } else {
        toast.info("惜しい！もう一度挑戦してみましょう")
      }
    } catch (error) {
      console.error("Error submitting quiz:", error)
      toast.error("クイズの提出に失敗しました")
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-6 w-32 bg-gray-200 rounded" />
        <div className="h-8 w-48 bg-gray-200 rounded" />
        <div className="h-64 bg-gray-200 rounded-xl" />
      </div>
    )
  }

  if (error || !quiz) {
    return (
      <div className="bg-white rounded-xl p-6 text-center">
        <p className="text-gray-500 mb-4">{error || "エラーが発生しました"}</p>
        <button
          onClick={() => router.push("/learn")}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          学習トップに戻る
        </button>
      </div>
    )
  }

  // 結果表示
  if (result) {
    return (
      <div className="space-y-6">
        {/* 結果サマリー */}
        <div
          className={`rounded-xl p-6 text-center ${
            result.attempt.passed
              ? "bg-gradient-to-br from-green-50 to-emerald-50"
              : "bg-gradient-to-br from-amber-50 to-orange-50"
          }`}
        >
          <div className="text-4xl mb-3">
            {result.attempt.passed ? "🎉" : "💪"}
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            {result.attempt.passed ? "合格！" : "もう一度！"}
          </h2>
          <p className="text-3xl font-bold text-gray-900 mb-2">
            {result.attempt.score}%
          </p>
          <p className="text-sm text-gray-600">
            {result.attempt.correctCount}/{result.attempt.totalCount}問正解
            （合格ライン: {result.attempt.passingScore}%）
          </p>
        </div>

        {/* 各問題の結果 */}
        <div className="space-y-4">
          <h3 className="font-bold text-gray-900">結果詳細</h3>
          {result.results.map((r, index) => (
            <div
              key={r.questionId}
              className={`bg-white rounded-xl p-4 border-l-4 ${
                r.isCorrect ? "border-green-500" : "border-red-500"
              }`}
            >
              <div className="flex items-start gap-2 mb-3">
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                    r.isCorrect
                      ? "bg-green-100 text-green-700"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  {r.isCorrect ? "○" : "×"}
                </span>
                <p className="font-medium text-gray-900 flex-1">
                  Q{index + 1}. {r.question}
                </p>
              </div>

              <div className="space-y-2 mb-3">
                {(r.options as Option[]).map((opt) => (
                  <div
                    key={opt.id}
                    className={`px-3 py-2 rounded-lg text-sm ${
                      opt.id === r.correctOption
                        ? "bg-green-100 text-green-800"
                        : opt.id === r.userAnswer
                        ? "bg-red-100 text-red-800"
                        : "bg-gray-50 text-gray-600"
                    }`}
                  >
                    {opt.text}
                    {opt.id === r.correctOption && (
                      <span className="ml-2 text-green-600">← 正解</span>
                    )}
                    {opt.id === r.userAnswer && opt.id !== r.correctOption && (
                      <span className="ml-2 text-red-600">← あなたの回答</span>
                    )}
                  </div>
                ))}
              </div>

              <div className="bg-blue-50 rounded-lg p-3">
                <p className="text-xs font-medium text-blue-800 mb-1">解説</p>
                <p className="text-sm text-blue-700">{r.explanation}</p>
              </div>
            </div>
          ))}
        </div>

        {/* アクション */}
        <div className="flex justify-center gap-4">
          <button
            onClick={() => {
              setResult(null)
              setAnswers({})
              setCurrentIndex(0)
            }}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            もう一度挑戦
          </button>
          <Link
            href={`/learn/${quiz.module.slug}`}
            className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            モジュールに戻る
          </Link>
        </div>
      </div>
    )
  }

  const currentQuestion = quiz.questions[currentIndex]
  const answeredCount = Object.keys(answers).length

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <Link
          href={`/learn/${quiz.module.slug}`}
          className="inline-flex items-center text-sm text-gray-600 hover:text-blue-600 transition-colors"
        >
          <svg
            className="w-4 h-4 mr-1"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          {quiz.module.title}
        </Link>
        <span className="text-sm text-gray-500">
          {answeredCount}/{quiz.questions.length}問回答済み
        </span>
      </div>

      {/* タイトル */}
      <div>
        <h1 className="text-lg sm:text-xl font-bold text-gray-900">
          {quiz.title}
        </h1>
        {quiz.description && (
          <p className="text-sm text-gray-600 mt-1">{quiz.description}</p>
        )}
      </div>

      {/* 進捗バー */}
      <div className="bg-gray-200 rounded-full h-2 overflow-hidden">
        <div
          className="bg-blue-500 h-full transition-all"
          style={{
            width: `${((currentIndex + 1) / quiz.questions.length) * 100}%`,
          }}
        />
      </div>

      {/* 問題 */}
      <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm">
        <p className="text-xs text-gray-500 mb-2">
          Q{currentIndex + 1} / {quiz.questions.length}
        </p>
        <p className="font-bold text-gray-900 mb-4">{currentQuestion.question}</p>

        <div className="space-y-2">
          {(currentQuestion.options as Option[]).map((option) => (
            <button
              key={option.id}
              onClick={() => handleAnswer(currentQuestion.id, option.id)}
              className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-colors ${
                answers[currentQuestion.id] === option.id
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
              }`}
            >
              <span className="text-sm">{option.text}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ナビゲーション */}
      <div className="flex items-center justify-between">
        <button
          onClick={handlePrev}
          disabled={currentIndex === 0}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          前へ
        </button>

        {currentIndex === quiz.questions.length - 1 ? (
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {submitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                採点中...
              </>
            ) : (
              "回答を提出"
            )}
          </button>
        ) : (
          <button
            onClick={handleNext}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            次へ
          </button>
        )}
      </div>

      {/* 問題番号ドット */}
      <div className="flex justify-center gap-2">
        {quiz.questions.map((q, i) => (
          <button
            key={q.id}
            onClick={() => setCurrentIndex(i)}
            className={`w-3 h-3 rounded-full transition-colors ${
              i === currentIndex
                ? "bg-blue-600"
                : answers[q.id]
                ? "bg-green-500"
                : "bg-gray-300"
            }`}
            aria-label={`問題${i + 1}へ移動`}
          />
        ))}
      </div>
    </div>
  )
}
