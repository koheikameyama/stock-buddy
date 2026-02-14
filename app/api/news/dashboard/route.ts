import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { getDashboardNews } from "@/lib/news"

export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      )
    }

    const searchParams = request.nextUrl.searchParams
    const limit = parseInt(searchParams.get("limit") || "5", 10)

    const news = await getDashboardNews(session.user.id, limit)

    return NextResponse.json({
      success: true,
      news,
    })
  } catch (error) {
    console.error("Failed to fetch dashboard news:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch news" },
      { status: 500 }
    )
  }
}
