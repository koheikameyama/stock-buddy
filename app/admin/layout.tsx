import { auth } from "@/auth"
import { redirect } from "next/navigation"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  if (!session?.user?.id) {
    redirect("/login")
  }

  if (session.user.role !== "admin") {
    redirect("/dashboard")
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold text-gray-900">Stock Buddy 管理者</h1>
            <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-semibold">
              Admin
            </span>
          </div>
          <a
            href="/dashboard"
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            ダッシュボードに戻る
          </a>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  )
}
