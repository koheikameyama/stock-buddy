import { auth } from "@/auth"
import { redirect } from "next/navigation"
import AuthenticatedLayout from "@/app/components/AuthenticatedLayout"
import StocksClient from "./StocksClient"

export default async function StocksPage() {
  const session = await auth()

  if (!session?.user?.email) {
    redirect("/login")
  }

  return (
    <AuthenticatedLayout>
      <StocksClient />
    </AuthenticatedLayout>
  )
}
