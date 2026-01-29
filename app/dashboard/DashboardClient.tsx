"use client"

import { useEffect, useState } from "react"
import OnboardingModal from "@/app/components/OnboardingModal"

type DashboardClientProps = {
  hasPortfolio: boolean
  hasWatchlist: boolean
}

export default function DashboardClient({ hasPortfolio, hasWatchlist }: DashboardClientProps) {
  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
    // ポートフォリオもウォッチリストもない場合にモーダルを表示
    if (!hasPortfolio && !hasWatchlist) {
      // モーダル表示済みフラグをチェック
      const hasSeenModal = localStorage.getItem("hasSeenOnboardingModal")
      if (!hasSeenModal) {
        setShowModal(true)
      }
    }
  }, [hasPortfolio, hasWatchlist])

  const handleCloseModal = () => {
    setShowModal(false)
    localStorage.setItem("hasSeenOnboardingModal", "true")
  }

  return (
    <OnboardingModal isOpen={showModal} onClose={handleCloseModal} />
  )
}
