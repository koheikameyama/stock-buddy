/**
 * Buy-Timing Score Calculator
 *
 * ユーザーの投資スタイルに基づいて、ウォッチリスト銘柄の買い時スコアを計算
 */

interface Stock {
  beginnerScore?: number | null
  growthScore?: number | null
  dividendScore?: number | null
  stabilityScore?: number | null
  liquidityScore?: number | null
}

interface UserSettings {
  investmentPeriod: string  // 'short' | 'medium' | 'long'
  riskTolerance: string     // 'low' | 'medium' | 'high'
}

interface StockAnalysis {
  trend: string       // 'bullish' | 'bearish' | 'neutral'
  buyTiming: string   // 'good' | 'wait' | 'avoid'
}

/**
 * ユーザーの投資スタイルに基づいて買い時スコアを計算
 *
 * @param stock - 銘柄情報（各種スコア）
 * @param userSettings - ユーザー設定（投資期間・リスク許容度）
 * @param analysis - 銘柄分析（トレンド・買い時判断）
 * @returns 買い時スコア（0-100）
 */
export function calculateBuyTimingScore(
  stock: Stock,
  userSettings: UserSettings,
  analysis?: StockAnalysis
): number {
  const { investmentPeriod, riskTolerance } = userSettings

  let score = 0
  let totalWeight = 0

  // === 1. 投資期間に基づく重み付け ===

  if (investmentPeriod === 'short') {
    // 短期投資: 成長性・流動性重視
    if (stock.growthScore) {
      score += stock.growthScore * 0.5
      totalWeight += 0.5
    }
    if (stock.liquidityScore) {
      score += stock.liquidityScore * 0.3
      totalWeight += 0.3
    }
    if (stock.stabilityScore) {
      score += stock.stabilityScore * 0.2
      totalWeight += 0.2
    }
  } else if (investmentPeriod === 'long') {
    // 長期投資: 安定性・配当重視
    if (stock.stabilityScore) {
      score += stock.stabilityScore * 0.4
      totalWeight += 0.4
    }
    if (stock.dividendScore) {
      score += stock.dividendScore * 0.3
      totalWeight += 0.3
    }
    if (stock.growthScore) {
      score += stock.growthScore * 0.3
      totalWeight += 0.3
    }
  } else {
    // 中期投資: バランス型
    if (stock.growthScore) {
      score += stock.growthScore * 0.35
      totalWeight += 0.35
    }
    if (stock.stabilityScore) {
      score += stock.stabilityScore * 0.35
      totalWeight += 0.35
    }
    if (stock.dividendScore) {
      score += stock.dividendScore * 0.3
      totalWeight += 0.3
    }
  }

  // === 2. リスク許容度による調整 ===

  if (riskTolerance === 'low') {
    // 低リスク: 安定性をさらに重視
    if (stock.stabilityScore) {
      score += stock.stabilityScore * 0.2
      totalWeight += 0.2
    }
    if (stock.beginnerScore) {
      score += stock.beginnerScore * 0.1
      totalWeight += 0.1
    }
  } else if (riskTolerance === 'high') {
    // ハイリスク: 成長性をさらに重視
    if (stock.growthScore) {
      score += stock.growthScore * 0.2
      totalWeight += 0.2
    }
  } else {
    // 中リスク: 流動性重視
    if (stock.liquidityScore) {
      score += stock.liquidityScore * 0.15
      totalWeight += 0.15
    }
  }

  // === 3. 銘柄分析による調整 ===

  if (analysis) {
    let analysisBonus = 0

    // トレンドによる調整
    if (analysis.trend === 'bullish') {
      analysisBonus += 10
    } else if (analysis.trend === 'bearish') {
      analysisBonus -= 10
    }

    // 買い時判断による調整
    if (analysis.buyTiming === 'good') {
      analysisBonus += 15
    } else if (analysis.buyTiming === 'avoid') {
      analysisBonus -= 15
    } else if (analysis.buyTiming === 'wait') {
      analysisBonus += 5
    }

    score += analysisBonus
  }

  // === 4. 正規化（0-100の範囲に収める） ===

  if (totalWeight > 0) {
    score = score / totalWeight
  }

  // 0-100の範囲にクランプ
  score = Math.max(0, Math.min(100, Math.round(score)))

  return score
}

/**
 * 買い時スコアに基づくメッセージ生成
 *
 * @param score - 買い時スコア（0-100）
 * @param userSettings - ユーザー設定
 * @returns 買い時メッセージ
 */
export function getBuyTimingMessage(
  score: number,
  userSettings: UserSettings
): string {
  const { investmentPeriod, riskTolerance } = userSettings

  // スコアレベル判定
  if (score >= 80) {
    return `あなたの投資スタイル（${getPeriodLabel(investmentPeriod)}・${getRiskLabel(riskTolerance)}）に非常に合っています。今が買い時です！`
  } else if (score >= 60) {
    return `あなたの投資スタイルに合っています。検討してみる価値がありそうです。`
  } else if (score >= 40) {
    return `まずまずの買い時です。もう少し様子を見てもいいかもしれません。`
  } else if (score >= 20) {
    return `今はあまり良い買い時ではないかもしれません。もう少し待ちましょう。`
  } else {
    return `あなたの投資スタイルには合わないかもしれません。別の銘柄を検討することをおすすめします。`
  }
}

function getPeriodLabel(period: string): string {
  switch (period) {
    case 'short':
      return '短期投資'
    case 'long':
      return '長期投資'
    default:
      return '中期投資'
  }
}

function getRiskLabel(risk: string): string {
  switch (risk) {
    case 'low':
      return '低リスク'
    case 'high':
      return 'ハイリスク'
    default:
      return '中リスク'
  }
}
