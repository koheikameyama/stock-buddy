"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"

type PushSubscriptionState = {
  supported: boolean
  subscribed: boolean
  loading: boolean
}

export default function SettingsPage() {
  const router = useRouter()
  const [pushState, setPushState] = useState<PushSubscriptionState>({
    supported: false,
    subscribed: false,
    loading: true,
  })

  useEffect(() => {
    checkPushNotificationStatus()
  }, [])

  const checkPushNotificationStatus = async () => {
    try {
      // Check if push notifications are supported
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setPushState({ supported: false, subscribed: false, loading: false })
        return
      }

      // Register service worker
      const registration = await navigator.serviceWorker.register("/sw.js")

      // Check if already subscribed
      const subscription = await registration.pushManager.getSubscription()

      setPushState({
        supported: true,
        subscribed: !!subscription,
        loading: false,
      })
    } catch (error) {
      console.error("Error checking push notification status:", error)
      setPushState({ supported: false, subscribed: false, loading: false })
    }
  }

  const togglePushNotifications = async () => {
    try {
      setPushState({ ...pushState, loading: true })

      const registration = await navigator.serviceWorker.ready

      if (pushState.subscribed) {
        // Unsubscribe
        const subscription = await registration.pushManager.getSubscription()
        if (subscription) {
          await subscription.unsubscribe()
          await fetch("/api/push/subscribe", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: subscription.endpoint }),
          })
        }
        setPushState({ ...pushState, subscribed: false, loading: false })
        alert("プッシュ通知をオフにしました")
      } else {
        // Subscribe
        const response = await fetch("/api/push/subscribe")
        const { publicKey } = await response.json()

        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: publicKey,
        })

        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(subscription.toJSON()),
        })

        setPushState({ ...pushState, subscribed: true, loading: false })
        alert("プッシュ通知をオンにしました")
      }
    } catch (error) {
      console.error("Error toggling push notifications:", error)
      alert("プッシュ通知の設定に失敗しました")
      setPushState({ ...pushState, loading: false })
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      {/* シンプルなヘッダー */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center gap-2">
            <Link href="/dashboard" className="flex items-center gap-2">
              <span className="text-2xl">📊</span>
              <span className="text-xl font-bold text-gray-900">Stock Buddy</span>
            </Link>
          </div>
        </div>
      </header>

      <div className="py-8 sm:py-12 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="mb-6 sm:mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
              通知設定
            </h1>
            <p className="text-sm sm:text-base text-gray-600">
              プッシュ通知で最新のレポートをお知らせします
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-md p-6 sm:p-8 space-y-6">
            {/* プッシュ通知設定 */}
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-2">
                プッシュ通知
              </h2>
              <p className="text-sm text-gray-600 mb-4">
                毎日の分析結果や注目銘柄の更新をお知らせします
              </p>
              {!pushState.supported ? (
                <div className="p-4 rounded-xl border-2 border-gray-200 bg-gray-50">
                  <p className="text-gray-600 text-sm sm:text-base">
                    このブラウザではプッシュ通知がサポートされていません
                  </p>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 sm:p-5 rounded-xl border-2 border-gray-200 bg-gray-50">
                  <div>
                    <div className="font-semibold text-gray-900 text-base sm:text-lg">
                      {pushState.subscribed ? "✅ オン" : "🔕 オフ"}
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      {pushState.subscribed
                        ? "レポート準備完了時に通知します"
                        : "通知を受け取りません"}
                    </div>
                  </div>
                  <button
                    onClick={togglePushNotifications}
                    disabled={pushState.loading}
                    className={`w-full sm:w-auto px-6 py-3 rounded-lg font-semibold transition-colors text-sm sm:text-base ${
                      pushState.subscribed
                        ? "bg-gray-200 text-gray-700 hover:bg-gray-300"
                        : "bg-blue-600 text-white hover:bg-blue-700"
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {pushState.loading
                      ? "処理中..."
                      : pushState.subscribed
                      ? "オフにする"
                      : "オンにする"}
                  </button>
                </div>
              )}
            </div>

            {/* 通知スケジュール */}
            <div className="bg-blue-50 rounded-xl p-4 sm:p-5">
              <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <span className="text-lg sm:text-xl">📅</span>
                <span className="text-sm sm:text-base">通知スケジュール</span>
              </h3>
              <ul className="space-y-2 text-sm sm:text-base text-gray-700">
                <li className="flex items-start gap-2">
                  <span>•</span>
                  <span><strong>7:00</strong> - ポートフォリオ分析</span>
                </li>
                <li className="flex items-start gap-2">
                  <span>•</span>
                  <span><strong>9:00 / 15:00 / 22:00</strong> - 注目銘柄更新</span>
                </li>
                <li className="flex items-start gap-2">
                  <span>•</span>
                  <span><strong>17:00</strong> - 株価データ更新</span>
                </li>
              </ul>
            </div>

            {/* 戻るボタン */}
            <div className="pt-4">
              <button
                onClick={() => router.push('/dashboard')}
                className="w-full py-3 px-6 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-colors text-sm sm:text-base"
              >
                ダッシュボードに戻る
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
