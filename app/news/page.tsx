import { auth } from "@/auth"
import { redirect } from "next/navigation"
import Header from "@/app/components/Header"
import Footer from "@/app/components/Footer"
import BottomNavigation from "@/app/components/BottomNavigation"
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
    <>
      <Header />
      <main className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-blue-50">
        <div className="max-w-4xl mx-auto px-3 sm:px-6 py-4 sm:py-8">
          <div className="mb-4 sm:mb-6">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
              マーケットニュース
            </h1>
            <p className="text-xs sm:text-sm text-gray-600 mt-1">
              日本株・米国株に関する最新ニュース
            </p>
          </div>

          <NewsPageClient />
        </div>
      </main>
      <Footer />
      <BottomNavigation />
    </>
  )
}
