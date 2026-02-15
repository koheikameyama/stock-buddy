import { auth } from "@/auth"
import { redirect } from "next/navigation"
import AuthenticatedLayout from "@/app/components/AuthenticatedLayout"
import MarketMoversDetail from "./MarketMoversDetail"

export default async function MarketMoversPage() {
  const session = await auth()

  if (!session?.user?.email) {
    redirect("/login")
  }

  return (
    <AuthenticatedLayout>
      <MarketMoversDetail />
    </AuthenticatedLayout>
  )
}
