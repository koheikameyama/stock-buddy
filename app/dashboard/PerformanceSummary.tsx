"use client"

import Link from "next/link"
import type { PortfolioSummary } from "@/store/types"

interface PerformanceSummaryProps {
  summary: PortfolioSummary
}

export default function PerformanceSummary({ summary }: PerformanceSummaryProps) {
  const hasSoldStocks = summary.winCount + summary.loseCount > 0

  return (
    <div className="mt-4 sm:mt-6">
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <span className="text-lg">📈</span>
            </div>
            <span className="text-sm font-semibold text-gray-900">運用成績</span>
          </div>
          {hasSoldStocks && (
            <Link
              href="/my-stocks?tab=sold"
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-500 transition-colors"
            >
              <span>売却履歴</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {/* トータル損益 */}
          <div className="text-center">
            <div className="text-xs text-gray-500 mb-1">トータル損益</div>
            <div
              className={`text-base sm:text-lg font-bold ${
                summary.totalGain >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {summary.totalGain >= 0 ? "+" : ""}
              ¥{Math.round(summary.totalGain).toLocaleString()}
            </div>
            <div className={`text-[10px] ${
              summary.totalGainPercent >= 0 ? "text-green-500" : "text-red-500"
            }`}>
              {summary.totalGainPercent >= 0 ? "+" : ""}
              {summary.totalGainPercent.toFixed(1)}%
            </div>
          </div>

          {/* 含み損益 */}
          <div className="text-center">
            <div className="text-xs text-gray-500 mb-1">含み損益</div>
            <div
              className={`text-base sm:text-lg font-bold ${
                summary.unrealizedGain >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {summary.unrealizedGain >= 0 ? "+" : ""}
              ¥{Math.round(summary.unrealizedGain).toLocaleString()}
            </div>
          </div>

          {/* 確定損益 */}
          <div className="text-center">
            <div className="text-xs text-gray-500 mb-1">確定損益</div>
            {hasSoldStocks ? (
              <div
                className={`text-base sm:text-lg font-bold ${
                  summary.realizedGain >= 0 ? "text-green-600" : "text-red-600"
                }`}
              >
                {summary.realizedGain >= 0 ? "+" : ""}
                ¥{Math.round(summary.realizedGain).toLocaleString()}
              </div>
            ) : (
              <div className="text-base sm:text-lg font-bold text-gray-400">-</div>
            )}
          </div>

          {/* 勝率 */}
          <div className="text-center">
            <div className="text-xs text-gray-500 mb-1">勝率</div>
            {hasSoldStocks ? (
              <>
                <div className="text-base sm:text-lg font-bold text-gray-900">
                  {summary.winRate !== null ? `${summary.winRate.toFixed(0)}%` : "-"}
                </div>
                <div className="text-[10px] text-gray-400">
                  {summary.winCount}勝{summary.loseCount}敗
                </div>
              </>
            ) : (
              <div className="text-base sm:text-lg font-bold text-gray-400">-</div>
            )}
          </div>

          {/* 平均リターン */}
          <div className="text-center">
            <div className="text-xs text-gray-500 mb-1">平均リターン</div>
            {summary.averageReturn !== null ? (
              <div
                className={`text-base sm:text-lg font-bold ${
                  summary.averageReturn >= 0 ? "text-green-600" : "text-red-600"
                }`}
              >
                {summary.averageReturn >= 0 ? "+" : ""}
                {summary.averageReturn.toFixed(1)}%
              </div>
            ) : (
              <div className="text-base sm:text-lg font-bold text-gray-400">-</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
