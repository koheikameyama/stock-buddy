import { auth } from "@/auth"
import { redirect } from "next/navigation"
import Header from "@/app/components/Header"
import MyStocksClient from "./MyStocksClient"

export default async function MyStocksPage() {
  const session = await auth()

  if (!session?.user?.id) {
    redirect("/login")
  }

  return (
    <>
      <Header />
      <MyStocksClient />
    </>
  )
}
