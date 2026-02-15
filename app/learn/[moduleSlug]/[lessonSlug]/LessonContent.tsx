"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import ReactMarkdown from "react-markdown"
import { toast } from "sonner"

type Lesson = {
  id: string
  slug: string
  title: string
  order: number
  simpleContent: string
  detailedContent: string
  technicalContent: string
  relatedTermSlugs: string | null
}

type RelatedTerm = {
  slug: string
  name: string
  simpleDescription: string
}

type LessonData = {
  lesson: Lesson
  module: { slug: string; title: string }
  prevLesson: { slug: string; title: string } | null
  nextLesson: { slug: string; title: string } | null
  relatedTerms: RelatedTerm[] | null
  progress: { isCompleted: boolean; readLevel: string } | null
}

const contentLevels = [
  { key: "simple", label: "シンプル", description: "初心者向けの説明" },
  { key: "detailed", label: "詳細", description: "もう少し詳しく" },
  { key: "technical", label: "技術的", description: "専門的な解説" },
]

export default function LessonContent({
  moduleSlug,
  lessonSlug,
}: {
  moduleSlug: string
  lessonSlug: string
}) {
  const router = useRouter()
  const [data, setData] = useState<LessonData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [contentLevel, setContentLevel] = useState<string>("simple")
  const [completing, setCompleting] = useState(false)

  useEffect(() => {
    const fetchLesson = async () => {
      try {
        const res = await fetch(
          `/api/learning/modules/${moduleSlug}/lessons/${lessonSlug}`
        )
        if (!res.ok) {
          if (res.status === 404) {
            setError("レッスンが見つかりません")
            return
          }
          throw new Error("Failed to fetch lesson")
        }
        const lessonData = await res.json()
        setData(lessonData)
        if (lessonData.progress?.readLevel) {
          setContentLevel(lessonData.progress.readLevel)
        }
      } catch (error) {
        console.error("Error fetching lesson:", error)
        setError("レッスンの取得に失敗しました")
      } finally {
        setLoading(false)
      }
    }
    fetchLesson()
  }, [moduleSlug, lessonSlug])

  const handleComplete = async () => {
    if (!data) return

    setCompleting(true)
    try {
      const res = await fetch(
        `/api/learning/lessons/${data.lesson.id}/complete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ readLevel: contentLevel }),
        }
      )

      if (!res.ok) throw new Error("Failed to complete lesson")

      const result = await res.json()

      if (result.moduleCompleted) {
        toast.success("モジュールを完了しました！")
      } else {
        toast.success("レッスンを完了しました")
      }

      // 次のレッスンへ移動
      if (data.nextLesson) {
        router.push(`/learn/${moduleSlug}/${data.nextLesson.slug}`)
      } else {
        router.push(`/learn/${moduleSlug}`)
      }
    } catch (error) {
      console.error("Error completing lesson:", error)
      toast.error("レッスン完了の保存に失敗しました")
    } finally {
      setCompleting(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-32 bg-gray-200 rounded animate-pulse" />
        <div className="h-8 w-64 bg-gray-200 rounded animate-pulse" />
        <div className="h-64 bg-gray-200 rounded-xl animate-pulse" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="bg-white rounded-xl p-6 text-center">
        <p className="text-gray-500 mb-4">{error || "エラーが発生しました"}</p>
        <button
          onClick={() => router.push(`/learn/${moduleSlug}`)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          モジュールに戻る
        </button>
      </div>
    )
  }

  const { lesson, module, prevLesson, nextLesson, relatedTerms, progress } =
    data

  const getContent = () => {
    switch (contentLevel) {
      case "detailed":
        return lesson.detailedContent
      case "technical":
        return lesson.technicalContent
      default:
        return lesson.simpleContent
    }
  }

  return (
    <div className="space-y-6">
      {/* パンくずリスト */}
      <div className="flex items-center gap-2 text-sm text-gray-600">
        <Link href="/learn" className="hover:text-blue-600 transition-colors">
          学ぶ
        </Link>
        <span>/</span>
        <Link
          href={`/learn/${module.slug}`}
          className="hover:text-blue-600 transition-colors"
        >
          {module.title}
        </Link>
        <span>/</span>
        <span className="text-gray-900">{lesson.title}</span>
      </div>

      {/* レッスンタイトル */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
          {lesson.title}
        </h1>
        {progress?.isCompleted && (
          <span className="inline-flex items-center gap-1 mt-2 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
            完了済み
          </span>
        )}
      </div>

      {/* 説明レベル切り替え */}
      <div className="bg-white rounded-xl p-3 sm:p-4 shadow-sm">
        <p className="text-xs text-gray-500 mb-2">説明レベルを選択</p>
        <div className="flex gap-2">
          {contentLevels.map((level) => (
            <button
              key={level.key}
              onClick={() => setContentLevel(level.key)}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                contentLevel === level.key
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {level.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-2 text-center">
          {contentLevels.find((l) => l.key === contentLevel)?.description}
        </p>
      </div>

      {/* コンテンツ */}
      <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm prose prose-sm sm:prose max-w-none prose-headings:text-gray-900 prose-p:text-gray-700 prose-strong:text-gray-900 prose-ul:text-gray-700 prose-ol:text-gray-700">
        <ReactMarkdown>{getContent()}</ReactMarkdown>
      </div>

      {/* 関連用語 */}
      {relatedTerms && relatedTerms.length > 0 && (
        <div className="bg-amber-50 rounded-xl p-4 sm:p-5 border border-amber-200">
          <h3 className="font-bold text-amber-800 mb-3 flex items-center gap-2">
            <span>📖</span>
            関連用語
          </h3>
          <div className="space-y-2">
            {relatedTerms.map((term) => (
              <Link
                key={term.slug}
                href={`/learn/terms/${term.slug}`}
                className="block p-3 bg-white rounded-lg hover:bg-amber-100 transition-colors"
              >
                <p className="font-medium text-gray-900 text-sm">{term.name}</p>
                <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                  {term.simpleDescription}
                </p>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ナビゲーション */}
      <div className="flex items-center justify-between gap-4">
        {prevLesson ? (
          <Link
            href={`/learn/${moduleSlug}/${prevLesson.slug}`}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm"
          >
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
                d="M15 19l-7-7 7-7"
              />
            </svg>
            <span className="hidden sm:inline">{prevLesson.title}</span>
            <span className="sm:hidden">前へ</span>
          </Link>
        ) : (
          <div />
        )}

        <button
          onClick={handleComplete}
          disabled={completing}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {completing ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              保存中...
            </>
          ) : progress?.isCompleted ? (
            nextLesson ? (
              "次へ進む"
            ) : (
              "モジュールに戻る"
            )
          ) : (
            "完了して次へ"
          )}
        </button>

        {nextLesson ? (
          <Link
            href={`/learn/${moduleSlug}/${nextLesson.slug}`}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm"
          >
            <span className="hidden sm:inline">{nextLesson.title}</span>
            <span className="sm:hidden">次へ</span>
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
                d="M9 5l7 7-7 7"
              />
            </svg>
          </Link>
        ) : (
          <div />
        )}
      </div>
    </div>
  )
}
