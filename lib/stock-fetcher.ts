/**
 * 銘柄情報取得ユーティリティ
 * yfinanceを使用して銘柄情報を取得し、マスタに登録する
 */

import { prisma } from "@/lib/prisma"

interface StockSearchResult {
  success: boolean
  stock?: {
    id: string
    tickerCode: string
    name: string
    market: string
    sector: string | null
  }
  error?: string
}

/**
 * 銘柄コードまたは名称からyfinanceで検索してマスタに追加
 *
 * @param query - 銘柄コードまたは銘柄名
 * @returns 検索・登録結果
 */
export async function searchAndAddStock(query: string): Promise<StockSearchResult> {
  try {
    // Node.jsでのみ実行可能
    if (typeof window !== "undefined") {
      return {
        success: false,
        error: "This function can only be called on the server",
      }
    }

    // yfinanceをdynamic importで読み込む（サーバーサイドのみ）
    const { searchStockByQuery } = await import("@/lib/yfinance-search")

    const result = await searchStockByQuery(query)

    if (!result.success || !result.tickerCode) {
      return {
        success: false,
        error: result.error || "銘柄が見つかりませんでした",
      }
    }

    // マスタに登録
    const stock = await prisma.stock.upsert({
      where: { tickerCode: result.tickerCode },
      update: {
        name: result.name || result.tickerCode,
        sector: result.sector,
      },
      create: {
        tickerCode: result.tickerCode,
        name: result.name || result.tickerCode,
        market: result.market || "TSE",
        sector: result.sector,
      },
    })

    return {
      success: true,
      stock: {
        id: stock.id,
        tickerCode: stock.tickerCode,
        name: stock.name,
        market: stock.market,
        sector: stock.sector,
      },
    }
  } catch (error) {
    console.error("Error in searchAndAddStock:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "銘柄の検索に失敗しました",
    }
  }
}
