import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get("category")
    const query = searchParams.get("q")

    const where: {
      category?: string
      OR?: Array<{ name: { contains: string; mode: "insensitive" } } | { nameEn: { contains: string; mode: "insensitive" } }>
    } = {}

    if (category) {
      where.category = category
    }

    if (query) {
      where.OR = [
        { name: { contains: query, mode: "insensitive" } },
        { nameEn: { contains: query, mode: "insensitive" } },
      ]
    }

    const terms = await prisma.term.findMany({
      where,
      orderBy: [{ category: "asc" }, { name: "asc" }],
    })

    return NextResponse.json({ terms })
  } catch (error) {
    console.error("Error fetching terms:", error)
    return NextResponse.json(
      { error: "用語の取得に失敗しました" },
      { status: 500 }
    )
  }
}
