import dayjs from "dayjs"

export interface NewsRAGParams {
  stockIds?: string[]
  tickerCodes?: string[]
  sectors?: string[]
  limit?: number
  daysAgo?: number
}

export interface RelatedNews {
  id: string
  title: string
  content: string
  url: string | null
  source: string
  sector: string | null
  sentiment: string | null
  publishedAt: Date
  matchType: "ticker" | "sector"
}

/**
 * 関連ニュースを取得する
 *
 * 注意: MarketNewsテーブルは削除されたため、常に空配列を返す
 */
export async function getRelatedNews(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  params: NewsRAGParams
): Promise<RelatedNews[]> {
  // MarketNewsテーブルは削除されたため、空配列を返す
  return []
}

/**
 * ニュース参照リストをフォーマットする
 */
export function formatNewsReferences(news: RelatedNews[]): string {
  if (news.length === 0) return ""

  return (
    `\n\n---\n📰 参考にしたニュース:\n` +
    news
      .map(
        (n) =>
          `• ${n.title} (${dayjs(n.publishedAt).format("YYYY-MM-DD")}) - ${n.sentiment || "不明"}\n  ${n.url || "(URLなし)"}`
      )
      .join("\n")
  )
}

/**
 * システムプロンプト用にニュース情報をフォーマットする
 */
export function formatNewsForPrompt(news: RelatedNews[]): string {
  if (news.length === 0) {
    return "（最新のニュース情報はありません）"
  }

  return news
    .map(
      (n) => `
- タイトル: ${n.title}
- 日付: ${dayjs(n.publishedAt).format("YYYY-MM-DD")}
- センチメント: ${n.sentiment || "不明"}
- 内容: ${n.content.substring(0, 300)}${n.content.length > 300 ? "..." : ""}
- URL: ${n.url || "(URLなし)"}
`
    )
    .join("\n")
}
