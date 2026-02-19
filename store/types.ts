// store/types.ts

export interface CacheEntry<T> {
  data: T
  fetchedAt: number
}

export interface UserStock {
  id: string
  userId: string
  stockId: string
  type: "watchlist" | "portfolio"
  quantity?: number
  averagePurchasePrice?: number
  purchaseDate?: string
  lastAnalysis?: string | null
  shortTerm?: string | null
  mediumTerm?: string | null
  longTerm?: string | null
  recommendation?: "buy" | "sell" | "hold" | null
  analyzedAt?: string | null
  simpleStatus?: string | null
  statusType?: string | null
  stock: {
    id: string
    tickerCode: string
    name: string
    sector: string | null
    market: string
    currentPrice: number | null
  }
  createdAt: string
  updatedAt: string
}

export interface TrackedStock {
  id: string
  stockId: string
  stock: {
    id: string
    tickerCode: string
    name: string
    sector: string | null
    market: string
  }
  currentPrice: number | null
  change: number | null
  changePercent: number | null
  createdAt: string
}

export interface SoldStock {
  id: string
  stockId: string
  stock: {
    id: string
    tickerCode: string
    name: string
    sector: string | null
    market: string
  }
  firstPurchaseDate: string
  lastSellDate: string
  totalBuyQuantity: number
  totalBuyAmount: number
  totalSellAmount: number
  totalProfit: number
  profitPercent: number
  currentPrice: number | null
  hypotheticalValue: number | null
  hypotheticalProfit: number | null
  hypotheticalProfitPercent: number | null
  transactions: {
    id: string
    type: string
    quantity: number
    price: number
    totalAmount: number
    transactionDate: string
    note: string | null
  }[]
}

export interface StockPrice {
  tickerCode: string
  currentPrice: number
  previousClose: number
  change: number
  changePercent: number
  volume: number
  high: number
  low: number
}

export interface PortfolioSummary {
  totalValue: number
  totalCost: number
  unrealizedGain: number
  unrealizedGainPercent: number
}

export interface NikkeiData {
  changePercent: number
}
