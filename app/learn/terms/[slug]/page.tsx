import { Suspense } from "react"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import Header from "@/app/components/Header"
import Footer from "@/app/components/Footer"
import BottomNavigation from "@/app/components/BottomNavigation"
import TermDetail from "./TermDetail"
import { LessonSkeleton } from "@/components/skeletons/lesson-skeleton"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return {
    title: `${slug} | 用語辞典 | Stock Buddy`,
  }
}

export default async function TermPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const session = await auth()
  const { slug } = await params

  if (!session?.user?.email) {
    redirect("/login")
  }

  return (
    <>
      <Header />
      <main className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-blue-50">
        <div className="max-w-4xl mx-auto px-3 sm:px-6 py-4 sm:py-8">
          <Suspense fallback={<LessonSkeleton />}>
            <TermDetail slug={slug} />
          </Suspense>
        </div>
      </main>
      <Footer />
      <BottomNavigation />
    </>
  )
}
