interface StockHeaderProps {
  name: string
  tickerCode: string
  sector?: string | null
  badge?: string
}

export default function StockHeader({ name, tickerCode, sector, badge }: StockHeaderProps) {
  return (
    <div className="mb-6 sm:mb-8">
      {badge && (
        <div className="flex items-center gap-2 mb-1">
          <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs font-semibold">
            {badge}
          </span>
        </div>
      )}
      <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
        {name}
      </h1>
      <p className="text-sm text-gray-500 mt-1">
        {tickerCode}
        {sector && ` • ${sector}`}
      </p>
    </div>
  )
}
