import { NextRequest, NextResponse } from "next/server"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get("q")

    if (!query || query.length < 2) {
      return NextResponse.json({ stocks: [] })
    }

    // 銘柄コードまたは名前で検索
    const stocks = await prisma.stock.findMany({
      where: {
        OR: [
          { tickerCode: { contains: query, mode: "insensitive" } },
          { name: { contains: query, mode: "insensitive" } },
        ],
      },
      select: {
        tickerCode: true,
        name: true,
      },
      take: 10,
      orderBy: {
        tickerCode: "asc",
      },
    })

    return NextResponse.json({ stocks })
  } catch (error) {
    console.error("Search error:", error)
    return NextResponse.json(
      { error: "検索に失敗しました" },
      { status: 500 }
    )
  }
}
