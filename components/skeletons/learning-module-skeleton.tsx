export function LearningModuleSkeleton() {
  return (
    <div className="space-y-6">
      {/* Filter skeleton */}
      <div className="flex gap-2">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="h-8 w-20 bg-gray-200 rounded-full animate-pulse"
          />
        ))}
      </div>

      {/* Module cards skeleton */}
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="bg-gray-100 rounded-xl p-4 sm:p-5 animate-pulse"
          >
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-200 rounded" />
              <div className="flex-1 space-y-2">
                <div className="h-5 w-40 bg-gray-200 rounded" />
                <div className="h-4 w-full bg-gray-200 rounded" />
                <div className="h-4 w-2/3 bg-gray-200 rounded" />
                <div className="flex gap-4 mt-2">
                  <div className="h-3 w-16 bg-gray-200 rounded" />
                  <div className="h-3 w-12 bg-gray-200 rounded" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Term dictionary link skeleton */}
      <div className="bg-gray-100 rounded-xl p-4 sm:p-5 animate-pulse">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gray-200 rounded" />
          <div className="flex-1 space-y-2">
            <div className="h-5 w-24 bg-gray-200 rounded" />
            <div className="h-4 w-48 bg-gray-200 rounded" />
          </div>
          <div className="h-9 w-24 bg-gray-200 rounded-lg" />
        </div>
      </div>
    </div>
  )
}
