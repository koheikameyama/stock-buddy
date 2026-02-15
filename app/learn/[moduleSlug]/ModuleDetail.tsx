"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

type Lesson = {
  id: string
  slug: string
  title: string
  order: number
  progress: {
    isCompleted: boolean
    readLevel: string
  } | null
}

type Quiz = {
  id: string
  title: string
  passingScore: number
  questionCount: number
  lastAttempt: {
    score: number
    passed: boolean
  } | null
}

type Module = {
  id: string
  slug: string
  title: string
  description: string
  category: string
  difficulty: string
  icon: string
  estimatedTime: number
  lessons: Lesson[]
  quizzes: Quiz[]
  progress: {
    status: string
    startedAt: string | null
    completedAt: string | null
  } | null
}

const difficultyLabels: Record<string, { label: string; color: string }> = {
  beginner: { label: "初級", color: "bg-green-100 text-green-700" },
  intermediate: { label: "中級", color: "bg-yellow-100 text-yellow-700" },
  advanced: { label: "上級", color: "bg-red-100 text-red-700" },
}

export default function ModuleDetail({ moduleSlug }: { moduleSlug: string }) {
  const router = useRouter()
  const [module, setModule] = useState<Module | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchModule = async () => {
      try {
        const res = await fetch(`/api/learning/modules/${moduleSlug}`)
        if (!res.ok) {
          if (res.status === 404) {
            setError("モジュールが見つかりません")
            return
          }
          throw new Error("Failed to fetch module")
        }
        const data = await res.json()
        setModule(data.module)
      } catch (error) {
        console.error("Error fetching module:", error)
        setError("モジュールの取得に失敗しました")
      } finally {
        setLoading(false)
      }
    }
    fetchModule()
  }, [moduleSlug])

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
        <div className="h-24 bg-gray-200 rounded-xl animate-pulse" />
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 bg-gray-200 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (error || !module) {
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

  const completedLessons = module.lessons.filter(
    (l) => l.progress?.isCompleted
  ).length
  const progressPercent = Math.round(
    (completedLessons / module.lessons.length) * 100
  )
  const difficulty = difficultyLabels[module.difficulty]

  return (
    <div className="space-y-6">
      {/* 戻るリンク */}
      <Link
        href="/learn"
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
        学習トップに戻る
      </Link>

      {/* モジュールヘッダー */}
      <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm">
        <div className="flex items-start gap-3 mb-4">
          <span className="text-3xl sm:text-4xl">{module.icon}</span>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h1 className="text-lg sm:text-xl font-bold text-gray-900">
                {module.title}
              </h1>
              {difficulty && (
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium ${difficulty.color}`}
                >
                  {difficulty.label}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-600">{module.description}</p>
          </div>
        </div>

        {/* 進捗 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">
              {completedLessons}/{module.lessons.length} レッスン完了
            </span>
            <span className="font-medium text-gray-900">{progressPercent}%</span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                progressPercent === 100 ? "bg-green-500" : "bg-blue-500"
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* レッスンリスト */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">レッスン</h2>
        </div>
        <div className="divide-y divide-gray-100">
          {module.lessons.map((lesson, index) => (
            <Link
              key={lesson.id}
              href={`/learn/${module.slug}/${lesson.slug}`}
              className="flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors"
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  lesson.progress?.isCompleted
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                {lesson.progress?.isCompleted ? (
                  <svg
                    className="w-4 h-4"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : (
                  index + 1
                )}
              </div>
              <span className="flex-1 text-sm sm:text-base text-gray-900">
                {lesson.title}
              </span>
              <svg
                className="w-4 h-4 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </Link>
          ))}
        </div>
      </div>

      {/* クイズ */}
      {module.quizzes.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <h2 className="font-bold text-gray-900">理解度チェック</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {module.quizzes.map((quiz) => (
              <Link
                key={quiz.id}
                href={`/learn/quiz/${quiz.id}`}
                className="flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors"
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    quiz.lastAttempt?.passed
                      ? "bg-green-100 text-green-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {quiz.lastAttempt?.passed ? (
                    <svg
                      className="w-4 h-4"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-sm sm:text-base text-gray-900">
                    {quiz.title}
                  </p>
                  <p className="text-xs text-gray-500">
                    {quiz.questionCount}問 ・ 合格ライン{quiz.passingScore}%
                    {quiz.lastAttempt && (
                      <span className="ml-2">
                        前回: {quiz.lastAttempt.score}%
                      </span>
                    )}
                  </p>
                </div>
                <svg
                  className="w-4 h-4 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
