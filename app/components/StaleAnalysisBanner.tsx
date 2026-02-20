"use client"

import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"
import { UPDATE_SCHEDULES } from "@/lib/constants"

dayjs.extend(utc)
dayjs.extend(timezone)

interface StaleAnalysisBannerProps {
  analysisDate: string | null
  schedule?: string
}

export default function StaleAnalysisBanner({ analysisDate, schedule = UPDATE_SCHEDULES.STOCK_ANALYSIS }: StaleAnalysisBannerProps) {
  if (!analysisDate) return null

  const todayJST = dayjs().tz("Asia/Tokyo").startOf("day")
  const analysisJST = dayjs(analysisDate).tz("Asia/Tokyo").startOf("day")

  if (analysisJST.isBefore(todayJST)) {
    const daysAgo = todayJST.diff(analysisJST, "day")
    const dateLabel = analysisJST.format("M/D")

    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
        <div className="flex items-start gap-3">
          <span className="text-2xl shrink-0">⚠️</span>
          <div>
            <p className="text-sm font-bold text-amber-800">
              この分析は{dateLabel}（{daysAgo}日前）のデータです
            </p>
            <p className="text-xs text-amber-700 mt-1">
              最新の分析は平日 {schedule} に更新されます
            </p>
          </div>
        </div>
      </div>
    )
  }

  return null
}
