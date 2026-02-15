import { auth, signOut } from "@/auth"
import { redirect } from "next/navigation"
import Header from "@/app/components/Header"
import Footer from "@/app/components/Footer"
import BottomNavigation from "@/app/components/BottomNavigation"
import MenuClient from "./MenuClient"

export default async function MenuPage() {
  const session = await auth()

  if (!session?.user) {
    redirect("/login")
  }

  async function handleSignOut() {
    "use server"
    await signOut({ redirectTo: "/" })
  }

  return (
    <>
      <Header />
      <main className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-blue-50">
        <div className="max-w-lg mx-auto px-4 py-6">
          <h1 className="text-xl font-bold text-gray-900 mb-6">その他</h1>

          <MenuClient />

          {/* ログアウト */}
          <form action={handleSignOut} className="mt-2">
            <button
              type="submit"
              className="w-full flex items-center gap-3 p-4 bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md hover:border-red-200 transition-all text-gray-700"
            >
              <svg
                className="w-5 h-5 text-gray-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
              <span className="font-medium">ログアウト</span>
            </button>
          </form>
        </div>
      </main>
      <Footer />
      <BottomNavigation />
    </>
  )
}
