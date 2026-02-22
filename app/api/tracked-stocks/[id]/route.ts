import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/auth-utils"
import { prisma } from "@/lib/prisma"

/**
 * DELETE /api/tracked-stocks/[id]
 * 追跡銘柄を削除
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await getAuthUser()
  if (error) return error

  const { id } = await params
  const userId = user.id

  try {
    // 自分の追跡銘柄か確認
    const trackedStock = await prisma.trackedStock.findFirst({
      where: { id, userId },
    })

    if (!trackedStock) {
      return NextResponse.json(
        { error: "追跡銘柄が見つかりません" },
        { status: 404 }
      )
    }

    // 削除
    await prisma.trackedStock.delete({
      where: { id },
    })

    return NextResponse.json({ message: "追跡銘柄を削除しました" })
  } catch (error) {
    console.error("Error deleting tracked stock:", error)
    return NextResponse.json(
      { error: "追跡銘柄の削除に失敗しました" },
      { status: 500 }
    )
  }
}
