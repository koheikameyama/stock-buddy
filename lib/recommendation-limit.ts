// 月次の提案回数制限
export const MAX_RECOMMENDATIONS_PER_MONTH = 3

/**
 * ユーザーの今月のAI提案回数を取得
 *
 * 注意: RecommendationLogテーブルは削除されたため、常に0を返す
 */
export async function getMonthlyRecommendationCount(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  userId: string
): Promise<number> {
  // RecommendationLogテーブルは削除されたため、0を返す
  return 0
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
