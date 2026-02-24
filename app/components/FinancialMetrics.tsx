"use client"

import { useTranslations } from "next-intl"
import TermTooltip from "@/app/components/TermTooltip"

interface Stock {
  pbr?: number | null
  per?: number | null
  roe?: number | null
  operatingCF?: number | null
  freeCF?: number | null
}

interface FinancialMetricsProps {
  stock: Stock
  embedded?: boolean
}

interface MetricCardProps {
  label: string
  technicalName: string
  value: string
  hint: string
  tooltipId: string
  tooltipText: string
}

function MetricCard({ label, technicalName, value, hint, tooltipId, tooltipText }: MetricCardProps) {
  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm font-semibold text-gray-900">{label}</span>
        <span className="text-xs text-gray-500">({technicalName})</span>
        <TermTooltip id={tooltipId} text={tooltipText} />
      </div>
      <p className="text-xl font-bold text-gray-900 mb-1">{value}</p>
      <p className="text-xs text-gray-500">{hint}</p>
    </div>
  )
}

export default function FinancialMetrics({ stock, embedded = false }: FinancialMetricsProps) {
  const tTooltip = useTranslations('stocks.tooltips')
  const t = useTranslations('stocks.financialMetrics')
  const { pbr, per, roe, operatingCF, freeCF } = stock

  function formatCashFlow(value: number | null | undefined): string {
    if (value === null || value === undefined) return "-"
    const absValue = Math.abs(value)
    if (absValue >= 1_000_000_000_000) {
      return t('units.trillion', { value: (value / 1_000_000_000_000).toFixed(1) })
    }
    if (absValue >= 100_000_000) {
      return t('units.billion', { value: (value / 100_000_000).toFixed(0) })
    }
    if (absValue >= 10_000) {
      return t('units.tenThousand', { value: (value / 10_000).toFixed(0) })
    }
    return t('units.yen', { value: value.toLocaleString() })
  }

  const hasAnyData =
    pbr !== null &&
    pbr !== undefined ||
    per !== null &&
    per !== undefined ||
    roe !== null &&
    roe !== undefined ||
    operatingCF !== null &&
    operatingCF !== undefined ||
    freeCF !== null &&
    freeCF !== undefined

  if (!hasAnyData) {
    return null
  }

  const wrapperClass = embedded
    ? ""
    : "bg-white rounded-xl shadow-md p-4 sm:p-6 mb-6"

  return (
    <section className={wrapperClass}>
      <div className="mb-4">
        <h2 className="text-lg sm:text-xl font-bold text-gray-900">
          {t('title')}
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          {t('subtitle')}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <MetricCard
          label={t('pbr.label')}
          technicalName={t('pbr.technicalName')}
          value={pbr !== null && pbr !== undefined ? t('units.times', { value: pbr.toFixed(2) }) : "-"}
          hint={pbr !== null && pbr !== undefined ? t('pbr.hint') : t('noData')}
          tooltipId="pbr"
          tooltipText={tTooltip('pbr')}
        />

        <MetricCard
          label={t('per.label')}
          technicalName={t('per.technicalName')}
          value={per !== null && per !== undefined ? t('units.times', { value: per.toFixed(2) }) : "-"}
          hint={per !== null && per !== undefined ? t('per.hint') : t('noData')}
          tooltipId="per"
          tooltipText={tTooltip('per')}
        />

        <MetricCard
          label={t('roe.label')}
          technicalName={t('roe.technicalName')}
          value={roe !== null && roe !== undefined ? t('units.percent', { value: roe.toFixed(2) }) : "-"}
          hint={roe !== null && roe !== undefined ? t('roe.hint') : t('noData')}
          tooltipId="roe"
          tooltipText={tTooltip('roe')}
        />

        <MetricCard
          label={t('operatingCF.label')}
          technicalName={t('operatingCF.technicalName')}
          value={formatCashFlow(operatingCF)}
          hint={operatingCF !== null && operatingCF !== undefined ? t('operatingCF.hint') : t('noData')}
          tooltipId="operating-cf"
          tooltipText={tTooltip('operatingCF')}
        />

        <MetricCard
          label={t('freeCF.label')}
          technicalName={t('freeCF.technicalName')}
          value={formatCashFlow(freeCF)}
          hint={freeCF !== null && freeCF !== undefined ? t('freeCF.hint') : t('noData')}
          tooltipId="free-cf"
          tooltipText={tTooltip('freeCF')}
        />
      </div>
    </section>
  )
}
