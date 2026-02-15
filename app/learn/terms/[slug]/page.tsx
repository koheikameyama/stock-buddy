import { Suspense } from "react"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import AuthenticatedLayout from "@/app/components/AuthenticatedLayout"
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
    <AuthenticatedLayout>
      <Suspense fallback={<LessonSkeleton />}>
        <TermDetail slug={slug} />
      </Suspense>
    </AuthenticatedLayout>
  )
}
