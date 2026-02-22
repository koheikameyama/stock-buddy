import dayjs from "dayjs"

export interface NewsItem {
  id: string
  title: string
  content: string
  url: string | null
  source: string
  sector: string | null
  sentiment: string | null
  publishedAt: Date
  market: string
  region: string | null
  relatedStocks?: {
    id: string
    name: string
    tickerCode: string
  }[]
}

/**
 * 相対時間を取得（例：「3時間前」）
 */
export function getRelativeTime(date: Date): string {
  const now = dayjs()
  const target = dayjs(date)
  const diffMinutes = now.diff(target, "minute")
  const diffHours = now.diff(target, "hour")
  const diffDays = now.diff(target, "day")

  if (diffMinutes < 60) {
    return `${diffMinutes}分前`
  } else if (diffHours < 24) {
    return `${diffHours}時間前`
  } else {
    return `${diffDays}日前`
  }
}

/**
 * 市場フラグを取得
 */
export function getMarketFlag(market: string): string {
  switch (market) {
    case "US":
      return "🇺🇸"
    case "JP":
      return "🇯🇵"
    default:
      return "🌐"
  }
}
