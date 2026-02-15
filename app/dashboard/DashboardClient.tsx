"use client"

import InstallPrompt from "@/app/components/InstallPrompt"
import PushNotificationPrompt from "@/app/components/PushNotificationPrompt"
import { useMarkPageSeen } from "@/app/hooks/useMarkPageSeen"

export default function DashboardClient() {
  // ページ訪問時に閲覧済みをマーク
  useMarkPageSeen("dashboard")

  return (
    <>
      <InstallPrompt />
      <PushNotificationPrompt />
    </>
  )
}
