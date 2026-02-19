import { auth, signOut } from "@/auth"
import { redirect } from "next/navigation"
import AuthenticatedLayout from "@/app/components/AuthenticatedLayout"
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

  const isAdmin = session.user.role === "admin"

  return (
    <AuthenticatedLayout maxWidth="lg">
      <h1 className="text-xl font-bold text-gray-900 mb-6">その他</h1>

      <MenuClient isAdmin={isAdmin} />

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
    </AuthenticatedLayout>
  )
}
