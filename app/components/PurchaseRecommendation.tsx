"use client";

import { useEffect, useState } from "react";
import AnalysisTimestamp from "./AnalysisTimestamp";
import { UPDATE_SCHEDULES } from "@/lib/constants";

interface PurchaseRecommendationProps {
  stockId: string;
  onAnalysisDateLoaded?: (date: string | null) => void;
}

interface RecommendationData {
  stockId: string;
  stockName: string;
  tickerCode: string;
  currentPrice: number | null;
  marketSignal: string | null;
  // A. 価格帯予測
  shortTermTrend?: string | null;
  shortTermPriceLow?: number | null;
  shortTermPriceHigh?: number | null;
  shortTermText?: string | null;
  midTermTrend?: string | null;
  midTermPriceLow?: number | null;
  midTermPriceHigh?: number | null;
  midTermText?: string | null;
  longTermTrend?: string | null;
  longTermPriceLow?: number | null;
  longTermPriceHigh?: number | null;
  longTermText?: string | null;
  advice?: string | null;
  // B. 購入判断
  recommendation: "buy" | "stay" | "avoid";
  confidence: number;
  reason: string;
  caution: string;
  // C. 深掘り評価
  positives?: string | null;
  concerns?: string | null;
  suitableFor?: string | null;
  // D. 買い時条件
  buyCondition?: string | null;
  // E. パーソナライズ
  userFitScore?: number | null;
  budgetFit?: boolean | null;
  periodFit?: boolean | null;
  riskFit?: boolean | null;
  personalizedReason?: string | null;
  analyzedAt: string;
  // AI推奨価格
  limitPrice?: number | null;
  stopLossPrice?: number | null;
  // 購入タイミング
  buyTiming?: "market" | "dip" | null;
  dipTargetPrice?: number | null;
  // 売りタイミング（avoid時）
  sellTiming?: "market" | "rebound" | null;
  sellTargetPrice?: number | null;
}

function AvoidSellTimingSection({
  sellTiming,
  sellTargetPrice,
}: {
  sellTiming?: string | null;
  sellTargetPrice?: number | null;
}) {
  if (!sellTiming) return null;

  if (sellTiming === "market") {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-semibold">
            即見送り推奨
          </span>
        </div>
        <p className="text-sm text-red-800">
          テクニカル的にも見送りに適したタイミングです。
        </p>
      </div>
    );
  }

  if (sellTiming === "rebound") {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-xs font-semibold">
            反発後に判断
          </span>
        </div>
        <p className="text-sm text-yellow-800">
          {sellTargetPrice
            ? `現在売られすぎの状態です。${sellTargetPrice.toLocaleString()}円付近まで反発を待ってから再判断するのがおすすめです。`
            : "現在売られすぎの状態です。反発を待ってから再判断するのがおすすめです。"}
        </p>
      </div>
    );
  }

  return null;
}

export default function PurchaseRecommendation({
  stockId,
  onAnalysisDateLoaded,
}: PurchaseRecommendationProps) {
  const [data, setData] = useState<RecommendationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [noData, setNoData] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchRecommendation() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/stocks/${stockId}/purchase-recommendation`,
      );

      if (response.status === 404) {
        setNoData(true);
        onAnalysisDateLoaded?.(null);
        return;
      }

      if (!response.ok) {
        throw new Error("購入判断の取得に失敗しました");
      }

      const result = await response.json();
      setData(result);
      setNoData(false);
      onAnalysisDateLoaded?.(result.analyzedAt || null);
    } catch (err) {
      console.error("Error fetching purchase recommendation:", err);
      setError("購入判断の取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  async function generateRecommendation() {
    setGenerating(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/stocks/${stockId}/purchase-recommendation`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        },
      );

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "分析の生成に失敗しました");
      }

      const result = await response.json();
      setData(result);
      setNoData(false);
    } catch (err) {
      console.error("Error generating purchase recommendation:", err);
      setError(err instanceof Error ? err.message : "分析に失敗しました");
    } finally {
      setGenerating(false);
    }
  }

  useEffect(() => {
    fetchRecommendation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stockId]);

  if (loading) {
    return (
      <div>
        <div className="flex items-center justify-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="ml-3 text-sm text-gray-600">読み込み中...</p>
        </div>
      </div>
    );
  }

  // 分析中の場合
  if (generating) {
    return (
      <div>
        <div className="bg-gray-50 rounded-lg p-6 text-center">
          <div className="text-4xl mb-3">📊</div>
          <p className="text-sm text-gray-600 mb-4">
            AIが購入判断を分析中です...
          </p>
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-400 text-white text-sm font-medium rounded-lg cursor-not-allowed">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            分析中...
          </div>
        </div>
      </div>
    );
  }

  if (noData && !data) {
    return (
      <div>
        <div className="bg-gray-50 rounded-lg p-6 text-center">
          <div className="text-4xl mb-3">📊</div>
          <p className="text-sm text-gray-600 mb-4">
            購入判断はまだ生成されていません
          </p>
          <button
            onClick={generateRecommendation}
            disabled={generating}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed transition-colors"
          >
            {generating ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                分析中...
              </>
            ) : (
              <>
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                  />
                </svg>
                今すぐ分析する
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div>
        <div className="bg-gray-50 rounded-lg p-6 text-center">
          <div className="text-4xl mb-3">📊</div>
          <p className="text-sm text-gray-600">
            {error || "データがありません"}
          </p>
        </div>
      </div>
    );
  }

  // 信頼度パーセンテージ
  const confidencePercent = Math.round(data.confidence * 100);

  const getTrendIcon = (trend: string | null | undefined) => {
    switch (trend) {
      case "up":
        return "📈";
      case "down":
        return "📉";
      default:
        return "📊";
    }
  };

  const getTrendText = (trend: string | null | undefined) => {
    switch (trend) {
      case "up":
        return "上昇傾向";
      case "down":
        return "下降傾向";
      default:
        return "横ばい";
    }
  };

  const formatPrice = (price: number) => {
    return price.toLocaleString("ja-JP", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  };

  const getMarketSignalBadge = (signal: string | null | undefined) => {
    if (!signal) return null;
    const signalMap: Record<
      string,
      { text: string; bgColor: string; textColor: string; icon: string }
    > = {
      bullish: {
        text: "上昇優勢",
        bgColor: "bg-green-100",
        textColor: "text-green-700",
        icon: "↑",
      },
      neutral: {
        text: "横ばい",
        bgColor: "bg-gray-100",
        textColor: "text-gray-600",
        icon: "→",
      },
      bearish: {
        text: "下落優勢",
        bgColor: "bg-red-100",
        textColor: "text-red-700",
        icon: "↓",
      },
    };
    const badge = signalMap[signal];
    if (!badge) return null;
    return (
      <span
        className={`inline-flex items-center gap-0.5 px-2 py-0.5 ${badge.bgColor} ${badge.textColor} rounded-full text-xs font-medium`}
      >
        <span>{badge.icon}</span>
        <span>{badge.text}</span>
      </span>
    );
  };

  const MarketSignalRow = () => {
    if (!data?.marketSignal) return null;
    return (
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-gray-500">マーケットシグナル</span>
        {getMarketSignalBadge(data.marketSignal)}
      </div>
    );
  };

  // 価格帯予測セクション（A）
  const PredictionSection = () => {
    const hasPrediction =
      data?.shortTermTrend || data?.midTermTrend || data?.longTermTrend;
    if (!hasPrediction) return null;

    return (
      <div className="space-y-3 mb-4">
        {/* 短期予測 */}
        <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-lg p-3 sm:p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">{getTrendIcon(data.shortTermTrend)}</span>
            <div className="flex-1">
              <p className="text-sm font-bold text-purple-800">
                短期予測（今週）
              </p>
              {data.shortTermPriceLow && data.shortTermPriceHigh && (
                <p className="text-xs text-purple-600">
                  {getTrendText(data.shortTermTrend)} ¥
                  {formatPrice(data.shortTermPriceLow)}〜¥
                  {formatPrice(data.shortTermPriceHigh)}
                </p>
              )}
            </div>
          </div>
          {data.shortTermText && (
            <p className="text-sm text-gray-700">{data.shortTermText}</p>
          )}
        </div>

        {/* 中期予測 */}
        <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg p-3 sm:p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">{getTrendIcon(data.midTermTrend)}</span>
            <div className="flex-1">
              <p className="text-sm font-bold text-blue-800">
                中期予測（今月）
              </p>
              {data.midTermPriceLow && data.midTermPriceHigh && (
                <p className="text-xs text-blue-600">
                  {getTrendText(data.midTermTrend)} ¥
                  {formatPrice(data.midTermPriceLow)}〜¥
                  {formatPrice(data.midTermPriceHigh)}
                </p>
              )}
            </div>
          </div>
          {data.midTermText && (
            <p className="text-sm text-gray-700">{data.midTermText}</p>
          )}
        </div>

        {/* 長期予測 */}
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-lg p-3 sm:p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">{getTrendIcon(data.longTermTrend)}</span>
            <div className="flex-1">
              <p className="text-sm font-bold text-emerald-800">
                長期予測（今後3ヶ月）
              </p>
              {data.longTermPriceLow && data.longTermPriceHigh && (
                <p className="text-xs text-emerald-600">
                  {getTrendText(data.longTermTrend)} ¥
                  {formatPrice(data.longTermPriceLow)}〜¥
                  {formatPrice(data.longTermPriceHigh)}
                </p>
              )}
            </div>
          </div>
          {data.longTermText && (
            <p className="text-sm text-gray-700">{data.longTermText}</p>
          )}
        </div>

        {/* 総合アドバイス */}
        {data.advice && (
          <div className="bg-white border border-gray-200 rounded-lg p-3">
            <p className="text-xs font-semibold text-gray-600 mb-1">
              💡 予測まとめ
            </p>
            <p className="text-sm text-gray-700">{data.advice}</p>
          </div>
        )}
      </div>
    );
  };

  // AI推奨価格セクション（ウォッチリスト：指値 + 購入後の損切りライン）
  const AIPriceSection = () => {
    // 指値も損切りもない場合は非表示
    if (!data?.limitPrice && !data?.stopLossPrice) return null;

    const currentPrice = data.currentPrice;
    const limitPriceNum = data.limitPrice;
    const stopLossPriceNum = data.stopLossPrice;
    const priceDiff =
      currentPrice && limitPriceNum ? limitPriceNum - currentPrice : 0;
    // buy推奨時のみ「今が買い時」と表示する（stay/avoid時は矛盾を避けるため単なる指値として表示）
    // また「押し目買い推奨（dip）」の時に「成行で購入OK」と出ると矛盾するため、"market"の時のみとする
    const isNowBuyTime =
      data.recommendation === "buy" &&
      data.buyTiming === "market" &&
      currentPrice &&
      limitPriceNum &&
      Math.abs(priceDiff / currentPrice) < 0.01;

    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
        <p className="text-sm font-semibold text-gray-800 mb-2">
          🎯 AI推奨価格
        </p>
        <div className="grid grid-cols-2 gap-3">
          {/* 指値（買い） */}
          {limitPriceNum && (
            <div>
              <p className="text-xs text-gray-500">
                {isNowBuyTime ? "今が買い時" : "指値（買い）"}
              </p>
              <p className="text-base font-bold text-green-600">
                {isNowBuyTime
                  ? "成行で購入OK"
                  : `${limitPriceNum.toLocaleString()}円`}
              </p>
              {!isNowBuyTime && currentPrice && priceDiff < 0 && (
                <p className="text-xs text-yellow-600">
                  あと{Math.abs(priceDiff).toLocaleString()}円下落で到達
                </p>
              )}
            </div>
          )}
          {/* 損切りライン（購入後の参考） */}
          {stopLossPriceNum && (
            <div>
              <p className="text-xs text-gray-500">損切りライン</p>
              <p className="text-base font-bold text-red-600">
                {stopLossPriceNum.toLocaleString()}円
              </p>
              <p className="text-xs text-gray-400">購入後の逆指値目安</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  // 深掘り評価セクション（B）
  const DeepEvaluationSection = () => {
    if (!data?.positives && !data?.concerns && !data?.suitableFor) return null;
    return (
      <div className="mb-4 space-y-3">
        {/* 良いところ */}
        {data.positives && (
          <div className="bg-green-50 border-l-4 border-green-400 p-3">
            <p className="text-xs font-semibold text-green-700 mb-2">
              良いところ
            </p>
            <div className="text-sm text-green-800 whitespace-pre-line">
              {data.positives}
            </div>
          </div>
        )}

        {/* 不安な点 */}
        {data.concerns && (
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3">
            <p className="text-xs font-semibold text-yellow-700 mb-2">
              不安な点
            </p>
            <div className="text-sm text-yellow-800 whitespace-pre-line">
              {data.concerns}
            </div>
          </div>
        )}

        {/* こんな人向け */}
        {data.suitableFor && (
          <div className="bg-blue-50 border-l-4 border-blue-400 p-3">
            <p className="text-xs font-semibold text-blue-700 mb-2">
              こんな人におすすめ
            </p>
            <p className="text-sm text-blue-800">{data.suitableFor}</p>
          </div>
        )}
      </div>
    );
  };

  // パーソナライズセクション（D）
  const PersonalizedSection = () => {
    if (data?.userFitScore == null && !data?.personalizedReason) return null;
    return (
      <div className="bg-purple-50 rounded-lg p-3 sm:p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-purple-800 flex items-center gap-2">
            <span className="text-lg">🎯</span>
            あなたへのおすすめ度
          </span>
          {data?.userFitScore != null && (
            <span
              className={`px-3 py-1 rounded-full text-sm font-bold ${
                data.userFitScore >= 70
                  ? "bg-green-100 text-green-800"
                  : data.userFitScore >= 40
                    ? "bg-yellow-100 text-yellow-800"
                    : "bg-gray-100 text-gray-800"
              }`}
            >
              {data.userFitScore}点
            </span>
          )}
        </div>

        {/* マッチ状態 */}
        <div className="flex gap-2 mb-2">
          {data.budgetFit !== null && (
            <span
              className={`px-2 py-0.5 rounded text-xs ${
                data.budgetFit
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-700"
              }`}
            >
              {data.budgetFit ? "予算内" : "予算オーバー"}
            </span>
          )}
          {data.periodFit !== null && (
            <span
              className={`px-2 py-0.5 rounded text-xs ${
                data.periodFit
                  ? "bg-green-100 text-green-700"
                  : "bg-yellow-100 text-yellow-700"
              }`}
            >
              {data.periodFit ? "期間マッチ" : "期間ミスマッチ"}
            </span>
          )}
          {data.riskFit !== null && (
            <span
              className={`px-2 py-0.5 rounded text-xs ${
                data.riskFit
                  ? "bg-green-100 text-green-700"
                  : "bg-yellow-100 text-yellow-700"
              }`}
            >
              {data.riskFit ? "リスク適合" : "リスク注意"}
            </span>
          )}
        </div>

        <p className="text-sm text-purple-700">{data.personalizedReason}</p>
      </div>
    );
  };

  // 購入タイミングセクション（buy推奨時のみ）
  const BuyTimingSection = () => {
    if (data?.recommendation !== "buy" || !data?.buyTiming) return null;

    if (data.buyTiming === "market") {
      return (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">
              成り行き購入OK
            </span>
          </div>
          <p className="text-sm text-gray-700">
            移動平均線に近く、過熱感もありません。現在の価格帯での購入が検討できます。
          </p>
        </div>
      );
    }

    if (data.buyTiming === "dip") {
      return (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800">
              押し目買い推奨
            </span>
          </div>
          {data.dipTargetPrice && (
            <p className="text-sm text-gray-700 mb-2">
              25日移動平均線の
              <span className="font-bold">
                ¥{formatPrice(data.dipTargetPrice)}
              </span>
              付近まで待つとより有利です。
            </p>
          )}
          <p className="text-xs text-gray-500">
            💡
            押し目買いとは、上昇トレンドの銘柄が一時的に下落したタイミングで購入する戦略です。移動平均線は過去25日間の平均価格で、株価の基準となる指標です。
          </p>
        </div>
      );
    }

    return null;
  };

  // ヘッダーコンポーネント
  const ReanalyzeHeader = () => (
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-base font-bold text-gray-800">AI購入判断</h3>
      <button
        onClick={generateRecommendation}
        disabled={generating}
        className="text-sm text-blue-600 hover:text-blue-800 disabled:text-gray-400 disabled:cursor-not-allowed flex items-center gap-1"
      >
        {generating ? (
          <>
            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600"></div>
            分析中...
          </>
        ) : (
          <>
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            再分析する
          </>
        )}
      </button>
    </div>
  );

  // 買い推奨
  if (data.recommendation === "buy") {
    return (
      <div>
        <ReanalyzeHeader />
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg shadow-md p-4 sm:p-6 mb-4">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-2xl">💡</span>
            <h3 className="text-base sm:text-lg font-bold text-green-800">
              購入を検討できるタイミングです
            </h3>
          </div>

          <p className="text-sm text-gray-700 mb-4">{data.reason}</p>

          {/* 購入タイミング */}
          <BuyTimingSection />

          {/* D. パーソナライズ */}
          <PersonalizedSection />

          {/* B. 深掘り評価 */}
          <DeepEvaluationSection />

          <div className="bg-amber-50 border-l-4 border-amber-400 p-3 mb-4">
            <p className="text-xs text-amber-800">⚠️ {data.caution}</p>
          </div>

          <MarketSignalRow />

          <div className="flex items-center gap-2 mb-3">
            <div className="flex-1 bg-gray-200 rounded-full h-2">
              <div
                className="bg-green-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${confidencePercent}%` }}
              />
            </div>
            <span className="text-xs text-gray-600 whitespace-nowrap">
              信頼度 {confidencePercent}%
            </span>
          </div>

          <div className="text-center space-y-1">
            <AnalysisTimestamp dateString={data.analyzedAt} />
            <p className="text-xs text-gray-400">
              更新 {UPDATE_SCHEDULES.STOCK_ANALYSIS}（平日）
            </p>
          </div>
        </div>
        {/* AI推奨価格 */}
        <AIPriceSection />
        {/* A. 価格帯予測 */}
        <PredictionSection />
      </div>
    );
  }

  // 見送り推奨（avoid）
  if (data.recommendation === "avoid") {
    return (
      <div>
        <ReanalyzeHeader />
        <div className="bg-gradient-to-br from-red-50 to-rose-50 rounded-lg shadow-md p-4 sm:p-6 mb-4">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-2xl">🚫</span>
            <h3 className="text-base sm:text-lg font-bold text-red-800">
              見送りをおすすめします
            </h3>
          </div>

          <p className="text-sm text-gray-700 mb-4">{data.reason}</p>

          <div className="bg-red-100 border-l-4 border-red-500 p-3 mb-4">
            <p className="text-xs text-red-800 font-semibold">
              この銘柄はリスクが高く、回復の見込みが低いと判断しました。
              ウォッチリストから外すことを検討してください。
            </p>
          </div>

          {/* B. 深掘り評価 */}
          <DeepEvaluationSection />

          {/* 売りタイミング */}
          <AvoidSellTimingSection
            sellTiming={data.sellTiming}
            sellTargetPrice={data.sellTargetPrice}
          />

          <div className="bg-amber-50 border-l-4 border-amber-400 p-3 mb-4">
            <p className="text-xs text-amber-800">⚠️ {data.caution}</p>
          </div>

          <MarketSignalRow />

          <div className="flex items-center gap-2 mb-3">
            <div className="flex-1 bg-gray-200 rounded-full h-2">
              <div
                className="bg-red-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${confidencePercent}%` }}
              />
            </div>
            <span className="text-xs text-gray-600 whitespace-nowrap">
              信頼度 {confidencePercent}%
            </span>
          </div>

          <div className="text-center space-y-1">
            <AnalysisTimestamp dateString={data.analyzedAt} />
            <p className="text-xs text-gray-400">
              更新 {UPDATE_SCHEDULES.STOCK_ANALYSIS}（平日）
            </p>
          </div>
        </div>
        {/* AI推奨価格 */}
        <AIPriceSection />
        {/* A. 価格帯予測 */}
        <PredictionSection />
      </div>
    );
  }

  // 様子見（stayまたはそれ以外のフォールバック）
  return (
    <div>
      <ReanalyzeHeader />
      <div className="bg-gradient-to-br from-blue-50 to-sky-50 rounded-lg shadow-md p-4 sm:p-6 mb-4">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-2xl">⏳</span>
          <h3 className="text-base sm:text-lg font-bold text-blue-800">
            もう少し様子を見ましょう
          </h3>
        </div>

        <p className="text-sm text-gray-700 mb-4">{data.reason}</p>

        {/* D. パーソナライズ */}
        <PersonalizedSection />

        <div className="bg-blue-50 border-l-4 border-blue-400 p-3 mb-4">
          <p className="text-xs text-blue-800">
            💡 今は焦らず、タイミングを待ちましょう
          </p>
        </div>

        {/* C. 買い時条件 */}
        {data.buyCondition && (
          <div className="bg-emerald-50 border-l-4 border-emerald-400 p-3 mb-4">
            <p className="text-xs font-semibold text-emerald-700 mb-2">
              📈 こうなったら買い時
            </p>
            <p className="text-sm text-emerald-800">{data.buyCondition}</p>
          </div>
        )}

        {/* B. 深掘り評価 */}
        <DeepEvaluationSection />

        <div className="bg-amber-50 border-l-4 border-amber-400 p-3 mb-4">
          <p className="text-xs text-amber-800">⚠️ {data.caution}</p>
        </div>

        <MarketSignalRow />

        <div className="flex items-center gap-2 mb-3">
          <div className="flex-1 bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${confidencePercent}%` }}
            />
          </div>
          <span className="text-xs text-gray-600 whitespace-nowrap">
            信頼度 {confidencePercent}%
          </span>
        </div>

        <div className="text-center space-y-1">
          <AnalysisTimestamp dateString={data.analyzedAt} />
          <p className="text-xs text-gray-400">
            更新 {UPDATE_SCHEDULES.STOCK_ANALYSIS}（平日）
          </p>
        </div>
      </div>
      {/* AI推奨価格 */}
      <AIPriceSection />
      {/* A. 価格帯予測 */}
      <PredictionSection />
    </div>
  );
}
