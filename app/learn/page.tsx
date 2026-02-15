import { Suspense } from "react"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import Header from "@/app/components/Header"
import BottomNavigation from "@/app/components/BottomNavigation"
import LearningHome from "./LearningHome"
import { LearningModuleSkeleton } from "@/components/skeletons/learning-module-skeleton"

export const metadata = {
  title: "学ぶ | Stock Buddy",
  description: "投資の基礎から応用まで、ステップバイステップで学びましょう",
}

export default async function LearnPage() {
  const session = await auth()

  if (!session?.user?.email) {
    redirect("/login")
  }

  return (
    <>
      <Header />
      <main className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-blue-50 pb-20">
        <div className="max-w-4xl mx-auto px-3 sm:px-6 py-4 sm:py-8">
          <div className="mb-4 sm:mb-6">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
              学ぶ
            </h1>
            <p className="text-xs sm:text-sm text-gray-600 mt-1">
              投資の基礎から応用まで、ステップバイステップで学びましょう
            </p>
          </div>

          <Suspense fallback={<LearningModuleSkeleton />}>
            <LearningHome />
          </Suspense>
        </div>
      </main>
      <BottomNavigation />
    </>
  )
}
