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
          <nav className="flex items-center gap-2 sm:gap-4">
            {session?.user && (
              <>
                <Link
                  href="/dashboard/settings"
                  className="text-gray-700 hover:text-blue-600 transition-colors p-2"
                  title="設定"
                >
                  <svg
                    className="w-5 h-5 sm:w-6 sm:h-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
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
