import { auth, signOut } from "@/auth"
import Link from "next/link"

export default async function Header() {
  const session = await auth()

  return (
    <header className="bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
        <div className="flex justify-between items-center">
          {/* ロゴ・タイトル */}
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="text-2xl">📊</span>
            <span className="text-xl font-bold text-gray-900">Stock Buddy</span>
          </Link>

          {/* ナビゲーション */}
          <nav className="flex items-center gap-4">
            {session?.user && (
              <>
                <Link
                  href="/dashboard"
                  className="text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors hidden sm:block"
                >
                  ダッシュボード
                </Link>
                <Link
                  href="/dashboard/portfolio"
                  className="text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors hidden sm:block"
                >
                  ポートフォリオ
                </Link>
                <Link
                  href="/dashboard/reports"
                  className="text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors hidden sm:block"
                >
                  レポート
                </Link>
                <Link
                  href="/dashboard/settings"
                  className="text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors hidden sm:block"
                >
                  設定
                </Link>
                <form
                  action={async () => {
                    "use server"
                    await signOut({ redirectTo: "/" })
                  }}
                >
                  <button
                    type="submit"
                    className="px-3 py-2 text-xs sm:text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap shadow-sm"
                  >
                    ログアウト
                  </button>
                </form>
              </>
            )}
          </nav>
        </div>
      </div>
    </header>
  )
}
