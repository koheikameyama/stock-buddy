"use client"

import { useState } from "react"

interface FinancialMetricTooltipProps {
  label: string
  value: number | string | null | undefined
  description: string
  howToRead: string
  className?: string
}

export default function FinancialMetricTooltip({
  label,
  value,
  description,
  howToRead,
  className = "",
}: FinancialMetricTooltipProps) {
  const [showTooltip, setShowTooltip] = useState(false)

  // 値がない場合は「-」を表示
  const displayValue = value !== null && value !== undefined ? value : "-"

  return (
    <div className={`relative inline-block ${className}`}>
      <button
        className="text-sm border-b border-dotted border-gray-400 cursor-help hover:border-gray-600 transition-colors"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onFocus={() => setShowTooltip(true)}
        onBlur={() => setShowTooltip(false)}
      >
        <span className="font-semibold text-gray-700">{label}:</span>{" "}
        <span className="text-gray-900">{displayValue}</span>
      </button>

      {showTooltip && (
        <div className="absolute z-50 w-72 p-4 bg-white rounded-lg shadow-xl border border-gray-200 left-0 top-full mt-2">
          <div className="space-y-2">
            <h4 className="font-bold text-gray-900">{label}</h4>
            <p className="text-sm text-gray-700">{description}</p>
            <div className="pt-2 border-t border-gray-200">
              <p className="text-xs font-semibold text-gray-600 mb-1">
                どう見ればいい？
              </p>
              <p className="text-xs text-gray-600">{howToRead}</p>
            </div>
          </div>
          {/* ツールチップの矢印 */}
          <div className="absolute w-3 h-3 bg-white border-l border-t border-gray-200 transform rotate-45 left-4 -top-1.5" />
        </div>
      )}
    </div>
  )
}
