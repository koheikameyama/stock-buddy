import { Suspense } from "react"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import AuthenticatedLayout from "@/app/components/AuthenticatedLayout"
import ModuleDetail from "./ModuleDetail"
import { LessonSkeleton } from "@/components/skeletons/lesson-skeleton"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ moduleSlug: string }>
}) {
  const { moduleSlug } = await params
  return {
    title: `${moduleSlug} | 学ぶ | Stock Buddy`,
  }
}

export default async function ModulePage({
  params,
}: {
  params: Promise<{ moduleSlug: string }>
}) {
  const session = await auth()
  const { moduleSlug } = await params

  if (!session?.user?.email) {
    redirect("/login")
  }

  return (
    <AuthenticatedLayout>
      <Suspense fallback={<LessonSkeleton />}>
        <ModuleDetail moduleSlug={moduleSlug} />
      </Suspense>
    </AuthenticatedLayout>
  )
}
