import { Metadata } from "next"
import MaintenanceMode from "@/app/components/MaintenanceMode"

export const metadata: Metadata = {
  title: "メンテナンス中 | Stock Buddy",
  description: "現在メンテナンス中です",
}

export default function MaintenancePage() {
  return <MaintenanceMode />
}
