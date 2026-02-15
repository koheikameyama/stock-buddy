import { Suspense } from "react"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import AuthenticatedLayout from "@/app/components/AuthenticatedLayout"
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
    <AuthenticatedLayout>
      <Suspense fallback={<LessonSkeleton />}>
        <QuizView quizId={quizId} />
      </Suspense>
    </AuthenticatedLayout>
  )
}
