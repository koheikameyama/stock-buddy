import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/auth-utils"
import { prisma } from "@/lib/prisma"

export async function POST(request: NextRequest) {
  const { user, error } = await getAuthUser()
  if (error) return error

  try {
    const subscription = await request.json()

    // 既存の購読があれば更新、なければ作成
    await prisma.pushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      update: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
      create: {
        userId: user.id,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error subscribing to push:", error)
    return NextResponse.json(
      { error: "Failed to subscribe" },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  const { user: deleteUser, error: deleteError } = await getAuthUser()
  if (deleteError) return deleteError

  try {
    const { endpoint } = await request.json()

    await prisma.pushSubscription.deleteMany({
      where: {
        userId: deleteUser.id,
        endpoint,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error unsubscribing from push:", error)
    return NextResponse.json(
      { error: "Failed to unsubscribe" },
      { status: 500 }
    )
  }
}

export async function GET() {
  try {
    return NextResponse.json({
      publicKey: process.env.VAPID_PUBLIC_KEY,
    })
  } catch (error) {
    console.error("Error getting VAPID public key:", error)
    return NextResponse.json(
      { error: "Failed to get public key" },
      { status: 500 }
    )
  }
}
