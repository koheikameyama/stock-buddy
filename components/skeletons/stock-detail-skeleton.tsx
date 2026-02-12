export function StockDetailSkeleton() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-blue-50 pb-24">
      <div className="max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-6">
        {/* Back button skeleton */}
        <div className="h-10 w-24 bg-gray-200 rounded-lg animate-pulse mb-4" />

        {/* Stock header skeleton */}
        <div className="bg-white rounded-xl p-4 sm:p-6 shadow-md mb-4 sm:mb-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex-1 space-y-3">
              {/* Stock name */}
              <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
              {/* Ticker and sector */}
              <div className="flex gap-2">
                <div className="h-5 w-20 bg-gray-200 rounded animate-pulse" />
                <div className="h-5 w-32 bg-gray-200 rounded animate-pulse" />
              </div>
            </div>
            {/* Price section */}
            <div className="text-right space-y-2">
              <div className="h-10 w-32 bg-gray-200 rounded animate-pulse ml-auto" />
              <div className="h-5 w-24 bg-gray-200 rounded animate-pulse ml-auto" />
            </div>
          </div>
        </div>

        {/* Action buttons skeleton */}
        <div className="flex gap-2 mb-4 sm:mb-6">
          <div className="h-10 flex-1 bg-gray-200 rounded-lg animate-pulse" />
          <div className="h-10 flex-1 bg-gray-200 rounded-lg animate-pulse" />
        </div>

        {/* Chart skeleton */}
        <div className="bg-white rounded-xl p-4 sm:p-6 shadow-md mb-4 sm:mb-6">
          <div className="h-6 w-32 bg-gray-200 rounded animate-pulse mb-4" />
          <div className="h-64 bg-gray-200 rounded animate-pulse" />
        </div>

        {/* Analysis card skeleton */}
        <div className="bg-white rounded-xl p-4 sm:p-6 shadow-md mb-4 sm:mb-6">
          <div className="h-6 w-40 bg-gray-200 rounded animate-pulse mb-4" />
          <div className="space-y-3">
            <div className="h-4 w-full bg-gray-200 rounded animate-pulse" />
            <div className="h-4 w-5/6 bg-gray-200 rounded animate-pulse" />
            <div className="h-4 w-4/6 bg-gray-200 rounded animate-pulse" />
          </div>
        </div>

        {/* Financial metrics skeleton */}
        <div className="bg-white rounded-xl p-4 sm:p-6 shadow-md mb-4 sm:mb-6">
          <div className="h-6 w-36 bg-gray-200 rounded animate-pulse mb-4" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="h-4 w-16 bg-gray-200 rounded animate-pulse" />
                <div className="h-6 w-20 bg-gray-200 rounded animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}
