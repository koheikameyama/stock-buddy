"use client"

import { useEffect } from "react"
import { useBadges } from "@/app/contexts/BadgeContext"
import { BadgeKey } from "@/lib/badge-utils"

// ページ訪問時に「閲覧済み」をマークするフック
export function useMarkPageSeen(key: BadgeKey) {
  const { markPageSeen } = useBadges()

  useEffect(() => {
    markPageSeen(key)
  }, [key, markPageSeen])
}
