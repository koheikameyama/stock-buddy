"use client"

import { useEffect, useState } from "react"

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null)
  const [showInstallPrompt, setShowInstallPrompt] = useState(false)

  useEffect(() => {
    // ブラウザのインストールプロンプトをキャプチャ
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)

      // ユーザーが以前に閉じていないかチェック
      const dismissed = localStorage.getItem("pwa-install-dismissed")
      if (!dismissed) {
        // 3秒後にプロンプトを表示（UX向上）
        setTimeout(() => {
          setShowInstallPrompt(true)
        }, 3000)
      }
    }

    window.addEventListener("beforeinstallprompt", handler)

    // 既にインストール済みかチェック
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setShowInstallPrompt(false)
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handler)
    }
  }, [])

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      return
    }

    // ブラウザのインストールプロンプトを表示
    deferredPrompt.prompt()

    // ユーザーの選択を待つ
    const { outcome } = await deferredPrompt.userChoice
    console.log(`User response to the install prompt: ${outcome}`)

    // プロンプトをクリア
    setDeferredPrompt(null)
    setShowInstallPrompt(false)

    // インストールが完了したら、プッシュ通知の許可を求める
    if (outcome === "accepted") {
      setTimeout(() => {
        requestNotificationPermission()
      }, 2000)
    }
  }

  const requestNotificationPermission = async () => {
    if (!("Notification" in window)) {
      console.log("This browser does not support notifications")
      return
    }

    if (Notification.permission === "granted") {
      // 既に許可されている場合はサブスクリプションを登録
      await subscribeToPush()
      return
    }

    if (Notification.permission !== "denied") {
      const permission = await Notification.requestPermission()
      if (permission === "granted") {
        await subscribeToPush()
      }
    }
  }

  const subscribeToPush = async () => {
    try {
      const registration = await navigator.serviceWorker.ready

      // VAPID公開鍵を取得
      const response = await fetch("/api/push/subscribe")
      const { publicKey } = await response.json()

      // プッシュマネージャーにサブスクリプションを登録
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })

      // サーバーに保存
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(subscription),
      })

      console.log("Push notification subscribed successfully")
    } catch (error) {
      console.error("Failed to subscribe to push notifications:", error)
    }
  }

  // VAPID公開鍵をUint8Arrayに変換
  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
    const rawData = window.atob(base64)
    const outputArray = new Uint8Array(rawData.length)
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i)
    }
    return outputArray
  }

  const handleDismiss = () => {
    setShowInstallPrompt(false)
    // 7日間は再表示しない
    const dismissedUntil = new Date()
    dismissedUntil.setDate(dismissedUntil.getDate() + 7)
    localStorage.setItem("pwa-install-dismissed", dismissedUntil.toISOString())
  }

  if (!showInstallPrompt) {
    return null
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-md z-50 animate-slide-up">
      <div className="bg-white rounded-xl shadow-2xl border-2 border-blue-500 p-5">
        <div className="flex items-start gap-4">
          <div className="text-4xl">📱</div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-gray-900 mb-1">
              アプリをホーム画面に追加
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Stock Buddyをアプリのように使えます。
              <br />
              通知も受け取れるようになります！
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleInstallClick}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
              >
                追加する
              </button>
              <button
                onClick={handleDismiss}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                後で
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
