import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params

    const term = await prisma.term.findUnique({
      where: { slug },
    })

    if (!term) {
      return NextResponse.json(
        { error: "用語が見つかりません" },
        { status: 404 }
      )
    }

    // 関連用語を取得
    let relatedTerms = null
    if (term.relatedTermSlugs) {
      const slugs = term.relatedTermSlugs.split(",").map((s) => s.trim())
      relatedTerms = await prisma.term.findMany({
        where: { slug: { in: slugs } },
        select: { slug: true, name: true, category: true },
      })
    }

    return NextResponse.json({ term, relatedTerms })
  } catch (error) {
    console.error("Error fetching term:", error)
    return NextResponse.json(
      { error: "用語の取得に失敗しました" },
      { status: 500 }
    )
  }
}
