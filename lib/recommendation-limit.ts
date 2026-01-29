import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

// 月次の提案回数制限
export const MAX_RECOMMENDATIONS_PER_MONTH = 3

/**
 * ユーザーの今月のAI提案回数を取得
 */
export async function getMonthlyRecommendationCount(userId: string): Promise<number> {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)

  const count = await prisma.recommendationLog.count({
    where: {
      userId,
      createdAt: {
        gte: startOfMonth,
        lte: endOfMonth,
      },
    },
  })

  return count
}

/**
 * ユーザーがAI提案を実行可能かチェック
 */
export async function canRequestRecommendation(userId: string): Promise<{
  allowed: boolean
  currentCount: number
  maxCount: number
  resetDate: Date
}> {
  const currentCount = await getMonthlyRecommendationCount(userId)
  const allowed = currentCount < MAX_RECOMMENDATIONS_PER_MONTH

  // 次の月の1日を計算
  const now = new Date()
  const resetDate = new Date(now.getFullYear(), now.getMonth() + 1, 1)

  return {
    allowed,
    currentCount,
    maxCount: MAX_RECOMMENDATIONS_PER_MONTH,
    resetDate,
  }
}
