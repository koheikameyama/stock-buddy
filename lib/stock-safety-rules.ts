/**
 * 銘柄の安全性ルール（強制補正の条件判定）
 *
 * おすすめ分析・購入判断の両方で共通して使う。
 * 条件判定のみを提供し、アクション（除外 or stay変更）は呼び出し側に委ねる。
 */
import { MA_DEVIATION, MOMENTUM } from "@/lib/constants";

/** 高ボラティリティの閾値（%） */
const HIGH_VOLATILITY_THRESHOLD = 50;

/** 急騰銘柄か（投資期間別の閾値で判定） */
export function isSurgeStock(
  weekChangeRate: number | null,
  investmentPeriod?: string | null,
): boolean {
  if (weekChangeRate === null) return false;
  const threshold = getSurgeThreshold(investmentPeriod);
  if (threshold === null) return false; // 短期投資は制限なし
  return weekChangeRate >= threshold;
}

/** 投資期間に応じた急騰閾値を取得 */
function getSurgeThreshold(investmentPeriod?: string | null): number | null {
  switch (investmentPeriod) {
    case "short":
      return MOMENTUM.SHORT_TERM_SURGE_THRESHOLD;
    case "medium":
      return MOMENTUM.MEDIUM_TERM_SURGE_THRESHOLD;
    case "long":
      return MOMENTUM.LONG_TERM_SURGE_THRESHOLD;
    default:
      return MOMENTUM.DEFAULT_SURGE_THRESHOLD;
  }
}

/** 危険銘柄か（赤字 かつ 高ボラティリティ） */
export function isDangerousStock(
  isProfitable: boolean | null,
  volatility: number | null,
): boolean {
  return (
    isProfitable === false &&
    volatility !== null &&
    volatility > HIGH_VOLATILITY_THRESHOLD
  );
}

/** 過熱圏か（移動平均乖離率+20%以上、短期投資はスキップ） */
export function isOverheated(
  deviationRate: number | null,
  investmentPeriod?: string | null,
): boolean {
  if (investmentPeriod === "short" && MOMENTUM.SHORT_TERM_SKIP_OVERHEAT)
    return false;
  return (
    deviationRate !== null && deviationRate >= MA_DEVIATION.UPPER_THRESHOLD
  );
}

/** 下落トレンドか（投資期間別の閾値で判定） */
export function isInDecline(
  weekChangeRate: number | null,
  investmentPeriod?: string | null,
): boolean {
  if (weekChangeRate === null) return false;
  const threshold = getDeclineThreshold(investmentPeriod);
  return weekChangeRate <= threshold;
}

/** 投資期間に応じた下落閾値を取得 */
function getDeclineThreshold(investmentPeriod?: string | null): number {
  switch (investmentPeriod) {
    case "short":
      return MOMENTUM.SHORT_TERM_DECLINE_THRESHOLD;
    case "medium":
      return MOMENTUM.MEDIUM_TERM_DECLINE_THRESHOLD;
    case "long":
      return MOMENTUM.LONG_TERM_DECLINE_THRESHOLD;
    default:
      return MOMENTUM.DEFAULT_DECLINE_THRESHOLD;
  }
}
