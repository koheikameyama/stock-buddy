import { auth, signOut } from "@/auth"
import Link from "next/link"
import HamburgerMenu from "./HamburgerMenu"

export default async function Header() {
  const session = await auth()

  async function handleSignOut() {
    "use server"
    await signOut({ redirectTo: "/" })
  }

  return (
    <header className="bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
        <div className="flex justify-between items-center">
          {/* ロゴ・タイトル */}
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="text-2xl">📊</span>
            <span className="text-xl font-bold text-gray-900">Stock Buddy</span>
          </Link>

          {/* ハンバーガーメニュー */}
          {session?.user && (
            <HamburgerMenu signOutAction={handleSignOut} />
          )}
        </div>
      </div>
    </header>
  )
}
