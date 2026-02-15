"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import ReactMarkdown from "react-markdown"

type Term = {
  id: string
  slug: string
  name: string
  nameEn: string | null
  category: string
  simpleDescription: string
  detailedDescription: string
  technicalDescription: string
  formula: string | null
  example: string | null
  relatedTermSlugs: string | null
}

type RelatedTerm = {
  slug: string
  name: string
  category: string
}

const categoryLabels: Record<string, string> = {
  technical: "テクニカル分析",
  fundamental: "ファンダメンタル分析",
  risk: "リスク管理",
  market: "市場・取引",
}

const categoryColors: Record<string, string> = {
  technical: "bg-purple-100 text-purple-700",
  fundamental: "bg-emerald-100 text-emerald-700",
  risk: "bg-amber-100 text-amber-700",
  market: "bg-blue-100 text-blue-700",
}

const contentLevels = [
  { key: "simple", label: "シンプル", description: "初心者向けの説明" },
  { key: "detailed", label: "詳細", description: "もう少し詳しく" },
  { key: "technical", label: "技術的", description: "専門的な解説" },
]

export default function TermDetail({ slug }: { slug: string }) {
  const router = useRouter()
  const [term, setTerm] = useState<Term | null>(null)
  const [relatedTerms, setRelatedTerms] = useState<RelatedTerm[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [contentLevel, setContentLevel] = useState<string>("simple")

  useEffect(() => {
    const fetchTerm = async () => {
      try {
        const res = await fetch(`/api/learning/terms/${slug}`)
        if (!res.ok) {
          if (res.status === 404) {
            setError("用語が見つかりません")
            return
          }
          throw new Error("Failed to fetch term")
        }
        const data = await res.json()
        setTerm(data.term)
        setRelatedTerms(data.relatedTerms)
      } catch (error) {
        console.error("Error fetching term:", error)
        setError("用語の取得に失敗しました")
      } finally {
        setLoading(false)
      }
    }
    fetchTerm()
  }, [slug])

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-6 w-32 bg-gray-200 rounded" />
        <div className="h-10 w-48 bg-gray-200 rounded" />
        <div className="h-64 bg-gray-200 rounded-xl" />
      </div>
    )
  }

  if (error || !term) {
    return (
      <div className="bg-white rounded-xl p-6 text-center">
        <p className="text-gray-500 mb-4">{error || "エラーが発生しました"}</p>
        <button
          onClick={() => router.push("/learn/terms")}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          用語辞典に戻る
        </button>
      </div>
    )
  }

  const getContent = () => {
    switch (contentLevel) {
      case "detailed":
        return term.detailedDescription
      case "technical":
        return term.technicalDescription
      default:
        return term.simpleDescription
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
          href="/learn/terms"
          className="hover:text-blue-600 transition-colors"
        >
          用語辞典
        </Link>
        <span>/</span>
        <span className="text-gray-900">{term.name}</span>
      </div>

      {/* タイトル */}
      <div>
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
            {term.name}
          </h1>
          <span
            className={`px-2 py-0.5 rounded-full text-xs font-medium ${
              categoryColors[term.category] || "bg-gray-100 text-gray-700"
            }`}
          >
            {categoryLabels[term.category] || term.category}
          </span>
        </div>
        {term.nameEn && (
          <p className="text-sm text-gray-500">{term.nameEn}</p>
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
      </div>

      {/* 説明 */}
      <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm prose prose-sm sm:prose max-w-none prose-headings:text-gray-900 prose-p:text-gray-700">
        <ReactMarkdown>{getContent()}</ReactMarkdown>
      </div>

      {/* 計算式 */}
      {term.formula && (
        <div className="bg-gradient-to-br from-slate-50 to-gray-50 rounded-xl p-4 sm:p-5">
          <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
            <span>📐</span>
            計算式
          </h3>
          <pre className="bg-white p-3 rounded-lg text-sm text-gray-800 overflow-x-auto whitespace-pre-wrap font-mono">
            {term.formula}
          </pre>
        </div>
      )}

      {/* 具体例 */}
      {term.example && (
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 sm:p-5">
          <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
            <span>💡</span>
            具体例
          </h3>
          <div className="prose prose-sm max-w-none prose-p:text-gray-700">
            <ReactMarkdown>{term.example}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* 関連用語 */}
      {relatedTerms && relatedTerms.length > 0 && (
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-4 sm:p-5">
          <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
            <span>🔗</span>
            関連用語
          </h3>
          <div className="flex flex-wrap gap-2">
            {relatedTerms.map((related) => (
              <Link
                key={related.slug}
                href={`/learn/terms/${related.slug}`}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors hover:opacity-80 ${
                  categoryColors[related.category] || "bg-gray-100 text-gray-700"
                }`}
              >
                {related.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* 戻るボタン */}
      <div className="flex justify-center">
        <Link
          href="/learn/terms"
          className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
        >
          用語辞典に戻る
        </Link>
      </div>
    </div>
  )
}
