"use client"

import { toast } from "sonner"

interface CopyableTickerProps {
  tickerCode: string
  className?: string
}

export default function CopyableTicker({ tickerCode, className = "" }: CopyableTickerProps) {
  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    try {
      await navigator.clipboard.writeText(tickerCode)
      toast.success(`${tickerCode} をコピーしました`)
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
