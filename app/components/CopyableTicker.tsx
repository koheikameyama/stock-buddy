"use client"

import { toast } from "sonner"

interface CopyableTickerProps {
  tickerCode: string
  className?: string
}

// .Tを除いたティッカーコードを取得
function getCleanTicker(tickerCode: string): string {
  return tickerCode.replace(/\.T$/, "")
}

export default function CopyableTicker({ tickerCode, className = "" }: CopyableTickerProps) {
  const cleanTicker = getCleanTicker(tickerCode)

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    try {
      await navigator.clipboard.writeText(cleanTicker)
      toast.success(`${cleanTicker} をコピーしました`)
    } catch {
      toast.error("コピーに失敗しました")
    }
  }

  return (
    <span
      onClick={handleCopy}
      className={`cursor-pointer hover:text-blue-600 active:text-blue-700 transition-colors ${className}`}
      title="タップしてコピー"
    >
      {tickerCode}
    </span>
  )
}

// 銘柄名からティッカーをコピーするためのユーティリティ
export function copyTicker(tickerCode: string) {
  const cleanTicker = getCleanTicker(tickerCode)
  navigator.clipboard.writeText(cleanTicker)
    .then(() => toast.success(`${cleanTicker} をコピーしました`))
    .catch(() => toast.error("コピーに失敗しました"))
}
