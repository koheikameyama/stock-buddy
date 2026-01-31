"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import OnboardingModal from "@/app/components/OnboardingModal"
import InstallPrompt from "@/app/components/InstallPrompt"
import TermsModal from "@/app/components/TermsModal"

type DashboardClientProps = {
  hasPortfolio: boolean
  hasWatchlist: boolean
  termsAccepted: boolean
  privacyPolicyAccepted: boolean
}

export default function DashboardClient({
  hasPortfolio,
  hasWatchlist,
  termsAccepted,
  privacyPolicyAccepted,
}: DashboardClientProps) {
  const [showOnboardingModal, setShowOnboardingModal] = useState(false)
  const [showTermsModal, setShowTermsModal] = useState(false)
  const searchParams = useSearchParams()

  useEffect(() => {
    // 利用規約・プライバシーポリシーの同意チェック（最優先）
    if (!termsAccepted || !privacyPolicyAccepted || searchParams.get("showTerms") === "true") {
      setShowTermsModal(true)
      return
    }

    // ポートフォリオもウォッチリストもない場合にオンボーディングモーダルを表示
    if (!hasPortfolio && !hasWatchlist) {
      const hasSeenModal = localStorage.getItem("hasSeenOnboardingModal")
      if (!hasSeenModal) {
        setShowOnboardingModal(true)
      }
    }
  }, [hasPortfolio, hasWatchlist, termsAccepted, privacyPolicyAccepted, searchParams])

  const handleCloseOnboardingModal = () => {
    setShowOnboardingModal(false)
    localStorage.setItem("hasSeenOnboardingModal", "true")
  }

  const handleTermsAccepted = () => {
    setShowTermsModal(false)
    // ページをリロードして最新の状態を取得
    window.location.href = "/dashboard"
  }

  return (
    <>
      {showTermsModal && <TermsModal onAccept={handleTermsAccepted} />}
      <OnboardingModal isOpen={showOnboardingModal} onClose={handleCloseOnboardingModal} />
      <InstallPrompt />
    </>
  )
}
