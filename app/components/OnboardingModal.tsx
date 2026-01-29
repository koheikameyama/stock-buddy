"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

type OnboardingModalProps = {
  isOpen: boolean
  onClose: () => void
}

export default function OnboardingModal({ isOpen, onClose }: OnboardingModalProps) {
  const router = useRouter()
  const [closing, setClosing] = useState(false)

  if (!isOpen && !closing) return null

  const handleClose = () => {
    setClosing(true)
    setTimeout(() => {
      onClose()
      setClosing(false)
    }, 300)
  }

  const handleAIRecommendation = () => {
    router.push("/onboarding")
  }

  const handleManualRegistration = () => {
    router.push("/dashboard/portfolio")
  }

  return (
    <div
      className={`fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 transition-opacity duration-300 ${
        closing ? "opacity-0" : "opacity-100"
      }`}
      onClick={handleClose}
    >
      <div
        className={`bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6 sm:p-8 transform transition-all duration-300 ${
          closing ? "scale-95 opacity-0" : "scale-100 opacity-100"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="text-center mb-6">
          <div className="text-5xl mb-4">👋</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            ようこそ、Stock Buddyへ！
          </h2>
          <p className="text-gray-600">
            投資を始める準備はできていますか？
          </p>
        </div>

        {/* Options */}
        <div className="space-y-3 mb-6">
          {/* AI提案を受ける */}
          <button
            onClick={handleAIRecommendation}
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-4 px-6 rounded-xl font-semibold hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg hover:shadow-xl transform hover:scale-105"
          >
            <div className="flex items-center justify-between">
              <div className="text-left">
                <div className="text-lg font-bold">🤖 AI提案を受ける</div>
                <div className="text-sm text-blue-100 mt-1">
                  あなたに合った銘柄を提案します
                </div>
              </div>
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </div>
          </button>

          {/* 持ってる銘柄を登録する */}
          <button
            onClick={handleManualRegistration}
            className="w-full bg-white border-2 border-gray-300 text-gray-700 py-4 px-6 rounded-xl font-semibold hover:bg-gray-50 hover:border-gray-400 transition-all"
          >
            <div className="flex items-center justify-between">
              <div className="text-left">
                <div className="text-lg font-bold">📊 持ってる銘柄を登録</div>
                <div className="text-sm text-gray-500 mt-1">
                  既に投資している方はこちら
                </div>
              </div>
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </div>
          </button>
        </div>

        {/* Skip button */}
        <button
          onClick={handleClose}
          className="w-full text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          後で決める
        </button>
      </div>
    </div>
  )
}
