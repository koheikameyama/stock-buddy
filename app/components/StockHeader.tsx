import CopyableTicker from "./CopyableTicker"

interface StockHeaderProps {
  name: string
  tickerCode: string
  sector?: string | null
  badge?: string
  badgeClassName?: string
}

export default function StockHeader({ name, tickerCode, sector, badge, badgeClassName }: StockHeaderProps) {
  return (
    <div className="mb-6 sm:mb-8">
      {badge && (
        <div className="flex items-center gap-2 mb-1">
          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${badgeClassName || "bg-gray-100 text-gray-600"}`}>
            {badge}
          </span>
        </div>
      )}
      <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
        {name}
      </h1>
      <p className="text-sm text-gray-500 mt-1">
        <CopyableTicker tickerCode={tickerCode} />
        {sector && ` • ${sector}`}
      </p>
    </div>
  )
}
