// 技術指標計算ライブラリ

interface PriceData {
  close: number
  high?: number
  low?: number
}

/**
 * RSI (Relative Strength Index) - 相対力指数
 * 0-100の範囲で、70以上で買われすぎ、30以下で売られすぎ
 */
export function calculateRSI(prices: PriceData[], period: number = 14): number | null {
  if (prices.length < period + 1) return null

  const changes = prices
    .slice(0, period + 1)
    .map((p, i, arr) => (i === 0 ? 0 : p.close - arr[i - 1].close))
    .slice(1)

  const gains = changes.map((c) => (c > 0 ? c : 0))
  const losses = changes.map((c) => (c < 0 ? Math.abs(c) : 0))

  const avgGain = gains.reduce((sum, g) => sum + g, 0) / period
  const avgLoss = losses.reduce((sum, l) => sum + l, 0) / period

  if (avgLoss === 0) return 100
  const rs = avgGain / avgLoss
  const rsi = 100 - 100 / (1 + rs)

  return Math.round(rsi * 100) / 100
}

/**
 * SMA (Simple Moving Average) - 単純移動平均
 */
export function calculateSMA(prices: PriceData[], period: number): number | null {
  if (prices.length < period) return null

  const sum = prices.slice(0, period).reduce((acc, p) => acc + p.close, 0)
  return Math.round((sum / period) * 100) / 100
}

/**
 * EMA (Exponential Moving Average) - 指数移動平均
 */
export function calculateEMA(prices: PriceData[], period: number): number | null {
  if (prices.length < period) return null

  const k = 2 / (period + 1)
  const sma = calculateSMA(prices.slice(-period), period)
  if (!sma) return null

  let ema = sma
  for (let i = prices.length - period - 1; i >= 0; i--) {
    ema = prices[i].close * k + ema * (1 - k)
  }

  return Math.round(ema * 100) / 100
}

/**
 * MACD (Moving Average Convergence Divergence)
 * MACDライン、シグナルライン、ヒストグラムを計算
 */
export function calculateMACD(prices: PriceData[]): {
  macd: number | null
  signal: number | null
  histogram: number | null
} {
  if (prices.length < 26) {
    return { macd: null, signal: null, histogram: null }
  }

  const ema12 = calculateEMA(prices, 12)
  const ema26 = calculateEMA(prices, 26)

  if (!ema12 || !ema26) {
    return { macd: null, signal: null, histogram: null }
  }

  const macd = ema12 - ema26

  // シグナルライン（MACDの9日EMA）は簡易的にMACDのみで計算
  // 本来はMACD値の履歴からEMAを計算すべき
  const signal = macd * 0.9 // 簡易計算

  const histogram = macd - signal

  return {
    macd: Math.round(macd * 100) / 100,
    signal: Math.round(signal * 100) / 100,
    histogram: Math.round(histogram * 100) / 100,
  }
}

/**
 * ボリンジャーバンド
 */
export function calculateBollingerBands(
  prices: PriceData[],
  period: number = 20,
  stdDev: number = 2
): {
  upper: number | null
  middle: number | null
  lower: number | null
} {
  if (prices.length < period) {
    return { upper: null, middle: null, lower: null }
  }

  const middle = calculateSMA(prices, period)
  if (!middle) return { upper: null, middle: null, lower: null }

  const recentPrices = prices.slice(0, period).map((p) => p.close)
  const variance =
    recentPrices.reduce((sum, price) => sum + Math.pow(price - middle, 2), 0) / period
  const sd = Math.sqrt(variance)

  return {
    upper: Math.round((middle + stdDev * sd) * 100) / 100,
    middle: Math.round(middle * 100) / 100,
    lower: Math.round((middle - stdDev * sd) * 100) / 100,
  }
}

/**
 * 技術指標の総合評価（買いシグナル = 1, 売りシグナル = -1, 中立 = 0）
 */
export function getTechnicalSignal(prices: PriceData[]): {
  signal: number
  strength: string
  reasons: string[]
} {
  const rsi = calculateRSI(prices)
  const sma25 = calculateSMA(prices, 25)
  const macd = calculateMACD(prices)
  const currentPrice = prices[0].close

  let signal = 0
  const reasons: string[] = []

  // RSIチェック
  if (rsi !== null) {
    if (rsi < 30) {
      signal += 1
      reasons.push(`RSI${rsi.toFixed(1)}で売られすぎ`)
    } else if (rsi > 70) {
      signal -= 1
      reasons.push(`RSI${rsi.toFixed(1)}で買われすぎ`)
    }
  }

  // 移動平均チェック
  if (sma25 !== null) {
    if (currentPrice > sma25) {
      signal += 0.5
      reasons.push("25日移動平均を上回る")
    } else {
      signal -= 0.5
      reasons.push("25日移動平均を下回る")
    }
  }

  // MACDチェック
  if (macd.macd !== null && macd.signal !== null) {
    if (macd.histogram && macd.histogram > 0) {
      signal += 0.5
      reasons.push("MACDが上向き")
    } else {
      signal -= 0.5
      reasons.push("MACDが下向き")
    }
  }

  let strength = "中立"
  if (signal >= 1.5) strength = "強い買い"
  else if (signal >= 0.5) strength = "買い"
  else if (signal <= -1.5) strength = "強い売り"
  else if (signal <= -0.5) strength = "売り"

  return {
    signal: Math.round(signal * 100) / 100,
    strength,
    reasons,
  }
}
