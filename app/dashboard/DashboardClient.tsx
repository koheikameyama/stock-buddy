"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import InstallPrompt from "@/app/components/InstallPrompt"
import TermsModal from "@/app/components/TermsModal"
import InvestmentStyleModal from "@/app/components/InvestmentStyleModal"

type DashboardClientProps = {
  hasHoldings: boolean
  hasWatchlist: boolean
  termsAccepted: boolean
  privacyPolicyAccepted: boolean
  hasInvestmentStyle: boolean
}

export default function DashboardClient({
  hasHoldings,
  hasWatchlist,
  termsAccepted,
  privacyPolicyAccepted,
  hasInvestmentStyle,
}: DashboardClientProps) {
  const [showInvestmentStyleModal, setShowInvestmentStyleModal] = useState(false)
  const [showTermsModal, setShowTermsModal] = useState(false)
  const searchParams = useSearchParams()

  useEffect(() => {
    // 利用規約・プライバシーポリシーの同意チェック（最優先）
    if (!termsAccepted || !privacyPolicyAccepted || searchParams.get("showTerms") === "true") {
      setShowTermsModal(true)
      return
    }

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
  }, [termsAccepted, privacyPolicyAccepted, hasInvestmentStyle, searchParams])

  const handleCloseInvestmentStyleModal = () => {
    setShowInvestmentStyleModal(false)
    localStorage.setItem("hasSeenInvestmentStyleModal", "true")
  }

  const handleTermsAccepted = () => {
    setShowTermsModal(false)
    // ページをリロードして最新の状態を取得
    window.location.href = "/dashboard"
  }

  return (
    <>
      {showTermsModal && <TermsModal onAccept={handleTermsAccepted} />}
      <InvestmentStyleModal isOpen={showInvestmentStyleModal} onClose={handleCloseInvestmentStyleModal} />
      <InstallPrompt />
    </>
  )
}
