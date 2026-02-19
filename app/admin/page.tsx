import { Suspense } from "react"
import AdminStocksClient from "./AdminStocksClient"

export default function AdminPage() {
  return (
    <Suspense fallback={<div className="text-gray-500">読み込み中...</div>}>
      <AdminStocksClient />
    </Suspense>
  )
}
