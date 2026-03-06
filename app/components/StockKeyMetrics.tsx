"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import TermTooltip from "@/app/components/TermTooltip"

interface StockKeyMetricsProps {
  stock: {
    marketCap?: number | null
    dividendYield?: number | null
    per?: number | null
    pbr?: number | null
    roe?: number | null
    eps?: number | null
    exDividendDate?: string | null
    businessDescription?: string | null
  }
}

export default function StockKeyMetrics({ stock }: StockKeyMetricsProps) {
  const t = useTranslations("stocks.stockKeyMetrics")
  const tTooltip = useTranslations("stocks.tooltips")
  const [showFullDescription, setShowFullDescription] = useState(false)

  const {
    marketCap,
    dividendYield,
    per,
    pbr,
    roe,
    eps,
    exDividendDate,
    businessDescription,
  } = stock

  const hasAnyData =
    marketCap != null ||
    dividendYield != null ||
    per != null ||
    pbr != null ||
    roe != null ||
    eps != null ||
    exDividendDate != null ||
    businessDescription != null

  if (!hasAnyData) return null

  function formatMarketCap(value: number): string {
    if (value >= 10000) {
      return t("units.trillion", { value: (value / 10000).toFixed(1) })
    }
    return t("units.billion", { value: value.toFixed(0) })
  }

  function formatExDividendDate(dateStr: string): string {
    const date = new Date(dateStr)
    return `${date.getMonth() + 1}/${date.getDate()}`
  }

  // Build metric items
  const metrics: { label: string; value: string; tooltipId?: string; tooltipText?: string }[] = []

  if (marketCap != null) {
    metrics.push({
      label: t("marketCap.label"),
      value: formatMarketCap(marketCap),
      tooltipId: "market-cap",
      tooltipText: tTooltip("marketCap"),
    })
  }

  if (dividendYield != null) {
    metrics.push({
      label: t("dividendYield.label"),
      value: t("units.percent", { value: dividendYield.toFixed(2) }),
      tooltipId: "dividend-yield",
      tooltipText: tTooltip("dividendYield"),
    })
  }

  if (per != null) {
    metrics.push({
      label: t("per.label"),
      value: t("units.times", { value: per.toFixed(1) }),
      tooltipId: "per-key",
      tooltipText: tTooltip("per"),
    })
  }

  if (pbr != null) {
    metrics.push({
      label: t("pbr.label"),
      value: t("units.times", { value: pbr.toFixed(2) }),
      tooltipId: "pbr-key",
      tooltipText: tTooltip("pbr"),
    })
  }

  if (roe != null) {
    metrics.push({
      label: t("roe.label"),
      value: t("units.percent", { value: roe.toFixed(1) }),
      tooltipId: "roe-key",
      tooltipText: tTooltip("roe"),
    })
  }

  if (eps != null) {
    metrics.push({
      label: t("eps.label"),
      value: t("units.yen", { value: eps.toLocaleString() }),
      tooltipId: "eps-key",
      tooltipText: tTooltip("eps"),
    })
  }

  return (
    <section className="bg-white rounded-xl shadow-md p-4 sm:p-6 mb-6">
      <h2 className="text-base font-bold text-gray-900 mb-3">
        {t("title")}
      </h2>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {metrics.map((metric) => (
          <div key={metric.label} className="min-w-0">
            <div className="flex items-center gap-0.5 mb-0.5">
              <span className="text-xs text-gray-500 truncate">{metric.label}</span>
              {metric.tooltipId && metric.tooltipText && (
                <TermTooltip id={metric.tooltipId} text={metric.tooltipText} />
              )}
            </div>
            <p className="text-sm font-bold text-gray-900">
              {metric.value}
            </p>
          </div>
        ))}
      </div>

      {/* Ex-dividend date */}
      {exDividendDate && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500">{t("exDividendDate.label")}</span>
            <span className="font-semibold text-gray-900">
              {formatExDividendDate(exDividendDate)}
            </span>
          </div>
        </div>
      )}

      {/* Business description */}
      {businessDescription && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-xs text-gray-500 mb-1">{t("businessDescription.label")}</p>
          <p className={`text-sm text-gray-700 leading-relaxed ${!showFullDescription ? "line-clamp-2" : ""}`}>
            {businessDescription}
          </p>
          {businessDescription.length > 80 && (
            <button
              type="button"
              onClick={() => setShowFullDescription(!showFullDescription)}
              className="text-xs text-blue-600 hover:text-blue-800 mt-1"
            >
              {showFullDescription
                ? t("businessDescription.showLess")
                : t("businessDescription.showMore")}
            </button>
          )}
        </div>
      )}
    </section>
  )
}
