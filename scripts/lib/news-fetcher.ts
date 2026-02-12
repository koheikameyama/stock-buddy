/**
 * ニュース取得の共通モジュール
 *
 * MarketNewsテーブルから関連ニュースを取得する
 */

import { PrismaClient, MarketNews } from "@prisma/client"
import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"

dayjs.extend(utc)

interface NewsWithMatchType extends MarketNews {
  match_type: "ticker" | "sector"
}

export async function getRelatedNews(
  prisma: PrismaClient,
  tickerCodes: string[] = [],
  sectors: string[] = [],
  limit: number = 10,
  daysAgo: number = 7
): Promise<NewsWithMatchType[]> {
  /**
   * 関連ニュースを取得する（ハイブリッド検索）
   *
   * 優先度:
   * 1. 銘柄コード検索（content LIKE '%7203%'）
   * 2. セクター検索（sector IN (...)）
   */
  const cutoffDate = dayjs.utc().subtract(daysAgo, "day").toDate()
  const newsMap = new Map<string, NewsWithMatchType>()

  try {
    // ステップ1: 銘柄コード検索
    if (tickerCodes.length > 0) {
      // .Tサフィックスありとなしの両方を準備
      const codesWithoutSuffix = tickerCodes.map((code) => code.replace(".T", ""))
      const allCodes = Array.from(new Set([...codesWithoutSuffix, ...tickerCodes]))

      // 各コードで検索（OR条件）
      const tickerNews = await prisma.marketNews.findMany({
        where: {
          AND: [
            {
              publishedAt: { gte: cutoffDate },
            },
            {
              OR: allCodes.map((code) => ({
                content: { contains: code },
              })),
            },
          ],
        },
        orderBy: { publishedAt: "desc" },
        take: limit,
      })

      for (const news of tickerNews) {
        if (!newsMap.has(news.id)) {
          newsMap.set(news.id, { ...news, match_type: "ticker" })
        }
      }
    }

    // ステップ2: セクター検索（フォールバック）
    if (newsMap.size < limit && sectors.length > 0) {
      const remainingLimit = limit - newsMap.size
      const existingIds = Array.from(newsMap.keys())

      const sectorNews = await prisma.marketNews.findMany({
        where: {
          AND: [
            { sector: { in: sectors } },
            { publishedAt: { gte: cutoffDate } },
            ...(existingIds.length > 0 ? [{ id: { notIn: existingIds } }] : []),
          ],
        },
        orderBy: { publishedAt: "desc" },
        take: remainingLimit,
      })

      for (const news of sectorNews) {
        if (!newsMap.has(news.id)) {
          newsMap.set(news.id, { ...news, match_type: "sector" })
        }
      }
    }

    // 日付順にソート
    const result = Array.from(newsMap.values()).sort((a, b) => {
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    })

    return result.slice(0, limit)
  } catch (error) {
    console.log(`Error fetching related news: ${error}`)
    // エラー時は空配列を返す（分析は継続可能）
    return []
  }
}

export function formatNewsForPrompt(news: NewsWithMatchType[]): string {
  /**
   * システムプロンプト用にニュース情報をフォーマットする
   */
  if (news.length === 0) {
    return "（最新のニュース情報はありません）"
  }

  const lines = news.map((n) => {
    const dateStr = dayjs(n.publishedAt).format("YYYY-MM-DD")
    const contentPreview = n.content.length > 200 ? n.content.slice(0, 200) + "..." : n.content

    return `- タイトル: ${n.title}
- 日付: ${dateStr}
- センチメント: ${n.sentiment || "不明"}
- 内容: ${contentPreview}
- URL: ${n.url || "(URLなし)"}`
  })

  return lines.join("\n\n")
}
