"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface IndividualSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  stockId: string;
  stockName: string;
  avgPurchasePrice: number;
  initialTpRate: number | null;
  initialSlRate: number | null;
  onSuccess: (tpRate: number | null, slRate: number | null) => void;
  isNewAddition?: boolean;
}

export default function IndividualSettingsModal({
  isOpen,
  onClose,
  stockId,
  stockName,
  avgPurchasePrice,
  initialTpRate,
  initialSlRate,
  onSuccess,
  isNewAddition = false,
}: IndividualSettingsModalProps) {
  const router = useRouter();

  // ユーザー入力（％）
  const [tpRate, setTpRate] = useState<string>("");
  const [slRate, setSlRate] = useState<string>("");

  // 表示用（価格）
  const [tpPriceHint, setTpPriceHint] = useState<number | null>(null);
  const [slPriceHint, setSlPriceHint] = useState<number | null>(null);

  const [saving, setSaving] = useState(false);

  // 初期値のセット
  useEffect(() => {
    if (isOpen) {
      setTpRate(initialTpRate != null ? String(initialTpRate) : "");
      setSlRate(initialSlRate != null ? String(initialSlRate) : "");
    }
  }, [isOpen, initialTpRate, initialSlRate]);

  // 目安価格の計算
  useEffect(() => {
    if (avgPurchasePrice > 0) {
      if (tpRate && !isNaN(Number(tpRate))) {
        setTpPriceHint(
          Math.round(avgPurchasePrice * (1 + Number(tpRate) / 100)),
        );
      } else {
        setTpPriceHint(null);
      }

      if (slRate && !isNaN(Number(slRate))) {
        setSlPriceHint(
          Math.round(avgPurchasePrice * (1 + Number(slRate) / 100)),
        );
      } else {
        setSlPriceHint(null);
      }
    }
  }, [tpRate, slRate, avgPurchasePrice]);

  if (!isOpen) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      const tpRateValue = tpRate ? Number(tpRate) : null;
      const slRateValue = slRate ? Number(slRate) : null;

      const response = await fetch(`/api/user-stocks/${stockId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          takeProfitRate: tpRateValue,
          stopLossRate: slRateValue,
        }),
      });

      if (!response.ok) {
        throw new Error("保存に失敗しました");
      }

      toast.success("設定を保存しました");
      onSuccess(tpRateValue, slRateValue);
      router.refresh();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error("保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-lg font-bold text-gray-900">
            {isNewAddition ? "🎉 購入完了！" : "🎯 利確・損切り設定"}
          </h3>
          {!isNewAddition && (
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>

        <div className="mb-4">
          <p className="text-sm font-semibold text-blue-600 mb-1">
            {stockName}
          </p>
          <p className="text-xs text-gray-500 mb-2">
            平均取得単価: ¥{avgPurchasePrice.toLocaleString()}
          </p>
          <p className="text-sm text-gray-600">
            {isNewAddition
              ? "目標ラインを％で指定してください。目安となる株価がリアルタイムに表示されます。"
              : "この銘柄固有の売却ラインを％で設定します。"}
          </p>
        </div>

        <div className="space-y-5 mb-6">
          {/* 利確設定 */}
          <div className="p-3 bg-green-50/50 rounded-lg border border-green-100">
            <label className="block text-sm font-bold text-green-800 mb-2">
              利確設定
            </label>
            <div>
              <label className="block text-[10px] text-gray-500 uppercase font-bold mb-1">
                目標利益率
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.1"
                  value={tpRate}
                  onChange={(e) => setTpRate(e.target.value)}
                  placeholder="+10"
                  className="w-full pr-7 pl-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
                  %
                </span>
              </div>
            </div>
            {tpPriceHint && (
              <p className="mt-2 text-[11px] text-green-700 font-medium">
                → 目安株価:{" "}
                <span className="font-bold underline decoration-green-300">
                  ¥{tpPriceHint.toLocaleString()}
                </span>
                <br />
                <span className="text-[10px] text-gray-400 font-normal">
                  (利益: +{(tpPriceHint - avgPurchasePrice).toLocaleString()}円)
                </span>
              </p>
            )}
          </div>

          {/* 損切り設定 */}
          <div className="p-3 bg-red-50/50 rounded-lg border border-red-100">
            <label className="block text-sm font-bold text-red-800 mb-2">
              損切り設定
            </label>
            <div>
              <label className="block text-[10px] text-gray-500 uppercase font-bold mb-1">
                許容損失率
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.1"
                  value={slRate}
                  onChange={(e) => setSlRate(e.target.value)}
                  placeholder="-5"
                  className="w-full pr-7 pl-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-red-500 focus:border-red-500 text-sm"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
                  %
                </span>
              </div>
            </div>
            {slPriceHint && (
              <p className="mt-2 text-[11px] text-red-700 font-medium">
                → 目安株価:{" "}
                <span className="font-bold underline decoration-red-300">
                  ¥{slPriceHint.toLocaleString()}
                </span>
                <br />
                <span className="text-[10px] text-gray-400 font-normal">
                  (損失: -{(avgPurchasePrice - slPriceHint).toLocaleString()}円)
                </span>
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          {!isNewAddition && (
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm"
            >
              キャンセル
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className={`flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-bold text-sm ${isNewAddition ? "w-full" : ""}`}
          >
            {saving
              ? "保存中..."
              : isNewAddition
                ? "この内容で設定を完了する"
                : "保存する"}
          </button>
        </div>

        {isNewAddition && (
          <button
            onClick={onClose}
            className="w-full mt-3 text-sm text-gray-500 hover:text-gray-700 text-center"
          >
            今は設定しない
          </button>
        )}
      </div>
    </div>
  );
}
