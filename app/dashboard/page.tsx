import { auth, signOut } from "@/auth"
import { redirect } from "next/navigation"
import Link from "next/link"

export default async function DashboardPage() {
  const session = await auth()

  if (!session?.user) {
    redirect("/login")
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">Stock Buddy Dashboard</h1>
        <p className="text-xl text-gray-600">
          AIに任せて、毎日ちょっと分かる投資
        </p>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl">
          <Link
            href="/dashboard/portfolio"
            className="p-6 bg-white rounded-lg shadow hover:shadow-lg transition-shadow"
          >
            <h2 className="text-lg font-bold mb-2">ポートフォリオ</h2>
            <p className="text-sm text-gray-600">保有銘柄の確認</p>
          </Link>

          <Link
            href="/dashboard/reports"
            className="p-6 bg-white rounded-lg shadow hover:shadow-lg transition-shadow"
          >
            <h2 className="text-lg font-bold mb-2">レポート</h2>
            <p className="text-sm text-gray-600">日次分析レポート</p>
          </Link>

          <Link
            href="/dashboard/settings"
            className="p-6 bg-white rounded-lg shadow hover:shadow-lg transition-shadow"
          >
            <h2 className="text-lg font-bold mb-2">投資スタイル設定</h2>
            <p className="text-sm text-gray-600">投資方針の変更</p>
          </Link>
        </div>

        <div className="mt-8 p-4 bg-white rounded-lg shadow">
          <p className="text-sm text-gray-500">ログイン中</p>
          <p className="font-semibold">{session.user.name}</p>
          <p className="text-sm text-gray-600">{session.user.email}</p>

          <form
            action={async () => {
              "use server"
              await signOut({ redirectTo: "/" })
            }}
            className="mt-4"
          >
            <button
              type="submit"
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-md text-sm"
            >
              ログアウト
            </button>
          </form>
        </div>

        <p className="mt-8 text-gray-500">
          Phase 1: 認証完了 | Phase 2: データ基盤構築完了
        </p>
      </div>
    </main>
  )
}
