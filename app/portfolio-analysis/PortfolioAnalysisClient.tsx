"use client"

import Link from "next/link"
import PortfolioOverallAnalysis from "@/app/dashboard/PortfolioOverallAnalysis"

interface Props {
  portfolioCount: number
  watchlistCount: number
}

export default function PortfolioAnalysisClient({
  portfolioCount,
  watchlistCount,
}: Props) {
  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard"
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <svg
            className="w-5 h-5 text-gray-600"
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
        </Link>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
            ポートフォリオ総評
          </h1>
          <p className="text-sm text-gray-500">
            保有銘柄と気になる銘柄の総合分析
          </p>
        </div>
      </div>

      {/* 総評コンテンツ */}
      <PortfolioOverallAnalysis
        portfolioCount={portfolioCount}
        watchlistCount={watchlistCount}
      />
    </div>
  )
}
