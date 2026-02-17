"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import Footer from "@/app/components/Footer"
import BottomNavigation from "@/app/components/BottomNavigation"
import BackButton from "@/app/components/BackButton"

type PushSubscriptionState = {
  supported: boolean
  subscribed: boolean
  loading: boolean
}

type UserSettings = {
  investmentPeriod: string | null
  riskTolerance: string | null
  investmentBudget: number | null
  targetReturnRate: number | null
  stopLossRate: number | null
}

const TARGET_RETURN_OPTIONS = [
  { value: 5, label: "+5%", description: "安定志向" },
  { value: 10, label: "+10%", description: "バランス型" },
  { value: 15, label: "+15%", description: "やや積極的" },
  { value: 20, label: "+20%", description: "積極的" },
  { value: 30, label: "+30%", description: "長期・ハイリターン" },
]

const STOP_LOSS_OPTIONS = [
  { value: -5, label: "-5%", description: "慎重派" },
  { value: -10, label: "-10%", description: "バランス型" },
  { value: -15, label: "-15%", description: "中長期" },
  { value: -20, label: "-20%", description: "長期・変動許容" },
]

const INVESTMENT_PERIOD_OPTIONS = [
  { value: "short", label: "短期", description: "〜1年", icon: "📅" },
  { value: "medium", label: "中期", description: "1〜3年", icon: "📆" },
  { value: "long", label: "長期", description: "3年〜", icon: "🗓️" },
]

const RISK_TOLERANCE_OPTIONS = [
  { value: "low", label: "低", description: "安定重視", icon: "🛡️" },
  { value: "medium", label: "中", description: "バランス", icon: "⚖️" },
  { value: "high", label: "高", description: "成長重視", icon: "🚀" },
]

const BUDGET_OPTIONS = [
  { value: 100000, label: "10万円", description: "少額から" },
  { value: 300000, label: "30万円", description: "手軽に" },
  { value: 500000, label: "50万円", description: "しっかり" },
  { value: 1000000, label: "100万円", description: "本格的に" },
]

export default function SettingsPage() {
  const [pushState, setPushState] = useState<PushSubscriptionState>({
    supported: false,
    subscribed: false,
    loading: true,
  })
  const [settings, setSettings] = useState<UserSettings>({
    investmentPeriod: null,
    riskTolerance: null,
    investmentBudget: null,
    targetReturnRate: null,
    stopLossRate: null,
  })
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [savingSettings, setSavingSettings] = useState(false)

  useEffect(() => {
    checkPushNotificationStatus()
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      const response = await fetch("/api/settings")
      if (response.ok) {
        const data = await response.json()
        if (data.settings) {
          setSettings({
            investmentPeriod: data.settings.investmentPeriod,
            riskTolerance: data.settings.riskTolerance,
            investmentBudget: data.settings.investmentBudget,
            targetReturnRate: data.settings.targetReturnRate,
            stopLossRate: data.settings.stopLossRate,
          })
        }
      }
    } catch (error) {
      console.error("Error fetching settings:", error)
    } finally {
      setSettingsLoading(false)
    }
  }

  const saveSettings = async (updates: Partial<UserSettings>) => {
    setSavingSettings(true)
    try {
      const newSettings = { ...settings, ...updates }

      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          investmentPeriod: newSettings.investmentPeriod || "medium",
          riskTolerance: newSettings.riskTolerance || "medium",
          investmentBudget: newSettings.investmentBudget,
          targetReturnRate: newSettings.targetReturnRate,
          stopLossRate: newSettings.stopLossRate,
        }),
      })

      if (response.ok) {
        setSettings(newSettings)
        toast.success("設定を保存しました")
      } else {
        toast.error("設定の保存に失敗しました")
      }
    } catch (error) {
      console.error("Error saving settings:", error)
      toast.error("設定の保存に失敗しました")
    } finally {
      setSavingSettings(false)
    }
  }

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
        toast.success("プッシュ通知をオフにしました")
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
        toast.success("プッシュ通知をオンにしました")
      }
    } catch (error) {
      console.error("Error toggling push notifications:", error)
      toast.error("プッシュ通知の設定に失敗しました")
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
          <BackButton href="/dashboard" label="ダッシュボードに戻る" />
          <div className="mb-6 sm:mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
              設定
            </h1>
            <p className="text-sm sm:text-base text-gray-600">
              投資目標と通知の設定ができます
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
                  <span><strong>7:00</strong> - 保有銘柄分析</span>
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

            {/* 区切り線 */}
            <hr className="border-gray-200" />

            {/* 投資スタイル設定 */}
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-2">
                投資スタイル
              </h2>
              <p className="text-sm text-gray-600 mb-4">
                あなたに合った銘柄をおすすめするために使います
              </p>

              {settingsLoading ? (
                <div className="p-4 rounded-xl border-2 border-gray-200 bg-gray-50 text-center">
                  <p className="text-gray-600">読み込み中...</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* 投資期間 */}
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <span className="text-lg">⏱️</span>
                      <span>投資期間</span>
                    </h3>
                    <div className="grid grid-cols-3 gap-2">
                      {INVESTMENT_PERIOD_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          onClick={() => saveSettings({ investmentPeriod: option.value })}
                          disabled={savingSettings}
                          className={`p-3 rounded-lg border-2 text-center transition-all ${
                            settings.investmentPeriod === option.value
                              ? "border-blue-500 bg-blue-50"
                              : "border-gray-200 hover:border-gray-300 bg-white"
                          } disabled:opacity-50`}
                        >
                          <div className="text-lg mb-1">{option.icon}</div>
                          <div className={`font-bold text-sm ${
                            settings.investmentPeriod === option.value
                              ? "text-blue-600"
                              : "text-gray-900"
                          }`}>
                            {option.label}
                          </div>
                          <div className="text-xs text-gray-500">{option.description}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* リスク許容度 */}
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <span className="text-lg">📊</span>
                      <span>リスク許容度</span>
                    </h3>
                    <div className="grid grid-cols-3 gap-2">
                      {RISK_TOLERANCE_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          onClick={() => saveSettings({ riskTolerance: option.value })}
                          disabled={savingSettings}
                          className={`p-3 rounded-lg border-2 text-center transition-all ${
                            settings.riskTolerance === option.value
                              ? "border-blue-500 bg-blue-50"
                              : "border-gray-200 hover:border-gray-300 bg-white"
                          } disabled:opacity-50`}
                        >
                          <div className="text-lg mb-1">{option.icon}</div>
                          <div className={`font-bold text-sm ${
                            settings.riskTolerance === option.value
                              ? "text-blue-600"
                              : "text-gray-900"
                          }`}>
                            {option.label}
                          </div>
                          <div className="text-xs text-gray-500">{option.description}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 投資資金 */}
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <span className="text-lg">💰</span>
                      <span>投資にまわせる資金</span>
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {BUDGET_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          onClick={() => saveSettings({ investmentBudget: option.value })}
                          disabled={savingSettings}
                          className={`p-3 rounded-lg border-2 text-center transition-all ${
                            settings.investmentBudget === option.value
                              ? "border-blue-500 bg-blue-50"
                              : "border-gray-200 hover:border-gray-300 bg-white"
                          } disabled:opacity-50`}
                        >
                          <div className={`font-bold text-sm ${
                            settings.investmentBudget === option.value
                              ? "text-blue-600"
                              : "text-gray-900"
                          }`}>
                            {option.label}
                          </div>
                          <div className="text-xs text-gray-500">{option.description}</div>
                        </button>
                      ))}
                      <button
                        onClick={() => saveSettings({ investmentBudget: null })}
                        disabled={savingSettings}
                        className={`p-3 rounded-lg border-2 text-center transition-all ${
                          settings.investmentBudget === null
                            ? "border-gray-500 bg-gray-100"
                            : "border-gray-200 hover:border-gray-300 bg-white"
                        } disabled:opacity-50`}
                      >
                        <div className="font-bold text-sm text-gray-600">未定</div>
                        <div className="text-xs text-gray-500">あとで決める</div>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 区切り線 */}
            <hr className="border-gray-200" />

            {/* 売却目標設定 */}
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-2">
                売却目標設定
              </h2>
              <p className="text-sm text-gray-600 mb-4">
                利益確定と損切りの目安を設定できます。AIが売却タイミングを提案する際に参考にします。
              </p>

              {settingsLoading ? (
                <div className="p-4 rounded-xl border-2 border-gray-200 bg-gray-50 text-center">
                  <p className="text-gray-600">読み込み中...</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* 目標利益率 */}
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <span className="text-lg">📈</span>
                      <span>目標利益率（利確ライン）</span>
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {TARGET_RETURN_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          onClick={() => saveSettings({ targetReturnRate: option.value })}
                          disabled={savingSettings}
                          className={`p-3 rounded-lg border-2 text-left transition-all ${
                            settings.targetReturnRate === option.value
                              ? "border-green-500 bg-green-50"
                              : "border-gray-200 hover:border-gray-300 bg-white"
                          } disabled:opacity-50`}
                        >
                          <div className={`font-bold ${
                            settings.targetReturnRate === option.value
                              ? "text-green-600"
                              : "text-gray-900"
                          }`}>
                            {option.label}
                          </div>
                          <div className="text-xs text-gray-500">{option.description}</div>
                        </button>
                      ))}
                      <button
                        onClick={() => saveSettings({ targetReturnRate: null })}
                        disabled={savingSettings}
                        className={`p-3 rounded-lg border-2 text-left transition-all ${
                          settings.targetReturnRate === null
                            ? "border-gray-500 bg-gray-100"
                            : "border-gray-200 hover:border-gray-300 bg-white"
                        } disabled:opacity-50`}
                      >
                        <div className="font-bold text-gray-600">未設定</div>
                        <div className="text-xs text-gray-500">AIにお任せ</div>
                      </button>
                    </div>
                  </div>

                  {/* 損切りライン */}
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <span className="text-lg">📉</span>
                      <span>損切りライン（逆指値目安）</span>
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {STOP_LOSS_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          onClick={() => saveSettings({ stopLossRate: option.value })}
                          disabled={savingSettings}
                          className={`p-3 rounded-lg border-2 text-left transition-all ${
                            settings.stopLossRate === option.value
                              ? "border-red-500 bg-red-50"
                              : "border-gray-200 hover:border-gray-300 bg-white"
                          } disabled:opacity-50`}
                        >
                          <div className={`font-bold ${
                            settings.stopLossRate === option.value
                              ? "text-red-600"
                              : "text-gray-900"
                          }`}>
                            {option.label}
                          </div>
                          <div className="text-xs text-gray-500">{option.description}</div>
                        </button>
                      ))}
                      <button
                        onClick={() => saveSettings({ stopLossRate: null })}
                        disabled={savingSettings}
                        className={`p-3 rounded-lg border-2 text-left transition-all ${
                          settings.stopLossRate === null
                            ? "border-gray-500 bg-gray-100"
                            : "border-gray-200 hover:border-gray-300 bg-white"
                        } disabled:opacity-50`}
                      >
                        <div className="font-bold text-gray-600">未設定</div>
                        <div className="text-xs text-gray-500">AIにお任せ</div>
                      </button>
                    </div>
                  </div>

                  {/* 説明 */}
                  <div className="bg-amber-50 rounded-xl p-4">
                    <p className="text-sm text-amber-800">
                      💡 設定した目標は全銘柄に適用されます。銘柄ごとに変更したい場合は、マイ銘柄の詳細画面から個別に設定できます。
                    </p>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
      <Footer />
      <BottomNavigation />
    </div>
  )
}
