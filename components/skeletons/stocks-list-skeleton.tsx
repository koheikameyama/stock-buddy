function StockCardSkeleton() {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
      <div className="flex items-start justify-between">
        <div className="flex-1 space-y-2">
          <div className="h-5 w-32 bg-gray-200 rounded animate-pulse" />
          <div className="flex gap-2">
            <div className="h-4 w-16 bg-gray-200 rounded animate-pulse" />
            <div className="h-4 w-20 bg-gray-200 rounded animate-pulse" />
          </div>
        </div>
        <div className="text-right space-y-1">
          <div className="h-6 w-24 bg-gray-200 rounded animate-pulse ml-auto" />
          <div className="h-4 w-16 bg-gray-200 rounded animate-pulse ml-auto" />
        </div>
      </div>
      <div className="mt-2 flex gap-2">
        <div className="h-5 w-16 bg-gray-200 rounded-full animate-pulse" />
        <div className="h-5 w-20 bg-gray-200 rounded-full animate-pulse" />
      </div>
    </div>
  )
}

export function StocksListSkeleton() {
  return (
    <>
      {/* Title */}
      <div className="mb-4">
        <div className="h-8 w-28 bg-gray-200 rounded animate-pulse" />
      </div>

      {/* Search */}
      <div className="flex gap-2 mb-3">
        <div className="h-10 flex-1 bg-gray-200 rounded-lg animate-pulse" />
        <div className="h-10 w-16 bg-gray-200 rounded-lg animate-pulse" />
      </div>

      {/* Direction tabs */}
      <div className="flex gap-2 mb-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-8 w-16 bg-gray-200 rounded-lg animate-pulse" />
        ))}
      </div>

      {/* Filters row */}
      <div className="flex gap-2 mb-4">
        <div className="h-10 w-32 bg-gray-200 rounded-lg animate-pulse" />
        <div className="h-10 w-24 bg-gray-200 rounded-lg animate-pulse" />
        <div className="h-10 w-24 bg-gray-200 rounded-lg animate-pulse" />
      </div>

      {/* Stock cards */}
      <div className="space-y-3">
        {[...Array(8)].map((_, i) => (
          <StockCardSkeleton key={i} />
        ))}
      </div>
    </>
  )
}
