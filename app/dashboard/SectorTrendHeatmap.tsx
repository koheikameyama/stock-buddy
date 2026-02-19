"use client"

import { useState, useEffect } from "react"
import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"
import { SectorTrendSkeleton } from "./SectorTrendSkeleton"

dayjs.extend(utc)
dayjs.extend(timezone)

interface SectorTrend {
  sector: string
  score3d: number
  score7d: number
  compositeScore: number | null
  trendDirection: string
  newsCount3d: number
  newsCount7d: number
  positive3d: number
  negative3d: number
  positive7d: number
  negative7d: number
  usNewsCount3d: number
  usNewsCount7d: number
  avgWeekChangeRate: number | null
  avgVolumeRatio: number | null
}

type TimeWindow = "3d" | "7d"

function getTileColor(score: number): string {
  if (score >= 40) return "bg-green-200 text-green-800"
  if (score >= 20) return "bg-green-50 text-green-700"
  if (score <= -40) return "bg-red-200 text-red-800"
  if (score <= -20) return "bg-red-50 text-red-700"
  return "bg-muted text-muted-foreground"
}

function getTrendArrow(score: number): string {
  if (score >= 20) return "▲"
  if (score <= -20) return "▼"
  return "▶"
}

function formatScore(score: number): string {
  return `${score >= 0 ? "+" : ""}${score.toFixed(0)}`
}

function formatTrendDate(dateStr: string): { label: string; isStale: boolean } {
  const date = dayjs.utc(dateStr)
  const today = dayjs().tz("Asia/Tokyo").startOf("day")
  const diffDays = today.diff(date.startOf("day"), "day")

  const label = `${date.format("M/D")} 時点`
  return { label, isStale: diffDays >= 2 }
}

export function SectorTrendHeatmap() {
  const [trends, setTrends] = useState<SectorTrend[]>([])
  const [trendDate, setTrendDate] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [timeWindow, setTimeWindow] = useState<TimeWindow>("3d")

  useEffect(() => {
    fetchTrends()
  }, [])

  const fetchTrends = async () => {
    try {
      const response = await fetch("/api/sector-trends")
      if (response.ok) {
        const data = await response.json()
        setTrends(data.trends)
        setTrendDate(data.date)
      }
    } catch (error) {
      console.error("Error fetching sector trends:", error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <SectorTrendSkeleton />
  }

  if (trends.length === 0) {
    return null
  }

  return (
    <div className="mt-4 sm:mt-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm sm:text-base font-bold text-gray-900">
            セクタートレンド
          </h3>
          {trendDate && (() => {
            const { label, isStale } = formatTrendDate(trendDate)
            return (
              <span className={`text-[10px] sm:text-xs px-1.5 py-0.5 rounded ${
                isStale
                  ? "bg-red-100 text-red-600 font-semibold"
                  : "text-gray-500"
              }`}>
                {label}
              </span>
            )
          })()}
        </div>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          <button
            onClick={() => setTimeWindow("3d")}
            className={`px-3 py-1 text-xs font-medium transition-colors ${
              timeWindow === "3d"
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            3日
          </button>
          <button
            onClick={() => setTimeWindow("7d")}
            className={`px-3 py-1 text-xs font-medium transition-colors ${
              timeWindow === "7d"
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            7日
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {trends.map((trend) => {
          const score =
            timeWindow === "3d"
              ? (trend.compositeScore ?? trend.score3d)
              : trend.score7d
          const arrow = getTrendArrow(score)
          const colorClass = getTileColor(score)
          const newsCount =
            timeWindow === "3d" ? trend.newsCount3d : trend.newsCount7d
          const usCount =
            timeWindow === "3d" ? trend.usNewsCount3d : trend.usNewsCount7d

          return (
            <div
              key={trend.sector}
              className={`rounded-lg p-2.5 sm:p-3 ${colorClass}`}
            >
              <div className="text-xs sm:text-sm font-semibold truncate mb-1">
                {trend.sector}
              </div>
              <div className="text-base sm:text-lg font-bold">
                {arrow} {formatScore(score)}
              </div>
              {timeWindow === "3d" && (
                <div className="text-[10px] sm:text-xs opacity-80 mt-0.5">
                  <span>📰{formatScore(trend.score3d)}</span>
                  {trend.avgWeekChangeRate !== null && (
                    <span className="ml-1.5">
                      📈{trend.avgWeekChangeRate >= 0 ? "+" : ""}
                      {trend.avgWeekChangeRate.toFixed(1)}%
                    </span>
                  )}
                </div>
              )}
              <div className="text-[10px] sm:text-xs opacity-70 mt-0.5">
                ニュース{newsCount}件
                {usCount > 0 && (
                  <span className="ml-1">/ 米国{usCount}件</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
