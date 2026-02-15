export function LessonSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <div className="h-4 w-12 bg-gray-200 rounded" />
        <div className="h-4 w-4 bg-gray-200 rounded" />
        <div className="h-4 w-24 bg-gray-200 rounded" />
        <div className="h-4 w-4 bg-gray-200 rounded" />
        <div className="h-4 w-32 bg-gray-200 rounded" />
      </div>

      {/* Title */}
      <div className="h-8 w-48 bg-gray-200 rounded" />

      {/* Level selector */}
      <div className="bg-gray-100 rounded-xl p-4">
        <div className="h-3 w-24 bg-gray-200 rounded mb-3" />
        <div className="flex gap-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex-1 h-10 bg-gray-200 rounded-lg" />
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="bg-gray-100 rounded-xl p-6 space-y-4">
        <div className="h-6 w-32 bg-gray-200 rounded" />
        <div className="space-y-2">
          <div className="h-4 w-full bg-gray-200 rounded" />
          <div className="h-4 w-full bg-gray-200 rounded" />
          <div className="h-4 w-3/4 bg-gray-200 rounded" />
        </div>
        <div className="space-y-2">
          <div className="h-4 w-full bg-gray-200 rounded" />
          <div className="h-4 w-5/6 bg-gray-200 rounded" />
        </div>
        <div className="space-y-2">
          <div className="h-4 w-full bg-gray-200 rounded" />
          <div className="h-4 w-4/5 bg-gray-200 rounded" />
          <div className="h-4 w-2/3 bg-gray-200 rounded" />
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <div className="h-10 w-24 bg-gray-200 rounded-lg" />
        <div className="h-10 w-32 bg-gray-200 rounded-lg" />
        <div className="h-10 w-24 bg-gray-200 rounded-lg" />
      </div>
    </div>
  )
}
