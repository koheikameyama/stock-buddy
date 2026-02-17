function StockCardSkeleton() {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
      <div className="flex items-start justify-between">
        <div className="flex-1 space-y-2">
          {/* Stock name */}
          <div className="h-5 w-32 bg-gray-200 rounded animate-pulse" />
          {/* Ticker and sector */}
          <div className="flex gap-2">
            <div className="h-4 w-16 bg-gray-200 rounded animate-pulse" />
            <div className="h-4 w-20 bg-gray-200 rounded animate-pulse" />
          </div>
        </div>
        {/* Price section */}
        <div className="text-right space-y-1">
          <div className="h-6 w-24 bg-gray-200 rounded animate-pulse ml-auto" />
          <div className="h-4 w-16 bg-gray-200 rounded animate-pulse ml-auto" />
        </div>
      </div>
      {/* Profit/Loss or buttons */}
      <div className="mt-3 pt-3 border-t border-gray-100">
        <div className="flex gap-2">
          <div className="h-8 flex-1 bg-gray-200 rounded-lg animate-pulse" />
          <div className="h-8 flex-1 bg-gray-200 rounded-lg animate-pulse" />
        </div>
      </div>
    </div>
  )
}

export function MyStocksSkeleton() {
  return (
    <>
      {/* Back button */}
      <div className="mb-4 sm:mb-6">
        <div className="h-6 w-40 bg-gray-200 rounded animate-pulse" />
      </div>

      {/* Page Header */}
      <div className="mb-4 sm:mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="h-8 w-32 bg-gray-200 rounded animate-pulse" />
            <div className="h-4 w-48 bg-gray-200 rounded animate-pulse mt-2" />
          </div>
          <div className="h-10 w-16 bg-gray-200 rounded-lg animate-pulse" />
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="mb-6">
        <div className="flex border-b border-gray-200">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="px-4 py-3">
              <div className="h-5 w-16 bg-gray-200 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>

      {/* Action button area */}
      <div className="flex justify-between items-center mb-4">
        <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
        <div className="h-10 w-32 bg-gray-200 rounded-lg animate-pulse" />
      </div>

      {/* Stock cards */}
      <div className="grid gap-3 sm:gap-6">
        {[...Array(5)].map((_, i) => (
          <StockCardSkeleton key={i} />
        ))}
      </div>
    </>
  )
}
