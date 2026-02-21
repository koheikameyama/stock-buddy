"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import Footer from "@/app/components/Footer";
import BottomNavigation from "@/app/components/BottomNavigation";
import BackButton from "@/app/components/BackButton";
import { UPDATE_SCHEDULES } from "@/lib/constants";

type PushSubscriptionState = {
  supported: boolean;
  subscribed: boolean;
  loading: boolean;
};

type UserSettings = {
  investmentPeriod: string | null;
  riskTolerance: string | null;
  investmentBudget: number | null;
  targetReturnRate: number | null;
  stopLossRate: number | null;
};

const TARGET_RETURN_OPTIONS = [
  { value: 5, label: "+5%", description: "安定志向" },
  { value: 10, label: "+10%", description: "バランス型" },
  { value: 15, label: "+15%", description: "やや積極的" },
  { value: 20, label: "+20%", description: "積極的" },
  { value: 30, label: "+30%", description: "長期・ハイリターン" },
];

const STOP_LOSS_OPTIONS = [
  { value: -5, label: "-5%", description: "慎重派" },
  { value: -10, label: "-10%", description: "バランス型" },
  { value: -15, label: "-15%", description: "中長期" },
  { value: -20, label: "-20%", description: "長期・変動許容" },
];

const INVESTMENT_PERIOD_OPTIONS = [
  { value: "short", label: "短期", description: "〜1年", icon: "📅" },
  { value: "medium", label: "中期", description: "1〜3年", icon: "📆" },
  { value: "long", label: "長期", description: "3年〜", icon: "🗓️" },
];

const RISK_TOLERANCE_OPTIONS = [
  { value: "low", label: "低", description: "安定重視", icon: "🛡️" },
  { value: "medium", label: "中", description: "バランス", icon: "⚖️" },
  { value: "high", label: "高", description: "成長重視", icon: "🚀" },
];

const BUDGET_OPTIONS = [
  { value: 100000, label: "10万円", description: "少額から" },
  { value: 300000, label: "30万円", description: "手軽に" },
  { value: 500000, label: "50万円", description: "しっかり" },
  { value: 1000000, label: "100万円", description: "本格的に" },
];

export default function SettingsPage() {
  const [pushState, setPushState] = useState<PushSubscriptionState>({
    supported: false,
    subscribed: false,
    loading: true,
  });
  const [settings, setSettings] = useState<UserSettings>({
    investmentPeriod: null,
    riskTolerance: null,
    investmentBudget: null,
    targetReturnRate: null,
    stopLossRate: null,
  });
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [showCustomBudget, setShowCustomBudget] = useState(false);
  const [customBudgetText, setCustomBudgetText] = useState("");
  const [showCustomTargetReturn, setShowCustomTargetReturn] = useState(false);
  const [customTargetReturnText, setCustomTargetReturnText] = useState("");
  const [showCustomStopLoss, setShowCustomStopLoss] = useState(false);
  const [customStopLossText, setCustomStopLossText] = useState("");

  useEffect(() => {
    checkPushNotificationStatus();
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch("/api/settings");
      if (response.ok) {
        const data = await response.json();
        if (data.settings) {
          setSettings({
            investmentPeriod: data.settings.investmentPeriod,
            riskTolerance: data.settings.riskTolerance,
            investmentBudget: data.settings.investmentBudget,
            targetReturnRate: data.settings.targetReturnRate,
            stopLossRate: data.settings.stopLossRate,
          });
          // プリセット以外の金額が設定されていればカスタム入力を表示
          const budget = data.settings.investmentBudget;
          if (
            budget !== null &&
            !BUDGET_OPTIONS.some((o) => o.value === budget)
          ) {
            setShowCustomBudget(true);
            setCustomBudgetText(String(Math.round(budget / 10000)));
          }
          // プリセット以外の利確ラインが設定されていればカスタム入力を表示
          const targetReturn = data.settings.targetReturnRate;
          if (
            targetReturn !== null &&
            !TARGET_RETURN_OPTIONS.some((o) => o.value === targetReturn)
          ) {
            setShowCustomTargetReturn(true);
            setCustomTargetReturnText(String(targetReturn));
          }
          // プリセット以外の損切りラインが設定されていればカスタム入力を表示
          const stopLoss = data.settings.stopLossRate;
          if (
            stopLoss !== null &&
            !STOP_LOSS_OPTIONS.some((o) => o.value === stopLoss)
          ) {
            setShowCustomStopLoss(true);
            setCustomStopLossText(String(Math.abs(stopLoss)));
          }
        }
      }
    } catch (error) {
      console.error("Error fetching settings:", error);
    } finally {
      setSettingsLoading(false);
    }
  };

  const handleCustomBudgetSave = () => {
    const 万円 = parseInt(customBudgetText, 10);
    if (!isNaN(万円) && 万円 > 0) {
      saveSettings({ investmentBudget: 万円 * 10000 });
    }
  };

  const handleCustomTargetReturnSave = () => {
    const val = parseFloat(customTargetReturnText);
    if (!isNaN(val) && val > 0) {
      saveSettings({ targetReturnRate: val });
    }
  };

  const handleCustomStopLossSave = () => {
    const val = parseFloat(customStopLossText);
    if (!isNaN(val) && val > 0) {
      // 損切りは必ず負の値で保存
      saveSettings({ stopLossRate: -Math.abs(val) });
    }
  };

  const saveSettings = async (updates: Partial<UserSettings>) => {
    setSavingSettings(true);
    try {
      const newSettings = { ...settings, ...updates };

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
      });

      if (response.ok) {
        setSettings(newSettings);
        toast.success("設定を保存しました");
      } else {
        toast.error("設定の保存に失敗しました");
      }
    } catch (error) {
      console.error("Error saving settings:", error);
      toast.error("設定の保存に失敗しました");
    } finally {
      setSavingSettings(false);
    }
  };

  const checkPushNotificationStatus = async () => {
    try {
      // Check if push notifications are supported
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setPushState({ supported: false, subscribed: false, loading: false });
        return;
      }

      // Register service worker
      const registration = await navigator.serviceWorker.register("/sw.js");

      // Check if already subscribed
      const subscription = await registration.pushManager.getSubscription();

      setPushState({
        supported: true,
        subscribed: !!subscription,
        loading: false,
      });
    } catch (error) {
      console.error("Error checking push notification status:", error);
      setPushState({ supported: false, subscribed: false, loading: false });
    }
  };

  const togglePushNotifications = async () => {
    try {
      setPushState({ ...pushState, loading: true });

      const registration = await navigator.serviceWorker.ready;

      if (pushState.subscribed) {
        // Unsubscribe
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          await subscription.unsubscribe();
          await fetch("/api/push/subscribe", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: subscription.endpoint }),
          });
        }
        setPushState({ ...pushState, subscribed: false, loading: false });
        toast.success("プッシュ通知をオフにしました");
      } else {
        // Subscribe
        const response = await fetch("/api/push/subscribe");
        const { publicKey } = await response.json();

        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: publicKey,
        });

        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(subscription.toJSON()),
        });

        setPushState({ ...pushState, subscribed: true, loading: false });
        toast.success("プッシュ通知をオンにしました");
      }
    } catch (error) {
      console.error("Error toggling push notifications:", error);
      toast.error("プッシュ通知の設定に失敗しました");
      setPushState({ ...pushState, loading: false });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      {/* シンプルなヘッダー */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center gap-2">
            <Link href="/dashboard" className="flex items-center gap-2">
              <span className="text-2xl">📊</span>
              <span className="text-xl font-bold text-gray-900">
                Stock Buddy
              </span>
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
                  <span>
                    <strong>{UPDATE_SCHEDULES.STOCK_ANALYSIS}</strong> -
                    ポートフォリオ分析・購入レコメンド（平日）
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span>•</span>
                  <span>
                    <strong>{UPDATE_SCHEDULES.PERSONAL_RECOMMENDATIONS}</strong>{" "}
                    - あなたへのおすすめ更新（平日）
                  </span>
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
                          onClick={() =>
                            saveSettings({ investmentPeriod: option.value })
                          }
                          disabled={savingSettings}
                          className={`p-3 rounded-lg border-2 text-center transition-all ${
                            settings.investmentPeriod === option.value
                              ? "border-blue-500 bg-blue-50"
                              : "border-gray-200 hover:border-gray-300 bg-white"
                          } disabled:opacity-50`}
                        >
                          <div className="text-lg mb-1">{option.icon}</div>
                          <div
                            className={`font-bold text-sm ${
                              settings.investmentPeriod === option.value
                                ? "text-blue-600"
                                : "text-gray-900"
                            }`}
                          >
                            {option.label}
                          </div>
                          <div className="text-xs text-gray-500">
                            {option.description}
                          </div>
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
                          onClick={() =>
                            saveSettings({ riskTolerance: option.value })
                          }
                          disabled={savingSettings}
                          className={`p-3 rounded-lg border-2 text-center transition-all ${
                            settings.riskTolerance === option.value
                              ? "border-blue-500 bg-blue-50"
                              : "border-gray-200 hover:border-gray-300 bg-white"
                          } disabled:opacity-50`}
                        >
                          <div className="text-lg mb-1">{option.icon}</div>
                          <div
                            className={`font-bold text-sm ${
                              settings.riskTolerance === option.value
                                ? "text-blue-600"
                                : "text-gray-900"
                            }`}
                          >
                            {option.label}
                          </div>
                          <div className="text-xs text-gray-500">
                            {option.description}
                          </div>
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
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {BUDGET_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          onClick={() => {
                            setShowCustomBudget(false);
                            saveSettings({ investmentBudget: option.value });
                          }}
                          disabled={savingSettings}
                          className={`p-3 rounded-lg border-2 text-center transition-all ${
                            settings.investmentBudget === option.value &&
                            !showCustomBudget
                              ? "border-blue-500 bg-blue-50"
                              : "border-gray-200 hover:border-gray-300 bg-white"
                          } disabled:opacity-50`}
                        >
                          <div
                            className={`font-bold text-sm ${
                              settings.investmentBudget === option.value &&
                              !showCustomBudget
                                ? "text-blue-600"
                                : "text-gray-900"
                            }`}
                          >
                            {option.label}
                          </div>
                          <div className="text-xs text-gray-500">
                            {option.description}
                          </div>
                        </button>
                      ))}
                      <button
                        onClick={() => {
                          setShowCustomBudget(true);
                          setCustomBudgetText(
                            settings.investmentBudget &&
                              !BUDGET_OPTIONS.some(
                                (o) => o.value === settings.investmentBudget,
                              )
                              ? String(
                                  Math.round(settings.investmentBudget / 10000),
                                )
                              : "",
                          );
                        }}
                        disabled={savingSettings}
                        className={`p-3 rounded-lg border-2 text-center transition-all ${
                          showCustomBudget
                            ? "border-blue-500 bg-blue-50"
                            : "border-gray-200 hover:border-gray-300 bg-white"
                        } disabled:opacity-50`}
                      >
                        <div
                          className={`font-bold text-sm ${showCustomBudget ? "text-blue-600" : "text-gray-900"}`}
                        >
                          その他
                        </div>
                        <div className="text-xs text-gray-500">金額を入力</div>
                      </button>
                      <button
                        onClick={() => {
                          setShowCustomBudget(false);
                          saveSettings({ investmentBudget: null });
                        }}
                        disabled={savingSettings}
                        className={`p-3 rounded-lg border-2 text-center transition-all ${
                          settings.investmentBudget === null &&
                          !showCustomBudget
                            ? "border-gray-500 bg-gray-100"
                            : "border-gray-200 hover:border-gray-300 bg-white"
                        } disabled:opacity-50`}
                      >
                        <div className="font-bold text-sm text-gray-600">
                          未定
                        </div>
                        <div className="text-xs text-gray-500">
                          あとで決める
                        </div>
                      </button>
                    </div>

                    {/* カスタム金額入力欄 */}
                    {showCustomBudget && (
                      <div className="mt-3 flex items-center gap-2">
                        <div className="flex items-center gap-1 flex-1 bg-white border-2 border-blue-300 rounded-lg px-3 py-2 focus-within:border-blue-500 transition-colors">
                          <input
                            type="number"
                            min="1"
                            value={customBudgetText}
                            onChange={(e) =>
                              setCustomBudgetText(e.target.value)
                            }
                            onKeyDown={(e) =>
                              e.key === "Enter" && handleCustomBudgetSave()
                            }
                            placeholder="例: 150"
                            className="flex-1 outline-none text-sm font-semibold text-gray-900 bg-transparent min-w-0"
                          />
                          <span className="text-sm text-gray-500 shrink-0">
                            万円
                          </span>
                        </div>
                        <button
                          onClick={handleCustomBudgetSave}
                          disabled={
                            savingSettings ||
                            !customBudgetText ||
                            parseInt(customBudgetText) <= 0
                          }
                          className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
                        >
                          設定
                        </button>
                      </div>
                    )}
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
                          onClick={() => {
                            setShowCustomTargetReturn(false);
                            saveSettings({ targetReturnRate: option.value });
                          }}
                          disabled={savingSettings}
                          className={`p-3 rounded-lg border-2 text-left transition-all ${
                            settings.targetReturnRate === option.value &&
                            !showCustomTargetReturn
                              ? "border-green-500 bg-green-50"
                              : "border-gray-200 hover:border-gray-300 bg-white"
                          } disabled:opacity-50`}
                        >
                          <div
                            className={`font-bold ${
                              settings.targetReturnRate === option.value &&
                              !showCustomTargetReturn
                                ? "text-green-600"
                                : "text-gray-900"
                            }`}
                          >
                            {option.label}
                          </div>
                          <div className="text-xs text-gray-500">
                            {option.description}
                          </div>
                        </button>
                      ))}
                      <button
                        onClick={() => {
                          setShowCustomTargetReturn(true);
                          setCustomTargetReturnText(
                            settings.targetReturnRate !== null &&
                              !TARGET_RETURN_OPTIONS.some(
                                (o) => o.value === settings.targetReturnRate,
                              )
                              ? String(settings.targetReturnRate)
                              : "",
                          );
                        }}
                        disabled={savingSettings}
                        className={`p-3 rounded-lg border-2 text-left transition-all ${
                          showCustomTargetReturn
                            ? "border-green-500 bg-green-50"
                            : "border-gray-200 hover:border-gray-300 bg-white"
                        } disabled:opacity-50`}
                      >
                        <div
                          className={`font-bold text-sm ${
                            showCustomTargetReturn
                              ? "text-green-600"
                              : "text-gray-900"
                          }`}
                        >
                          その他
                        </div>
                        <div className="text-xs text-gray-500">数値を入力</div>
                      </button>
                      <button
                        onClick={() => {
                          setShowCustomTargetReturn(false);
                          saveSettings({ targetReturnRate: null });
                        }}
                        disabled={savingSettings}
                        className={`p-3 rounded-lg border-2 text-left transition-all ${
                          settings.targetReturnRate === null &&
                          !showCustomTargetReturn
                            ? "border-gray-500 bg-gray-100"
                            : "border-gray-200 hover:border-gray-300 bg-white"
                        } disabled:opacity-50`}
                      >
                        <div className="font-bold text-gray-600">設定なし</div>
                        <div className="text-xs text-gray-500">通知しない</div>
                      </button>
                    </div>
                    {/* カスタム利確ライン入力欄 */}
                    {showCustomTargetReturn && (
                      <div className="mt-3 flex items-center gap-2">
                        <div className="flex items-center gap-1 flex-1 bg-white border-2 border-green-300 rounded-lg px-3 py-2 focus-within:border-green-500 transition-colors">
                          <span className="text-sm text-gray-500 shrink-0">
                            +
                          </span>
                          <input
                            type="number"
                            min="0.1"
                            step="0.1"
                            value={customTargetReturnText}
                            onChange={(e) =>
                              setCustomTargetReturnText(e.target.value)
                            }
                            onKeyDown={(e) =>
                              e.key === "Enter" &&
                              handleCustomTargetReturnSave()
                            }
                            placeholder="例: 12"
                            className="flex-1 outline-none text-sm font-semibold text-gray-900 bg-transparent min-w-0"
                          />
                          <span className="text-sm text-gray-500 shrink-0">
                            %
                          </span>
                        </div>
                        <button
                          onClick={handleCustomTargetReturnSave}
                          disabled={
                            savingSettings ||
                            !customTargetReturnText ||
                            parseFloat(customTargetReturnText) <= 0
                          }
                          className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
                        >
                          設定
                        </button>
                      </div>
                    )}
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
                          onClick={() => {
                            setShowCustomStopLoss(false);
                            saveSettings({ stopLossRate: option.value });
                          }}
                          disabled={savingSettings}
                          className={`p-3 rounded-lg border-2 text-left transition-all ${
                            settings.stopLossRate === option.value &&
                            !showCustomStopLoss
                              ? "border-red-500 bg-red-50"
                              : "border-gray-200 hover:border-gray-300 bg-white"
                          } disabled:opacity-50`}
                        >
                          <div
                            className={`font-bold ${
                              settings.stopLossRate === option.value &&
                              !showCustomStopLoss
                                ? "text-red-600"
                                : "text-gray-900"
                            }`}
                          >
                            {option.label}
                          </div>
                          <div className="text-xs text-gray-500">
                            {option.description}
                          </div>
                        </button>
                      ))}
                      <button
                        onClick={() => {
                          setShowCustomStopLoss(true);
                          setCustomStopLossText(
                            settings.stopLossRate !== null &&
                              !STOP_LOSS_OPTIONS.some(
                                (o) => o.value === settings.stopLossRate,
                              )
                              ? String(Math.abs(settings.stopLossRate!))
                              : "",
                          );
                        }}
                        disabled={savingSettings}
                        className={`p-3 rounded-lg border-2 text-left transition-all ${
                          showCustomStopLoss
                            ? "border-red-500 bg-red-50"
                            : "border-gray-200 hover:border-gray-300 bg-white"
                        } disabled:opacity-50`}
                      >
                        <div
                          className={`font-bold text-sm ${
                            showCustomStopLoss
                              ? "text-red-600"
                              : "text-gray-900"
                          }`}
                        >
                          その他
                        </div>
                        <div className="text-xs text-gray-500">数値を入力</div>
                      </button>
                      <button
                        onClick={() => {
                          setShowCustomStopLoss(false);
                          saveSettings({ stopLossRate: null });
                        }}
                        disabled={savingSettings}
                        className={`p-3 rounded-lg border-2 text-left transition-all ${
                          settings.stopLossRate === null && !showCustomStopLoss
                            ? "border-gray-500 bg-gray-100"
                            : "border-gray-200 hover:border-gray-300 bg-white"
                        } disabled:opacity-50`}
                      >
                        <div className="font-bold text-gray-600">設定なし</div>
                        <div className="text-xs text-gray-500">通知しない</div>
                      </button>
                    </div>
                    {/* カスタム損切りライン入力欄 */}
                    {showCustomStopLoss && (
                      <div className="mt-3 flex items-center gap-2">
                        <div className="flex items-center gap-1 flex-1 bg-white border-2 border-red-300 rounded-lg px-3 py-2 focus-within:border-red-500 transition-colors">
                          <span className="text-sm text-gray-500 shrink-0">
                            -
                          </span>
                          <input
                            type="number"
                            min="0.1"
                            step="0.1"
                            value={customStopLossText}
                            onChange={(e) =>
                              setCustomStopLossText(e.target.value)
                            }
                            onKeyDown={(e) =>
                              e.key === "Enter" && handleCustomStopLossSave()
                            }
                            placeholder="例: 8"
                            className="flex-1 outline-none text-sm font-semibold text-gray-900 bg-transparent min-w-0"
                          />
                          <span className="text-sm text-gray-500 shrink-0">
                            %
                          </span>
                        </div>
                        <button
                          onClick={handleCustomStopLossSave}
                          disabled={
                            savingSettings ||
                            !customStopLossText ||
                            parseFloat(customStopLossText) <= 0
                          }
                          className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
                        >
                          設定
                        </button>
                      </div>
                    )}
                  </div>

                  {/* 説明 */}
                  <div className="bg-amber-50 rounded-xl p-4">
                    <p className="text-sm text-amber-800">
                      💡
                      設定した目標は全銘柄に適用されます。銘柄ごとに変更したい場合は、マイ銘柄の詳細画面から個別に設定できます。
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
  );
}
