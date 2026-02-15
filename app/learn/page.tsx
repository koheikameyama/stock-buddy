import { Suspense } from "react"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import AuthenticatedLayout from "@/app/components/AuthenticatedLayout"
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
    <AuthenticatedLayout>
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
    </AuthenticatedLayout>
  )
}
