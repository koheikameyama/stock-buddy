import { Decimal } from "@prisma/client/runtime/library"

interface TransactionInput {
  type: string // "buy" | "sell"
  quantity: number
  price: Decimal | number
}

interface PortfolioCalculationResult {
  quantity: number
  averagePurchasePrice: Decimal
}

/**
 * Transaction一覧から保有数量と平均取得単価を計算
 * - 買い: 数量を加算、平均単価を再計算
 * - 売り: 数量を減算（平均単価は変わらない）
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

  let totalQuantity = 0
  let totalCost = new Decimal(0)

  // 日付順でソートされている前提で処理
  for (const tx of transactions) {
    const price = tx.price instanceof Decimal ? tx.price : new Decimal(tx.price)

    if (tx.type === "buy") {
      // 買い: 数量と取得コストを加算
      const buyAmount = price.times(tx.quantity)
      totalCost = totalCost.plus(buyAmount)
      totalQuantity += tx.quantity
    } else if (tx.type === "sell") {
      // 売り: 数量を減算（売却時は平均取得単価を按分で減らす）
      if (totalQuantity > 0) {
        const avgPrice = totalCost.div(totalQuantity)
        totalCost = totalCost.minus(avgPrice.times(tx.quantity))
        totalQuantity -= tx.quantity
      }
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