/**
 * 銘柄の安全性ルール（強制補正の条件判定）
 *
 * おすすめ分析・購入判断の両方で共通して使う。
 * 条件判定のみを提供し、アクション（除外 or stay変更）は呼び出し側に委ねる。
 */
import { MA_DEVIATION } from "@/lib/constants"

/** 急騰銘柄の閾値（週間変化率 %） */
const SURGE_THRESHOLD = 30

/** 高ボラティリティの閾値（%） */
const HIGH_VOLATILITY_THRESHOLD = 50

/** 急騰銘柄か（週間+30%以上） */
export function isSurgeStock(weekChangeRate: number | null): boolean {
  return weekChangeRate !== null && weekChangeRate >= SURGE_THRESHOLD
}

/** 危険銘柄か（赤字 かつ 高ボラティリティ） */
export function isDangerousStock(
  isProfitable: boolean | null,
  volatility: number | null
): boolean {
  return isProfitable === false && volatility !== null && volatility > HIGH_VOLATILITY_THRESHOLD
}

/** 過熱圏か（移動平均乖離率+20%以上） */
export function isOverheated(deviationRate: number | null): boolean {
  return deviationRate !== null && deviationRate >= MA_DEVIATION.UPPER_THRESHOLD
}
