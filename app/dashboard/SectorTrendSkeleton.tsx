export function SectorTrendSkeleton() {
  return (
    <div className="mt-4 sm:mt-6">
      <div className="flex items-center justify-between mb-3">
        <div className="h-5 w-40 bg-muted animate-pulse rounded" />
        <div className="h-8 w-24 bg-muted animate-pulse rounded" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {[...Array(10)].map((_, i) => (
          <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
        ))}
      </div>
    </div>
  )
}
