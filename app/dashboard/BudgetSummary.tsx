"use client"

import { useState, useEffect } from "react"
import Link from "next/link"

interface BudgetData {
  totalBudget: number | null
  netInvested: number
  remainingBudget: number | null
}

export default function BudgetSummary() {
  const [data, setData] = useState<BudgetData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch("/api/budget/summary")
        if (res.ok) {
          setData(await res.json())
        }
      } catch (error) {
        console.error("Error fetching budget summary:", error)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="mb-4 sm:mb-6 bg-white rounded-xl p-3 sm:p-4 shadow-sm border border-gray-200">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
            <span className="text-lg">💴</span>
          </div>
          <span className="text-sm font-semibold text-gray-900">投資資金</span>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="text-center">
              <div className="h-3 w-12 bg-gray-200 rounded animate-pulse mx-auto mb-1" />
              <div className="h-5 bg-gray-200 rounded animate-pulse" />
            </div>
          ))}
        </div>
        <div className="h-2 bg-gray-200 rounded-full animate-pulse" />
      </div>
    )
  }

  if (!data || !data.totalBudget) {
    return null
  }

  const usedPercent = Math.min(100, (data.netInvested / data.totalBudget) * 100)
  const isOverBudget = data.netInvested > data.totalBudget

  return (
    <div className="mb-4 sm:mb-6 bg-white rounded-xl p-3 sm:p-4 shadow-sm border border-gray-200">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
            <span className="text-lg">💴</span>
          </div>
          <span className="text-sm font-semibold text-gray-900">投資資金</span>
        </div>
        <Link
          href="/settings"
          className="text-xs text-gray-400 hover:text-blue-600 transition-colors"
        >
          設定を変更
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="text-center">
          <div className="text-xs text-gray-500 mb-1">投資予算</div>
          <div className="text-sm sm:text-base font-bold text-gray-900">
            ¥{data.totalBudget.toLocaleString()}
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-500 mb-1">投資済み</div>
          <div className="text-sm sm:text-base font-bold text-blue-600">
            ¥{Math.round(data.netInvested).toLocaleString()}
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-500 mb-1">残り予算</div>
          <div
            className={`text-sm sm:text-base font-bold ${
              isOverBudget ? "text-red-600" : "text-green-600"
            }`}
          >
            {isOverBudget ? "-" : ""}¥{Math.abs(Math.round(data.remainingBudget ?? 0)).toLocaleString()}
          </div>
        </div>
      </div>

      {/* 使用率バー */}
      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            isOverBudget ? "bg-red-500" : "bg-blue-500"
          }`}
          style={{ width: `${usedPercent}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-gray-400 mt-1">
        <span>投資済み {usedPercent.toFixed(0)}%</span>
        {isOverBudget ? (
          <span className="text-red-500">予算超過</span>
        ) : (
          <span>残り {(100 - usedPercent).toFixed(0)}%</span>
        )}
      </div>
    </div>
  )
}
