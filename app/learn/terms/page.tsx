import { Suspense } from "react"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import AuthenticatedLayout from "@/app/components/AuthenticatedLayout"
import TermList from "./TermList"
import { TermListSkeleton } from "@/components/skeletons/term-list-skeleton"

export const metadata = {
  title: "用語辞典 | 学ぶ | Stock Buddy",
  description: "投資用語をいつでも調べられます",
}

export default async function TermsPage() {
  const session = await auth()

  if (!session?.user?.email) {
    redirect("/login")
  }

  return (
    <AuthenticatedLayout>
      <div className="mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
          用語辞典
        </h1>
        <p className="text-xs sm:text-sm text-gray-600 mt-1">
          投資用語をいつでも調べられます
        </p>
      </div>
      <Suspense fallback={<TermListSkeleton />}>
        <TermList />
      </Suspense>
    </AuthenticatedLayout>
  )
}
