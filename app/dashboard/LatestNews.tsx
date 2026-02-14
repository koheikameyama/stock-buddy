"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { getRelativeTime, getMarketFlag } from "@/lib/news"
import type { NewsItem } from "@/lib/news"

interface LatestNewsProps {
  userId: string
}

export default function LatestNews({ userId: _userId }: LatestNewsProps) {
  const [news, setNews] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchNews() {
      try {
        const response = await fetch("/api/news/dashboard?limit=5")
        const data = await response.json()

        if (data.success) {
          setNews(data.news)
        } else {
          setError("ニュースの取得に失敗しました")
        }
      } catch {
        setError("ニュースの取得に失敗しました")
      } finally {
        setLoading(false)
      }
    }

    fetchNews()
  }, [])

  if (loading) {
    return <LatestNewsSkeleton />
  }

  if (error || news.length === 0) {
    return null // エラー時やニュースがない場合は非表示
  }

  return (
    <div className="mb-4 sm:mb-6 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="p-3 sm:p-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">📰</span>
            <h2 className="text-sm sm:text-base font-bold text-gray-900">最新のニュース</h2>
          </div>
          <Link
            href="/news"
            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            もっと見る →
          </Link>
        </div>
      </div>

      <div className="divide-y divide-gray-100">
        {news.map((item) => (
          <NewsCard key={item.id} news={item} />
        ))}
      </div>
    </div>
  )
}

function NewsCard({ news }: { news: NewsItem }) {
  const marketFlag = getMarketFlag(news.market)
  const relativeTime = getRelativeTime(news.publishedAt)

  return (
    <a
      href={news.url || "#"}
      target="_blank"
      rel="noopener noreferrer"
      className="block p-3 sm:p-4 hover:bg-gray-50 transition-colors"
    >
      <div className="flex items-start gap-2">
        <span className="text-base shrink-0">{marketFlag}</span>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-gray-900 line-clamp-2 mb-1">
            {news.title}
          </h3>

          {/* 関連銘柄 */}
          {news.relatedStocks && news.relatedStocks.length > 0 && (
            <div className="flex items-center gap-1 mb-1">
              <span className="text-xs text-gray-500">→</span>
              <span className="text-xs text-blue-600">
                あなたの保有銘柄「{news.relatedStocks[0].name}」に関連
              </span>
            </div>
          )}

          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>{relativeTime}</span>
            {news.sentiment && (
              <span
                className={`px-1.5 py-0.5 rounded text-xs ${
                  news.sentiment === "positive"
                    ? "bg-green-100 text-green-700"
                    : news.sentiment === "negative"
                    ? "bg-red-100 text-red-700"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                {news.sentiment === "positive"
                  ? "ポジティブ"
                  : news.sentiment === "negative"
                  ? "ネガティブ"
                  : "中立"}
              </span>
            )}
          </div>
        </div>
      </div>
    </a>
  )
}

function LatestNewsSkeleton() {
  return (
    <div className="mb-4 sm:mb-6 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="p-3 sm:p-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-gray-200 rounded animate-pulse" />
          <div className="w-24 h-5 bg-gray-200 rounded animate-pulse" />
        </div>
      </div>
      <div className="divide-y divide-gray-100">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="p-3 sm:p-4">
            <div className="flex items-start gap-2">
              <div className="w-5 h-5 bg-gray-200 rounded animate-pulse shrink-0" />
              <div className="flex-1">
                <div className="w-full h-4 bg-gray-200 rounded animate-pulse mb-2" />
                <div className="w-2/3 h-4 bg-gray-200 rounded animate-pulse mb-2" />
                <div className="w-20 h-3 bg-gray-200 rounded animate-pulse" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
