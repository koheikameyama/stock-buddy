"use client"

import { useState, useEffect } from "react"
import Link from "next/link"

type Module = {
  id: string
  slug: string
  title: string
  description: string
  category: string
  difficulty: string
  order: number
  icon: string
  estimatedTime: number
  lessonCount: number
  progress: {
    status: string
    completedLessons: number
  } | null
}

const categoryLabels: Record<string, string> = {
  basics: "基礎",
  technical: "テクニカル分析",
  fundamental: "ファンダメンタル分析",
  "risk-management": "リスク管理",
}

const difficultyLabels: Record<string, { label: string; color: string }> = {
  beginner: { label: "初級", color: "bg-green-100 text-green-700" },
  intermediate: { label: "中級", color: "bg-yellow-100 text-yellow-700" },
  advanced: { label: "上級", color: "bg-red-100 text-red-700" },
}

const categoryColors: Record<string, string> = {
  basics: "from-blue-50 to-indigo-50",
  technical: "from-purple-50 to-pink-50",
  fundamental: "from-emerald-50 to-teal-50",
  "risk-management": "from-amber-50 to-orange-50",
}

export default function LearningHome() {
  const [modules, setModules] = useState<Module[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>("all")

  useEffect(() => {
    const fetchModules = async () => {
      try {
        const res = await fetch("/api/learning/modules")
        const data = await res.json()
        setModules(data.modules || [])
      } catch (error) {
        console.error("Error fetching modules:", error)
      } finally {
        setLoading(false)
      }
    }
    fetchModules()
  }, [])

  const filteredModules = modules.filter((m) =>
    filter === "all" ? true : m.category === filter
  )

  const categories = ["all", ...Array.from(new Set(modules.map((m) => m.category)))]

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="h-32 bg-gray-200 rounded-xl animate-pulse"
          />
        ))}
      </div>
    )
  }

  if (modules.length === 0) {
    return (
      <div className="bg-white rounded-xl p-6 text-center">
        <p className="text-gray-500">
          学習コンテンツを準備中です。もう少々お待ちください。
        </p>
        <Link
          href="/learn/terms"
          className="inline-block mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          用語辞典を見る
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* フィルター */}
      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === cat
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {cat === "all" ? "すべて" : categoryLabels[cat] || cat}
          </button>
        ))}
      </div>

      {/* モジュールリスト */}
      <div className="space-y-4">
        {filteredModules.map((module) => (
          <ModuleCard key={module.id} module={module} />
        ))}
      </div>

      {/* 用語辞典リンク */}
      <div className="bg-gradient-to-br from-gray-50 to-slate-50 rounded-xl p-4 sm:p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📖</span>
          <div className="flex-1">
            <h3 className="font-bold text-gray-900">用語辞典</h3>
            <p className="text-sm text-gray-600">
              投資用語をいつでも調べられます
            </p>
          </div>
          <Link
            href="/learn/terms"
            className="px-4 py-2 bg-white text-gray-700 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors text-sm font-medium"
          >
            辞典を見る
          </Link>
        </div>
      </div>
    </div>
  )
}

function ModuleCard({ module }: { module: Module }) {
  const difficulty = difficultyLabels[module.difficulty]
  const bgColor = categoryColors[module.category] || "from-gray-50 to-slate-50"
  const progressPercent = module.progress
    ? Math.round((module.progress.completedLessons / module.lessonCount) * 100)
    : 0

  return (
    <Link href={`/learn/${module.slug}`}>
      <div
        className={`bg-gradient-to-br ${bgColor} rounded-xl p-4 sm:p-5 shadow-sm hover:shadow-md transition-shadow cursor-pointer`}
      >
        <div className="flex items-start gap-3">
          <span className="text-2xl sm:text-3xl">{module.icon}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h3 className="font-bold text-gray-900 text-sm sm:text-base">
                {module.title}
              </h3>
              {difficulty && (
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium ${difficulty.color}`}
                >
                  {difficulty.label}
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-gray-600 line-clamp-2 mb-2">
              {module.description}
            </p>
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span>{module.lessonCount}レッスン</span>
              <span>約{module.estimatedTime}分</span>
            </div>

            {/* 進捗バー */}
            {module.progress && (
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                  <span>
                    {module.progress.status === "completed"
                      ? "完了"
                      : "学習中"}
                  </span>
                  <span>{progressPercent}%</span>
                </div>
                <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      module.progress.status === "completed"
                        ? "bg-green-500"
                        : "bg-blue-500"
                    }`}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}
