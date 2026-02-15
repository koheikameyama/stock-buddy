"use client"

import { useState, useEffect } from "react"
import Link from "next/link"

type Term = {
  id: string
  slug: string
  name: string
  nameEn: string | null
  category: string
  simpleDescription: string
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

export default function TermList() {
  const [terms, setTerms] = useState<Term[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<string>("all")

  useEffect(() => {
    const fetchTerms = async () => {
      try {
        const res = await fetch("/api/learning/terms")
        const data = await res.json()
        setTerms(data.terms || [])
      } catch (error) {
        console.error("Error fetching terms:", error)
      } finally {
        setLoading(false)
      }
    }
    fetchTerms()
  }, [])

  const filteredTerms = terms.filter((term) => {
    const matchesSearch =
      searchQuery === "" ||
      term.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (term.nameEn &&
        term.nameEn.toLowerCase().includes(searchQuery.toLowerCase()))
    const matchesCategory =
      selectedCategory === "all" || term.category === selectedCategory
    return matchesSearch && matchesCategory
  })

  const categories = ["all", ...Array.from(new Set(terms.map((t) => t.category)))]

  // カテゴリごとにグループ化
  const groupedTerms = filteredTerms.reduce((acc, term) => {
    const cat = term.category
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(term)
    return acc
  }, {} as Record<string, Term[]>)

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-10 bg-gray-200 rounded-lg animate-pulse" />
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-20 bg-gray-200 rounded-lg animate-pulse" />
        ))}
      </div>
    )
  }

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

      {/* 検索 */}
      <div className="relative">
        <input
          type="text"
          placeholder="用語を検索..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-3 pl-10 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
        />
        <svg
          className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </div>

      {/* カテゴリフィルター */}
      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              selectedCategory === cat
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {cat === "all" ? "すべて" : categoryLabels[cat] || cat}
          </button>
        ))}
      </div>

      {/* 用語リスト */}
      {filteredTerms.length === 0 ? (
        <div className="bg-white rounded-xl p-6 text-center">
          <p className="text-gray-500">
            {terms.length === 0
              ? "用語がまだ登録されていません"
              : "検索条件に一致する用語が見つかりません"}
          </p>
        </div>
      ) : selectedCategory === "all" ? (
        // カテゴリ別表示
        <div className="space-y-6">
          {Object.entries(groupedTerms).map(([category, categoryTerms]) => (
            <div key={category}>
              <h2 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                <span
                  className={`px-2 py-0.5 rounded-full text-xs ${
                    categoryColors[category] || "bg-gray-100 text-gray-700"
                  }`}
                >
                  {categoryLabels[category] || category}
                </span>
                <span className="text-gray-400">({categoryTerms.length})</span>
              </h2>
              <div className="space-y-2">
                {categoryTerms.map((term) => (
                  <TermCard key={term.id} term={term} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        // 単一カテゴリ表示
        <div className="space-y-2">
          {filteredTerms.map((term) => (
            <TermCard key={term.id} term={term} />
          ))}
        </div>
      )}
    </div>
  )
}

function TermCard({ term }: { term: Term }) {
  return (
    <Link href={`/learn/terms/${term.slug}`}>
      <div className="bg-white rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-gray-900 text-sm sm:text-base">
              {term.name}
            </h3>
            {term.nameEn && (
              <p className="text-xs text-gray-400">{term.nameEn}</p>
            )}
            <p className="text-xs sm:text-sm text-gray-600 mt-1 line-clamp-2">
              {term.simpleDescription}
            </p>
          </div>
          <svg
            className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1"
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
        </div>
      </div>
    </Link>
  )
}
