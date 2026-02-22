/**
 * 株式分析UI表示用データ生成ユーティリティ
 *
 * stock-analysis-context.ts のロジックを再利用し、
 * UI表示用の構造化データを返す関数群。
 *
 * ⚠️ prices 引数はすべて oldest-first（古い順）で渡すこと。
 */

import { analyzeSingleCandle, CandlestickData } from "@/lib/candlestick-patterns"
import { detectChartPatterns, PricePoint, ChartPatternResult } from "@/lib/chart-patterns"
import { calculateRSI, calculateMACD, detectTrendlines, TrendlineInfo } from "@/lib/technical-indicators"
import { OHLCVData } from "@/lib/stock-analysis-context"

// =====================================================
// テクニカル指標データ型
// =====================================================

export type SignalType = "buy" | "sell" | "neutral"
export type TrendType = "bullish" | "bearish" | "neutral"

export interface RSIData {
  value: number
  signal: SignalType
  label: string
  description: string
}

export interface MACDData {
  macdLine: number | null
  signalLine: number | null
  histogram: number | null
  trend: TrendType
  label: string
}

export interface TechnicalIndicators {
  rsi: RSIData | null
  macd: MACDData | null
}

// =====================================================
// ローソク足パターンデータ型
// =====================================================

export interface CandlestickPatternData {
  name: string
  description: string
  signal: SignalType
  strength: number
  recentBuySignals: number
  recentSellSignals: number
}

// =====================================================
// チャートパターンデータ型
// =====================================================

export interface ChartPatternData {
  name: string
  signal: SignalType
  reliability: number
  description: string
}

// =====================================================
// トレンドラインデータ型
// =====================================================

export interface TrendlinePointData {
  index: number
  date: string
  price: number
}

export interface TrendlineData {
  startPoint: TrendlinePointData
  endPoint: TrendlinePointData
  direction: "up" | "flat" | "down"
  currentProjectedPrice: number
  broken: boolean
  touches: number
}

export interface TrendlineAnalysisData {
  support: TrendlineData | null
  resistance: TrendlineData | null
  overallTrend: "uptrend" | "downtrend" | "sideways"
  trendLabel: string
  description: string
}

// =====================================================
// 統合分析データ型
// =====================================================

export interface StockAnalysisData {
  technicalIndicators: TechnicalIndicators
  candlestickPattern: CandlestickPatternData | null
  chartPatterns: ChartPatternData[]
  weekChange: {
    rate: number
    label: string
    isWarning: boolean
  } | null
  trendlines: TrendlineAnalysisData | null
}

// =====================================================
// テクニカル指標計算
// =====================================================

/**
 * RSI / MACD テクニカル指標データを取得する
 * @param prices - OHLCV データ（oldest-first）
 */
export function getTechnicalIndicators(prices: OHLCVData[]): TechnicalIndicators {
  if (prices.length < 26) {
    return { rsi: null, macd: null }
  }

  const pricesForCalc = prices.map(p => ({ close: p.close }))
  const rsiValue = calculateRSI(pricesForCalc, 14)
  const macdResult = calculateMACD(pricesForCalc)

  let rsi: RSIData | null = null
  if (rsiValue !== null) {
    let signal: SignalType = "neutral"
    let label = "通常範囲"
    let description = "特に過熱感なし"

    if (rsiValue <= 30) {
      signal = "buy"
      label = "売られすぎ"
      description = "反発の可能性あり"
    } else if (rsiValue <= 40) {
      signal = "buy"
      label = "やや売られすぎ"
      description = "買いを検討できる水準"
    } else if (rsiValue >= 70) {
      signal = "sell"
      label = "買われすぎ"
      description = "下落の可能性あり"
    } else if (rsiValue >= 60) {
      signal = "sell"
      label = "やや買われすぎ"
      description = "利益確定を検討"
    }

    rsi = { value: rsiValue, signal, label, description }
  }

  let macd: MACDData | null = null
  if (macdResult.histogram !== null) {
    let trend: TrendType = "neutral"
    let label = "横ばい"

    if (macdResult.histogram > 1) {
      trend = "bullish"
      label = "上昇トレンド（勢いあり）"
    } else if (macdResult.histogram > 0) {
      trend = "bullish"
      label = "やや上昇傾向"
    } else if (macdResult.histogram < -1) {
      trend = "bearish"
      label = "下落トレンド（勢いあり）"
    } else if (macdResult.histogram < 0) {
      trend = "bearish"
      label = "やや下落傾向"
    }

    macd = {
      macdLine: macdResult.macd,
      signalLine: macdResult.signal,
      histogram: macdResult.histogram,
      trend,
      label,
    }
  }

  return { rsi, macd }
}

// =====================================================
// ローソク足パターン分析
// =====================================================

/**
 * ローソク足パターンデータを取得する
 * @param prices - OHLCV データ（oldest-first）
 */
export function getCandlestickPattern(prices: OHLCVData[]): CandlestickPatternData | null {
  if (prices.length < 1) return null

  const latest = prices[prices.length - 1]
  const latestCandle: CandlestickData = {
    date: latest.date,
    open: latest.open,
    high: latest.high,
    low: latest.low,
    close: latest.close,
  }
  const pattern = analyzeSingleCandle(latestCandle)

  let buySignals = 0
  let sellSignals = 0
  for (const price of prices.slice(-5)) {
    const p = analyzeSingleCandle({
      date: price.date,
      open: price.open,
      high: price.high,
      low: price.low,
      close: price.close,
    })
    if (p.strength >= 60) {
      if (p.signal === "buy") buySignals++
      else if (p.signal === "sell") sellSignals++
    }
  }

  return {
    name: pattern.pattern,
    description: pattern.description,
    signal: pattern.signal as SignalType,
    strength: pattern.strength,
    recentBuySignals: buySignals,
    recentSellSignals: sellSignals,
  }
}

// =====================================================
// チャートパターン分析
// =====================================================

/**
 * チャートパターンデータを取得する
 * @param prices - OHLCV データ（oldest-first）
 */
export function getChartPatterns(prices: OHLCVData[]): ChartPatternData[] {
  if (prices.length < 15) return []

  const pricePoints: PricePoint[] = prices.map(p => ({
    date: p.date,
    open: p.open,
    high: p.high,
    low: p.low,
    close: p.close,
  }))

  const patterns = detectChartPatterns(pricePoints)

  return patterns.map((p: ChartPatternResult) => ({
    name: p.patternName,
    signal: p.signal as SignalType,
    reliability: p.strength,
    description: p.description,
  }))
}

// =====================================================
// 週間変化率
// =====================================================

/**
 * 週間変化率データを取得する
 * @param prices - OHLCV データ（oldest-first）
 */
export function getWeekChange(prices: OHLCVData[]): {
  rate: number
  label: string
  isWarning: boolean
} | null {
  if (prices.length < 5) return null

  const latestClose = prices[prices.length - 1].close
  const weekAgoClose = prices[Math.max(0, prices.length - 6)].close
  const rate = ((latestClose - weekAgoClose) / weekAgoClose) * 100

  let label = "安定"
  let isWarning = false

  if (rate >= 30) {
    label = "急騰"
    isWarning = true
  } else if (rate >= 10) {
    label = "上昇"
    isWarning = false
  } else if (rate <= -20) {
    label = "急落"
    isWarning = true
  } else if (rate <= -10) {
    label = "下落"
    isWarning = false
  }

  return { rate, label, isWarning }
}

// =====================================================
// トレンドライン分析
// =====================================================

/**
 * TrendlineInfo → UI用TrendlineData に変換する
 */
function toTrendlineData(info: TrendlineInfo): TrendlineData {
  return {
    startPoint: info.startPoint,
    endPoint: info.endPoint,
    direction: info.direction,
    currentProjectedPrice: info.currentProjectedPrice,
    broken: info.broken,
    touches: info.touches,
  }
}

/**
 * トレンドラインデータを取得する
 * @param prices - OHLCV データ（oldest-first）
 */
export function getTrendlines(prices: OHLCVData[]): TrendlineAnalysisData | null {
  if (prices.length < 15) return null

  const result = detectTrendlines(prices)

  if (!result.support && !result.resistance) return null

  const trendLabels: Record<string, string> = {
    uptrend: "上昇トレンド",
    downtrend: "下降トレンド",
    sideways: "横ばい（レンジ）",
  }
  const trendLabel = trendLabels[result.overallTrend]

  // 説明文を生成
  const parts: string[] = []
  if (result.support) {
    const dirLabel = result.support.direction === "up" ? "上昇" : result.support.direction === "down" ? "下降" : "水平"
    parts.push(
      `サポートライン: ${dirLabel}方向（${result.support.touches}回接触${result.support.broken ? "、ブレイクダウン発生" : ""}）`
    )
  }
  if (result.resistance) {
    const dirLabel = result.resistance.direction === "up" ? "上昇" : result.resistance.direction === "down" ? "下降" : "水平"
    parts.push(
      `レジスタンスライン: ${dirLabel}方向（${result.resistance.touches}回接触${result.resistance.broken ? "、ブレイクアウト発生" : ""}）`
    )
  }

  return {
    support: result.support ? toTrendlineData(result.support) : null,
    resistance: result.resistance ? toTrendlineData(result.resistance) : null,
    overallTrend: result.overallTrend,
    trendLabel,
    description: parts.join("。"),
  }
}

// =====================================================
// 統合関数
// =====================================================

/**
 * 株式分析データを一括取得する
 * @param prices - OHLCV データ（oldest-first）
 */
export function getStockAnalysisData(prices: OHLCVData[]): StockAnalysisData {
  return {
    technicalIndicators: getTechnicalIndicators(prices),
    candlestickPattern: getCandlestickPattern(prices),
    chartPatterns: getChartPatterns(prices),
    weekChange: getWeekChange(prices),
    trendlines: getTrendlines(prices),
  }
}
