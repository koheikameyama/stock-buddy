"use client"

import { useState } from "react"
import { signOut } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"

export default function TermsAcceptancePage() {
  const t = useTranslations('auth.termsAcceptance')
  const router = useRouter()
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [privacyAccepted, setPrivacyAccepted] = useState(false)
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleAccept = async () => {
    if (!termsAccepted || !privacyAccepted || !disclaimerAccepted) {
      alert(t('allRequired'))
      return
    }

    setIsSubmitting(true)
    try {
      const response = await fetch("/api/user/accept-terms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })

      if (!response.ok) {
        throw new Error(t('error'))
      }

      router.push("/dashboard")
    } catch (error) {
      console.error("Error accepting terms:", error)
      alert(t('error'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDecline = async () => {
    if (confirm(t('declineConfirm'))) {
      await signOut({ callbackUrl: "/login" })
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-blue-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <h1 className="text-xl font-bold text-gray-900 mb-2">
          {t('title')}
        </h1>
        <p className="text-sm text-gray-600 mb-6">
          {t('description')}
        </p>

        {/* チェックボックス */}
        <div className="space-y-4 mb-6">
          <label className="flex items-start space-x-3 cursor-pointer">
            <input
              type="checkbox"
              checked={disclaimerAccepted}
              onChange={(e) => setDisclaimerAccepted(e.target.checked)}
              className="mt-0.5 h-5 w-5 text-red-600 focus:ring-red-500 border-gray-300 rounded"
            />
            <span className="text-sm text-gray-700">
              <a
                href="/disclaimer"
                target="_blank"
                rel="noopener noreferrer"
                className="text-red-600 hover:underline font-medium"
              >
                {t('disclaimerLink')}
              </a>
              {t('agreeToTerms')}
            </span>
          </label>

          <label className="flex items-start space-x-3 cursor-pointer">
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={(e) => setTermsAccepted(e.target.checked)}
              className="mt-0.5 h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <span className="text-sm text-gray-700">
              <a
                href="/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline font-medium"
              >
                {t('termsLink')}
              </a>
              {t('agreeToTerms')}
            </span>
          </label>

          <label className="flex items-start space-x-3 cursor-pointer">
            <input
              type="checkbox"
              checked={privacyAccepted}
              onChange={(e) => setPrivacyAccepted(e.target.checked)}
              className="mt-0.5 h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <span className="text-sm text-gray-700">
              <a
                href="/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline font-medium"
              >
                {t('privacyLink')}
              </a>
              {t('agreeToTerms')}
            </span>
          </label>
        </div>

        {/* ボタン */}
        <div className="flex flex-col space-y-2">
          <button
            onClick={handleAccept}
            disabled={!termsAccepted || !privacyAccepted || !disclaimerAccepted || isSubmitting}
            className="w-full px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? t('processing') : t('submit')}
          </button>
          <button
            onClick={handleDecline}
            disabled={isSubmitting}
            className="w-full px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 disabled:opacity-50 transition-colors"
          >
            {t('decline')}
          </button>
        </div>
      </div>
    </div>
  )
}
