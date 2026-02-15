export function TermListSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Back link */}
      <div className="h-4 w-32 bg-gray-200 rounded" />

      {/* Search */}
      <div className="h-12 bg-gray-200 rounded-xl" />

      {/* Category filter */}
      <div className="flex gap-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-8 w-24 bg-gray-200 rounded-full" />
        ))}
      </div>

      {/* Term cards */}
      <div className="space-y-2">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="bg-gray-100 rounded-lg p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 space-y-2">
                <div className="h-5 w-32 bg-gray-200 rounded" />
                <div className="h-3 w-24 bg-gray-200 rounded" />
                <div className="h-4 w-full bg-gray-200 rounded" />
                <div className="h-4 w-3/4 bg-gray-200 rounded" />
              </div>
              <div className="w-4 h-4 bg-gray-200 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
