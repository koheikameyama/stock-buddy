"use client"

import { useState } from "react"
import { signOut } from "next-auth/react"

interface TermsModalProps {
  onAccept: () => void
}

export default function TermsModal({ onAccept }: TermsModalProps) {
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [privacyAccepted, setPrivacyAccepted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleAccept = async () => {
    if (!termsAccepted || !privacyAccepted) {
      alert("利用規約とプライバシーポリシーの両方に同意してください")
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

      onAccept()
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">
            利用規約とプライバシーポリシー
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Stock Buddyをご利用いただく前に、以下の内容をご確認ください
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {/* 重要な免責事項 */}
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg
                  className="h-5 w-5 text-yellow-400"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-yellow-800">
                  重要: 投資リスクについて
                </h3>
                <div className="mt-2 text-sm text-yellow-700 space-y-1">
                  <p>• 本サービスは投資助言ではありません</p>
                  <p>• 株式投資には元本割れのリスクがあります</p>
                  <p>• 投資の最終判断はご自身の責任で行ってください</p>
                  <p>• 損失が発生しても当社は一切の責任を負いません</p>
                </div>
              </div>
            </div>
          </div>

          {/* 利用規約 */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              利用規約
            </h3>
            <div className="bg-gray-50 rounded-lg p-4 max-h-60 overflow-y-auto border border-gray-200">
              <div className="prose prose-sm max-w-none text-gray-700 space-y-4">
                <p className="font-semibold">第4条（投資助言ではない旨の明示）</p>
                <p>
                  1. 本サービスが提供する情報は、一般的な情報提供を目的としたものであり、金融商品取引法に基づく投資助言には該当しません。
                </p>
                <p>
                  2. 本サービスは、特定の銘柄の売買を推奨するものではありません。
                </p>
                <p>
                  3. 投資の最終判断は、ユーザー自身の責任において行ってください。
                </p>

                <p className="font-semibold mt-4">第5条（免責事項）</p>
                <p>
                  1. <strong>投資元本の保証なし</strong>: 株式投資には元本割れのリスクがあります。
                </p>
                <p>
                  2. <strong>損失の責任</strong>: 本サービスの利用により生じた損失について、当社は一切の責任を負いません。
                </p>
                <p>
                  3. <strong>情報の正確性</strong>: 本サービスが提供する情報の正確性、完全性、有用性について保証しません。
                </p>

                <p className="font-semibold mt-4">第6条（禁止事項）</p>
                <p>以下の行為を禁止します：</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>法令または公序良俗に違反する行為</li>
                  <li>不正アクセスをし、またはこれを試みる行為</li>
                  <li>本サービスを商業目的で利用する行為</li>
                  <li>その他、当社が不適切と判断する行為</li>
                </ul>

                <p className="text-xs text-gray-500 mt-4">
                  <a
                    href="/terms"
                    target="_blank"
                    className="text-blue-600 hover:underline"
                  >
                    全文を読む →
                  </a>
                </p>
              </div>
            </div>
          </div>

          {/* プライバシーポリシー */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              プライバシーポリシー
            </h3>
            <div className="bg-gray-50 rounded-lg p-4 max-h-60 overflow-y-auto border border-gray-200">
              <div className="prose prose-sm max-w-none text-gray-700 space-y-4">
                <p className="font-semibold">収集する情報</p>
                <p>以下の情報を収集します：</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>メールアドレス、氏名（Google認証経由）</li>
                  <li>投資設定情報（予算、投資期間、リスク許容度）</li>
                  <li>ポートフォリオ情報（保有銘柄、数量、取得単価）</li>
                  <li>アクセスログ（IPアドレス、ブラウザ情報）</li>
                </ul>

                <p className="font-semibold mt-4">情報の利用目的</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>ユーザー認証</li>
                  <li>AI分析による銘柄推奨</li>
                  <li>パーソナライズされた投資アドバイス</li>
                  <li>サービス改善のための利用状況分析</li>
                </ul>

                <p className="font-semibold mt-4">外部サービスの利用</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Google OAuth（ユーザー認証）</li>
                  <li>OpenAI API（AI分析機能）</li>
                  <li>Railway（ホスティング）</li>
                </ul>

                <p className="font-semibold mt-4">セキュリティ対策</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>データの暗号化（通信時・保存時）</li>
                  <li>アクセス制御</li>
                  <li>定期的なセキュリティ監査</li>
                </ul>

                <p className="text-xs text-gray-500 mt-4">
                  <a
                    href="/privacy"
                    target="_blank"
                    className="text-blue-600 hover:underline"
                  >
                    全文を読む →
                  </a>
                </p>
              </div>
            </div>
          </div>

          {/* チェックボックス */}
          <div className="space-y-3 pt-4 border-t border-gray-200">
            <label className="flex items-start space-x-3 cursor-pointer">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="mt-1 h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <span className="text-sm text-gray-700">
                <a
                  href="/terms"
                  target="_blank"
                  className="text-blue-600 hover:underline font-medium"
                >
                  利用規約
                </a>
                に同意します
              </span>
            </label>

            <label className="flex items-start space-x-3 cursor-pointer">
              <input
                type="checkbox"
                checked={privacyAccepted}
                onChange={(e) => setPrivacyAccepted(e.target.checked)}
                className="mt-1 h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <span className="text-sm text-gray-700">
                <a
                  href="/privacy"
                  target="_blank"
                  className="text-blue-600 hover:underline font-medium"
                >
                  プライバシーポリシー
                </a>
                に同意します
              </span>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end space-x-3">
          <button
            onClick={handleDecline}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            同意しない
          </button>
          <button
            onClick={handleAccept}
            disabled={!termsAccepted || !privacyAccepted || isSubmitting}
            className="px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "処理中..." : "同意してサービスを利用する"}
          </button>
        </div>
      </div>
    </div>
  )
}
