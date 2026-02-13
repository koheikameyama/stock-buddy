"use client"

import InstallPrompt from "@/app/components/InstallPrompt"
import PushNotificationPrompt from "@/app/components/PushNotificationPrompt"

export default function DashboardClient() {
  return (
    <>
      <InstallPrompt />
      <PushNotificationPrompt />
    </>
  )
}
