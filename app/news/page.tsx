import { auth } from "@/auth"
import { redirect } from "next/navigation"
import AuthenticatedLayout from "@/app/components/AuthenticatedLayout"
import NewsPageClient from "./NewsPageClient"

export const metadata = {
  title: "ニュース | Stock Buddy",
  description: "日本株・米国株に関する最新ニュース",
}

export default async function NewsPage() {
  const session = await auth()

  if (!session?.user?.email) {
    redirect("/login")
  }

  return (
    <AuthenticatedLayout>
      <div className="mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
          マーケットニュース
        </h1>
        <p className="text-xs sm:text-sm text-gray-600 mt-1">
          日本株・米国株に関する最新ニュース
        </p>
      </div>
      <NewsPageClient />
    </AuthenticatedLayout>
  )
}
