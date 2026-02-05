"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import InstallPrompt from "@/app/components/InstallPrompt"
import InvestmentStyleModal from "@/app/components/InvestmentStyleModal"
import PushNotificationPrompt from "@/app/components/PushNotificationPrompt"

type DashboardClientProps = {
  hasHoldings: boolean
  hasWatchlist: boolean
  hasInvestmentStyle: boolean
  investmentPeriod?: string
  riskTolerance?: string
  investmentBudget?: number | null
}

export default function DashboardClient({
  hasInvestmentStyle,
  investmentPeriod,
  riskTolerance,
  investmentBudget,
}: DashboardClientProps) {
  const [showInvestmentStyleModal, setShowInvestmentStyleModal] = useState(false)
  const searchParams = useSearchParams()

  useEffect(() => {
    // 投資スタイル編集モーダルを開く
    if (searchParams.get("editStyle") === "true") {
      setShowInvestmentStyleModal(true)
      return
    }

    // 投資スタイル未設定の場合にモーダルを表示
    if (!hasInvestmentStyle) {
      const hasSeenModal = localStorage.getItem("hasSeenInvestmentStyleModal")
      if (!hasSeenModal) {
        setShowInvestmentStyleModal(true)
      }
    }
  }, [hasInvestmentStyle, searchParams])

  const handleCloseInvestmentStyleModal = () => {
    setShowInvestmentStyleModal(false)
    localStorage.setItem("hasSeenInvestmentStyleModal", "true")
  }

  return (
    <>
      <InvestmentStyleModal
        isOpen={showInvestmentStyleModal}
        onClose={handleCloseInvestmentStyleModal}
        defaultPeriod={investmentPeriod}
        defaultRisk={riskTolerance}
        defaultBudget={investmentBudget}
      />
      <InstallPrompt />
      <PushNotificationPrompt />
    </>
  )
}
