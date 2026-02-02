import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { UserStockResponse } from "../route"

// Note: No limit check needed on conversion since total count stays the same

interface UpdateUserStockRequest {
  quantity?: number | null
  averagePrice?: number | null
  purchaseDate?: string | null
}

/**
 * PATCH /api/user-stocks/[id]
 * Update existing UserStock
 *
 * Body: Partial UserStock fields
 * - quantity?: number | null (can convert watchlist → holding or holding → watchlist)
 * - averagePrice?: number | null
 * - purchaseDate?: string | null
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    // Authentication check
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = session.user.id
    const body: UpdateUserStockRequest = await request.json()

    // Find existing user stock
    const existingUserStock = await prisma.userStock.findUnique({
      where: { id },
      include: {
        stock: true,
      },
    })

    if (!existingUserStock) {
      return NextResponse.json(
        { error: "User stock not found" },
        { status: 404 }
      )
    }

    // Verify ownership
    if (existingUserStock.userId !== userId) {
      return NextResponse.json(
        { error: "You don't have permission to update this stock" },
        { status: 403 }
      )
    }

    // Determine current and new mode
    const wasHolding = existingUserStock.quantity !== null
    const willBeHolding =
      body.quantity !== undefined
        ? body.quantity !== null && body.quantity !== 0
        : wasHolding

    // No limit check needed when converting since total count stays the same

    // Validate data
    if (body.quantity !== undefined && body.quantity !== null) {
      if (body.quantity <= 0) {
        return NextResponse.json(
          { error: "Quantity must be greater than 0" },
          { status: 400 }
        )
      }
    }

    if (body.averagePrice !== undefined && body.averagePrice !== null) {
      if (body.averagePrice <= 0) {
        return NextResponse.json(
          { error: "Average price must be greater than 0" },
          { status: 400 }
        )
      }
    }

    // Build update data
    const updateData: {
      quantity?: number | null
      averagePrice?: number | null
      purchaseDate?: Date | null
    } = {}

    if (body.quantity !== undefined) {
      updateData.quantity = body.quantity
    }

    if (body.averagePrice !== undefined) {
      updateData.averagePrice = body.averagePrice
    }

    if (body.purchaseDate !== undefined) {
      updateData.purchaseDate = body.purchaseDate ? new Date(body.purchaseDate) : null
    }

    // When converting to watchlist, clear holding-specific fields
    if (!willBeHolding) {
      updateData.quantity = null
      updateData.averagePrice = null
      updateData.purchaseDate = null
    }

    // Update user stock
    const updatedUserStock = await prisma.userStock.update({
      where: { id },
      data: updateData,
      include: {
        stock: {
          select: {
            id: true,
            tickerCode: true,
            name: true,
            sector: true,
            market: true,
            currentPrice: true,
          },
        },
      },
    })

    // Format response
    const response: UserStockResponse = {
      id: updatedUserStock.id,
      userId: updatedUserStock.userId,
      stockId: updatedUserStock.stockId,
      quantity: updatedUserStock.quantity,
      averagePrice: updatedUserStock.averagePrice,
      purchaseDate: updatedUserStock.purchaseDate
        ? updatedUserStock.purchaseDate.toISOString()
        : null,
      lastAnalysis: updatedUserStock.lastAnalysis
        ? updatedUserStock.lastAnalysis.toISOString()
        : null,
      shortTerm: updatedUserStock.shortTerm,
      mediumTerm: updatedUserStock.mediumTerm,
      longTerm: updatedUserStock.longTerm,
      stock: {
        id: updatedUserStock.stock.id,
        tickerCode: updatedUserStock.stock.tickerCode,
        name: updatedUserStock.stock.name,
        sector: updatedUserStock.stock.sector,
        market: updatedUserStock.stock.market,
        currentPrice: updatedUserStock.stock.currentPrice
          ? Number(updatedUserStock.stock.currentPrice)
          : null,
      },
      createdAt: updatedUserStock.createdAt.toISOString(),
      updatedAt: updatedUserStock.updatedAt.toISOString(),
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error("Error updating user stock:", error)
    return NextResponse.json(
      { error: "Failed to update user stock" },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/user-stocks/[id]
 * Remove stock from holdings/watchlist
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    // Authentication check
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = session.user.id

    // Find existing user stock
    const existingUserStock = await prisma.userStock.findUnique({
      where: { id },
      include: {
        stock: {
          select: {
            tickerCode: true,
            name: true,
          },
        },
      },
    })

    if (!existingUserStock) {
      return NextResponse.json(
        { error: "User stock not found" },
        { status: 404 }
      )
    }

    // Verify ownership
    if (existingUserStock.userId !== userId) {
      return NextResponse.json(
        { error: "You don't have permission to delete this stock" },
        { status: 403 }
      )
    }

    // Delete user stock
    await prisma.userStock.delete({
      where: { id },
    })

    return NextResponse.json({
      success: true,
      message: `Stock ${existingUserStock.stock.name} (${existingUserStock.stock.tickerCode}) removed successfully`,
    })
  } catch (error) {
    console.error("Error deleting user stock:", error)
    return NextResponse.json(
      { error: "Failed to delete user stock" },
      { status: 500 }
    )
  }
}
