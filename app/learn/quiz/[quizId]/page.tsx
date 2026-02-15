import { Suspense } from "react"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import Header from "@/app/components/Header"
import QuizView from "./QuizView"
import { LessonSkeleton } from "@/components/skeletons/lesson-skeleton"

export const metadata = {
  title: "理解度チェック | 学ぶ | Stock Buddy",
}

export default async function QuizPage({
  params,
}: {
  params: Promise<{ quizId: string }>
}) {
  const session = await auth()
  const { quizId } = await params

  if (!session?.user?.email) {
    redirect("/login")
  }

  return (
    <>
      <Header />
      <main className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-blue-50 pb-8">
        <div className="max-w-4xl mx-auto px-3 sm:px-6 py-4 sm:py-8">
          <Suspense fallback={<LessonSkeleton />}>
            <QuizView quizId={quizId} />
          </Suspense>
        </div>
      </main>
    </>
  )
}
