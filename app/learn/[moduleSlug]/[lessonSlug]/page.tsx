import { Suspense } from "react"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import AuthenticatedLayout from "@/app/components/AuthenticatedLayout"
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
    <AuthenticatedLayout>
      <Suspense fallback={<LessonSkeleton />}>
        <LessonContent moduleSlug={moduleSlug} lessonSlug={lessonSlug} />
      </Suspense>
    </AuthenticatedLayout>
  )
}
