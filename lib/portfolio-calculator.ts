import { Decimal } from "@prisma/client/runtime/library"

interface TransactionInput {
  type: string // "buy" | "sell"
  quantity: number
  price: Decimal | number
  transactionDate?: Date | string
}

interface PortfolioCalculationResult {
  quantity: number
  averagePurchasePrice: Decimal
}

/**
 * Transaction一覧から保有数量と平均取得単価を計算
 * - 買い: 数量を加算、平均単価を再計算
 * - 売り: 数量を減算（平均単価は変わらない）
 *
 * 同一日付の取引は「買い→売り」の順で処理する（DBの返却順に依存しない）
 */
export function calculatePortfolioFromTransactions(
  transactions: TransactionInput[]
): PortfolioCalculationResult {
  if (transactions.length === 0) {
    return {
      quantity: 0,
      averagePurchasePrice: new Decimal(0),
    }
  }

  // 日付順でソートし、同一日付では買いを先に処理する
  // （DBの返却順に依存せず正しく計算するため）
  const sorted = [...transactions].sort((a, b) => {
    if (a.transactionDate && b.transactionDate) {
      const dateA = new Date(a.transactionDate).getTime()
      const dateB = new Date(b.transactionDate).getTime()
      if (dateA !== dateB) return dateA - dateB
    }
    // 同一日付: 買いを先に処理
    if (a.type === "buy" && b.type === "sell") return -1
    if (a.type === "sell" && b.type === "buy") return 1
    return 0
  })

  let totalQuantity = 0
  let totalCost = new Decimal(0)

  for (const tx of sorted) {
    const price = tx.price instanceof Decimal ? tx.price : new Decimal(tx.price)

    if (tx.type === "buy") {
      // 買い: 数量と取得コストを加算
      const buyAmount = price.times(tx.quantity)
      totalCost = totalCost.plus(buyAmount)
      totalQuantity += tx.quantity
    } else if (tx.type === "sell") {
      // 売り: 平均取得単価を按分で減らす（保有がある場合のみコスト計算）
      if (totalQuantity > 0) {
        const sellQty = Math.min(tx.quantity, totalQuantity)
        const avgPrice = totalCost.div(totalQuantity)
        totalCost = totalCost.minus(avgPrice.times(sellQty))
      }
      // 数量は常に減算（ガード外）— 売りが買いより先に処理されても正しく反映
      totalQuantity -= tx.quantity
    }
  }

  // 平均取得単価を計算
  const averagePurchasePrice =
    totalQuantity > 0 ? totalCost.div(totalQuantity) : new Decimal(0)

  return {
    quantity: Math.max(0, totalQuantity),
    averagePurchasePrice,
  }
}