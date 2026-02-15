import { auth } from "@/auth"
import { redirect } from "next/navigation"
import AuthenticatedLayout from "@/app/components/AuthenticatedLayout"
import AIReportClient from "./AIReportClient"

export default async function AIReportPage() {
  const session = await auth()

  if (!session?.user?.email) {
    redirect("/login")
  }

  return (
    <AuthenticatedLayout maxWidth="6xl">
      <AIReportClient />
    </AuthenticatedLayout>
  )
}
