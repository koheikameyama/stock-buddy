import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export const MAX_WATCHLIST_STOCKS = 5

export type AddStockToWatchlistParams = {
  userId: string
  stockId: string
  recommendedPrice: number
  recommendedQty: number
  reason?: string
  source?: string
}

export type AddStockToWatchlistResult = {
  success: true
  watchlistId: string
  message: string
  isNew: boolean
} | {
  success: false
  error: string
}

/**
 * ウォッチリストに銘柄を追加する
 * - 5銘柄制限チェック
 * - 既存エントリの場合は更新
 */
export async function addStockToWatchlist(
  params: AddStockToWatchlistParams
): Promise<AddStockToWatchlistResult> {
  const {
    userId,
    stockId,
    recommendedPrice,
    recommendedQty,
    reason,
    source = "manual",
  } = params

  try {
    // バリデーション
    if (recommendedPrice <= 0 || recommendedQty <= 0) {
      return {
        success: false,
        error: "推奨価格と数量は正の数である必要があります",
      }
    }

    // ユーザーを取得
    const user = await prisma.user.findUnique({
      where: { id: userId },
    })

    if (!user) {
      return { success: false, error: "ユーザーが見つかりません" }
    }

    // 既存のウォッチリストエントリを確認
    const existingEntry = await prisma.watchlist.findUnique({
      where: {
        userId_stockId: {
          userId: user.id,
          stockId: stockId,
        },
      },
    })

    let watchlistId: string
    let isNew = false

    if (existingEntry) {
      // 既に存在する場合は更新
      const updated = await prisma.watchlist.update({
        where: { id: existingEntry.id },
        data: {
          recommendedPrice,
          recommendedQty,
          reason,
          source,
        },
      })
      watchlistId = updated.id
    } else {
      // 新規追加の場合は銘柄数制限をチェック
      const watchlistCount = await prisma.watchlist.count({
        where: { userId: user.id },
      })

      if (watchlistCount >= MAX_WATCHLIST_STOCKS) {
        return {
          success: false,
          error: `ウォッチリストには最大${MAX_WATCHLIST_STOCKS}銘柄まで登録できます`,
        }
      }

      // 新規追加
      const created = await prisma.watchlist.create({
        data: {
          userId: user.id,
          stockId: stockId,
          recommendedPrice,
          recommendedQty,
          reason,
          source,
        },
      })
      watchlistId = created.id
      isNew = true
    }

    return {
      success: true,
      watchlistId,
      message: isNew ? "ウォッチリストに追加しました" : "ウォッチリストを更新しました",
      isNew,
    }
  } catch (error) {
    console.error("Error adding stock to watchlist:", error)
    return {
      success: false,
      error: "ウォッチリストへの追加に失敗しました",
    }
  }
}

/**
 * 複数銘柄をウォッチリストに追加する（バッチ処理）
 * - 追加可能な銘柄数を計算
 * - 制限を超える場合はエラー
 */
export async function addMultipleStocksToWatchlist(
  userId: string,
  stocks: Array<{
    stockId: string
    recommendedPrice: number
    recommendedQty: number
    reason?: string
    source?: string
  }>
): Promise<{
  success: boolean
  added: number
  updated: number
  errors: string[]
  message?: string
}> {
  try {
    // 現在のウォッチリスト数を取得
    const currentWatchlistCount = await prisma.watchlist.count({
      where: { userId },
    })

    // 新規追加される銘柄数をカウント
    let newEntriesCount = 0
    for (const stock of stocks) {
      const existingEntry = await prisma.watchlist.findUnique({
        where: {
          userId_stockId: {
            userId,
            stockId: stock.stockId,
          },
        },
      })
      if (!existingEntry) {
        newEntriesCount++
      }
    }

    // 制限チェック
    const availableSlots = MAX_WATCHLIST_STOCKS - currentWatchlistCount
    if (newEntriesCount > availableSlots) {
      return {
        success: false,
        added: 0,
        updated: 0,
        errors: [
          `ウォッチリストには最大${MAX_WATCHLIST_STOCKS}銘柄まで登録できます（現在${currentWatchlistCount}銘柄、追加可能${availableSlots}銘柄）`,
        ],
      }
    }

    // 各銘柄を追加
    let added = 0
    let updated = 0
    const errors: string[] = []

    for (const stock of stocks) {
      const result = await addStockToWatchlist({
        userId,
        ...stock,
      })

      if (result.success) {
        if (result.isNew) {
          added++
        } else {
          updated++
        }
      } else {
        errors.push(result.error)
      }
    }

    return {
      success: true,
      added,
      updated,
      errors,
      message: `${added}銘柄を追加、${updated}銘柄を更新しました`,
    }
  } catch (error) {
    console.error("Error adding multiple stocks to watchlist:", error)
    return {
      success: false,
      added: 0,
      updated: 0,
      errors: ["ウォッチリストへの追加に失敗しました"],
    }
  }
}
