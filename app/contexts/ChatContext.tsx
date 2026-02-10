"use client"

import { createContext, useContext, useState, ReactNode } from "react"

interface StockContext {
  stockId: string // DBのstock.id
  tickerCode: string
  name: string
  sector: string | null
  currentPrice: number | null
  type: "portfolio" | "watchlist"
  quantity?: number
  averagePurchasePrice?: number
  profit?: number
  profitPercent?: number
}

interface ChatContextType {
  stockContext: StockContext | null
  setStockContext: (stock: StockContext | null) => void
}

const ChatContext = createContext<ChatContextType | undefined>(undefined)

export function ChatProvider({ children }: { children: ReactNode }) {
  const [stockContext, setStockContext] = useState<StockContext | null>(null)

  return (
    <ChatContext.Provider value={{ stockContext, setStockContext }}>
      {children}
    </ChatContext.Provider>
  )
}

export function useChatContext() {
  const context = useContext(ChatContext)
  if (context === undefined) {
    throw new Error("useChatContext must be used within a ChatProvider")
  }
  return context
}
