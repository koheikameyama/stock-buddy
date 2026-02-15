import { auth } from "@/auth"
import { redirect } from "next/navigation"
import Header from "@/app/components/Header"
import BottomNavigation from "@/app/components/BottomNavigation"
import AIReportClient from "./AIReportClient"

export default async function AIReportPage() {
  const session = await auth()

  if (!session?.user?.email) {
    redirect("/login")
  }

  return (
    <>
      <Header />
      <main className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-blue-50 pb-20">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-8">
          <AIReportClient />
        </div>
      </main>
      <BottomNavigation />
    </>
  )
}
