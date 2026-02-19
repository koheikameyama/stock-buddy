import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { getAllSectorTrends } from "@/lib/sector-trend"

/**
 * GET /api/sector-trends
 * 当日のセクタートレンドを全セクター分取得
 */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { date, trends } = await getAllSectorTrends()
  return NextResponse.json({ date, trends })
}
