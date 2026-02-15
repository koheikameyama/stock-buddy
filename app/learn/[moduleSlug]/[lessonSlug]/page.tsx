import { Suspense } from "react"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import Header from "@/app/components/Header"
import LessonContent from "./LessonContent"
import { LessonSkeleton } from "@/components/skeletons/lesson-skeleton"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ moduleSlug: string; lessonSlug: string }>
}) {
  const { lessonSlug } = await params
  return {
    title: `${lessonSlug} | 学ぶ | Stock Buddy`,
  }
}

export default async function LessonPage({
  params,
}: {
  params: Promise<{ moduleSlug: string; lessonSlug: string }>
}) {
  const session = await auth()
  const { moduleSlug, lessonSlug } = await params

  if (!session?.user?.email) {
    redirect("/login")
  }

  return (
    <>
      <Header />
      <main className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-blue-50 pb-8">
        <div className="max-w-4xl mx-auto px-3 sm:px-6 py-4 sm:py-8">
          <Suspense fallback={<LessonSkeleton />}>
            <LessonContent moduleSlug={moduleSlug} lessonSlug={lessonSlug} />
          </Suspense>
        </div>
      </main>
    </>
  )
}
