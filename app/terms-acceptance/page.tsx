"use client"

import { useState } from "react"
import { signOut } from "next-auth/react"
import { useRouter } from "next/navigation"

export default function TermsAcceptancePage() {
  const router = useRouter()
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [privacyAccepted, setPrivacyAccepted] = useState(false)
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleAccept = async () => {
    if (!termsAccepted || !privacyAccepted || !disclaimerAccepted) {
      alert("すべての項目に同意してください")
      return
    }

    setIsSubmitting(true)
    try {
      const response = await fetch("/api/user/accept-terms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })

      if (!response.ok) {
        throw new Error("同意の保存に失敗しました")
      }

      router.push("/dashboard")
    } catch (error) {
      console.error("Error accepting terms:", error)
      alert("エラーが発生しました。もう一度お試しください。")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDecline = async () => {
    if (confirm("同意しない場合、サービスを利用できません。ログアウトしますか？")) {
      await signOut({ callbackUrl: "/login" })
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-blue-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <h1 className="text-xl font-bold text-gray-900 mb-2">
          利用規約への同意
        </h1>
        <p className="text-sm text-gray-600 mb-6">
          サービスを利用するには、以下に同意してください
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
                免責事項
              </a>
              に同意する
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
                利用規約
              </a>
              に同意する
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
                プライバシーポリシー
              </a>
              に同意する
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
            {isSubmitting ? "処理中..." : "同意して始める"}
          </button>
          <button
            onClick={handleDecline}
            disabled={isSubmitting}
            className="w-full px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 disabled:opacity-50 transition-colors"
          >
            同意しない
          </button>
        </div>
      </div>
    </div>
  )
}
