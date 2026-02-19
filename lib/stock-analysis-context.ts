/**
 * 株式分析プロンプト用コンテキスト生成ユーティリティ
 *
 * purchase-recommendation と portfolio-analysis の両ルートで共通して使用する
 * プロンプトコンテキスト文字列ビルダー関数群。
 *
 * ⚠️ prices 引数はすべて oldest-first（古い順）で渡すこと。
 */

import { analyzeSingleCandle, CandlestickData } from "@/lib/candlestick-patterns"
import { detectChartPatterns, formatChartPatternsForPrompt, PricePoint } from "@/lib/chart-patterns"
import { calculateRSI, calculateMACD, calculateDeviationRate } from "@/lib/technical-indicators"
import { MA_DEVIATION, FETCH_FAIL_WARNING_THRESHOLD } from "@/lib/constants"
import { MarketIndexData } from "@/lib/market-index"

// OHLCV データ型（oldest-first で渡す）
export interface OHLCVData {
  date: string
  open: number
  high: number
  low: number
  close: number
}

// 財務指標フィールド型（Prisma Decimal / number / null すべて受け入れる）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DecimalLike = any

export interface StockFinancials {
  marketCap?: DecimalLike
  dividendYield?: DecimalLike
  pbr?: DecimalLike
  per?: DecimalLike
  roe?: DecimalLike
  isProfitable?: boolean | null
  profitTrend?: string | null
  revenueGrowth?: DecimalLike
  eps?: DecimalLike
  fiftyTwoWeekHigh?: DecimalLike
  fiftyTwoWeekLow?: DecimalLike
}

/**
 * 財務指標コンテキスト文字列を生成する
 * @param stock - 財務指標フィールドを持つ銘柄オブジェクト
 * @param currentPrice - 現在株価（52週レンジ算出に使用）
 */
export function buildFinancialMetrics(
  stock: StockFinancials,
  currentPrice: number | null
): string {
  const metrics: string[] = []

  if (stock.marketCap) {
    const marketCap = Number(stock.marketCap)
    if (marketCap >= 10000) {
      metrics.push(`- 会社の規模: 大企業（時価総額${(marketCap / 10000).toFixed(1)}兆円）`)
    } else if (marketCap >= 1000) {
      metrics.push(`- 会社の規模: 中堅企業（時価総額${marketCap.toFixed(0)}億円）`)
    } else {
      metrics.push(`- 会社の規模: 小型企業（時価総額${marketCap.toFixed(0)}億円）`)
    }
  }

  if (stock.dividendYield) {
    const divYield = Number(stock.dividendYield)
    if (divYield >= 4) {
      metrics.push(`- 配当: 高配当（年${divYield.toFixed(2)}%）`)
    } else if (divYield >= 2) {
      metrics.push(`- 配当: 普通（年${divYield.toFixed(2)}%）`)
    } else if (divYield > 0) {
      metrics.push(`- 配当: 低め（年${divYield.toFixed(2)}%）`)
    } else {
      metrics.push("- 配当: なし")
    }
  }

  if (stock.pbr) {
    const pbr = Number(stock.pbr)
    if (pbr < 1) {
      metrics.push("- 株価水準(PBR): 割安（資産価値より安い）")
    } else if (pbr < 1.5) {
      metrics.push("- 株価水準(PBR): 適正")
    } else {
      metrics.push("- 株価水準(PBR): やや割高")
    }
  }

  // PER（株価収益率）
  if (stock.per) {
    const per = Number(stock.per)
    if (per < 0) {
      metrics.push("- 収益性(PER): 赤字のため算出不可")
    } else if (per < 10) {
      metrics.push(`- 収益性(PER): 割安（${per.toFixed(1)}倍）`)
    } else if (per < 20) {
      metrics.push(`- 収益性(PER): 適正（${per.toFixed(1)}倍）`)
    } else if (per < 30) {
      metrics.push(`- 収益性(PER): やや割高（${per.toFixed(1)}倍）`)
    } else {
      metrics.push(`- 収益性(PER): 割高（${per.toFixed(1)}倍）`)
    }
  }

  // ROE（自己資本利益率）
  if (stock.roe) {
    const roe = Number(stock.roe) * 100 // 小数点で保存されている場合
    if (roe >= 15) {
      metrics.push(`- 経営効率(ROE): 優秀（${roe.toFixed(1)}%）`)
    } else if (roe >= 10) {
      metrics.push(`- 経営効率(ROE): 良好（${roe.toFixed(1)}%）`)
    } else if (roe >= 5) {
      metrics.push(`- 経営効率(ROE): 普通（${roe.toFixed(1)}%）`)
    } else if (roe > 0) {
      metrics.push(`- 経営効率(ROE): 低め（${roe.toFixed(1)}%）`)
    } else {
      metrics.push(`- 経営効率(ROE): 赤字`)
    }
  }

  // 業績トレンド
  if (stock.isProfitable !== null && stock.isProfitable !== undefined) {
    if (stock.isProfitable) {
      if (stock.profitTrend === "increasing") {
        metrics.push("- 業績: 黒字（利益増加傾向）")
      } else if (stock.profitTrend === "decreasing") {
        metrics.push("- 業績: 黒字（利益減少傾向）")
      } else {
        metrics.push("- 業績: 黒字")
      }
    } else {
      metrics.push("- 業績: 赤字")
    }
  }

  // 売上成長率
  if (stock.revenueGrowth) {
    const growth = Number(stock.revenueGrowth)
    if (growth >= 20) {
      metrics.push(`- 売上成長: 急成長（前年比+${growth.toFixed(1)}%）`)
    } else if (growth >= 10) {
      metrics.push(`- 売上成長: 好調（前年比+${growth.toFixed(1)}%）`)
    } else if (growth >= 0) {
      metrics.push(`- 売上成長: 安定（前年比+${growth.toFixed(1)}%）`)
    } else if (growth >= -10) {
      metrics.push(`- 売上成長: やや減少（前年比${growth.toFixed(1)}%）`)
    } else {
      metrics.push(`- 売上成長: 減少傾向（前年比${growth.toFixed(1)}%）`)
    }
  }

  // EPS（1株当たり利益）
  if (stock.eps) {
    const eps = Number(stock.eps)
    if (eps > 0) {
      metrics.push(`- 1株利益(EPS): ${eps.toFixed(0)}円`)
    } else {
      metrics.push(`- 1株利益(EPS): 赤字`)
    }
  }

  if (stock.fiftyTwoWeekHigh && stock.fiftyTwoWeekLow && currentPrice) {
    const high = Number(stock.fiftyTwoWeekHigh)
    const low = Number(stock.fiftyTwoWeekLow)
    const position = high !== low ? ((currentPrice - low) / (high - low)) * 100 : 50
    metrics.push(`- 1年間の値動き: 高値${high.toFixed(0)}円〜安値${low.toFixed(0)}円（現在は${position.toFixed(0)}%の位置）`)
  }

  return metrics.length > 0 ? metrics.join("\n") : "財務データなし"
}

/**
 * ローソク足パターン分析コンテキスト文字列を生成する
 * @param prices - OHLCV データ（oldest-first）
 */
export function buildCandlestickContext(prices: OHLCVData[]): string {
  if (prices.length < 1) return ""

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

  return `
【ローソク足パターン分析】
- 最新パターン: ${pattern.description}
- シグナル: ${pattern.signal}
- 強さ: ${pattern.strength}%
- 直近5日の買いシグナル: ${buySignals}回
- 直近5日の売りシグナル: ${sellSignals}回
`
}

/**
 * RSI / MACD テクニカル指標コンテキスト文字列を生成する
 * @param prices - OHLCV データ（oldest-first）
 */
export function buildTechnicalContext(prices: OHLCVData[]): string {
  if (prices.length < 26) return ""

  const pricesForCalc = prices.map(p => ({ close: p.close }))
  const rsi = calculateRSI(pricesForCalc, 14)
  const macd = calculateMACD(pricesForCalc)

  let rsiInterpretation = ""
  if (rsi !== null) {
    if (rsi <= 30) {
      rsiInterpretation = `${rsi.toFixed(1)}（売られすぎ → 反発の可能性あり）`
    } else if (rsi <= 40) {
      rsiInterpretation = `${rsi.toFixed(1)}（やや売られすぎ）`
    } else if (rsi >= 70) {
      rsiInterpretation = `${rsi.toFixed(1)}（買われすぎ → 下落の可能性あり）`
    } else if (rsi >= 60) {
      rsiInterpretation = `${rsi.toFixed(1)}（やや買われすぎ）`
    } else {
      rsiInterpretation = `${rsi.toFixed(1)}（通常範囲）`
    }
  }

  let macdInterpretation = ""
  if (macd.histogram !== null) {
    if (macd.histogram > 1) {
      macdInterpretation = "上昇トレンド（勢いあり）"
    } else if (macd.histogram > 0) {
      macdInterpretation = "やや上昇傾向"
    } else if (macd.histogram < -1) {
      macdInterpretation = "下落トレンド（勢いあり）"
    } else if (macd.histogram < 0) {
      macdInterpretation = "やや下落傾向"
    } else {
      macdInterpretation = "横ばい"
    }
  }

  if (rsi === null && macd.histogram === null) return ""

  return `
【テクニカル指標】
${rsi !== null ? `- RSI（売られすぎ・買われすぎの指標）: ${rsiInterpretation}` : ""}
${macd.histogram !== null ? `- MACD（トレンドの勢い指標）: ${macdInterpretation}` : ""}
`
}

/**
 * 移動平均乖離率コンテキスト文字列を生成する
 * @param prices - OHLCV データ（oldest-first）
 */
export function buildDeviationRateContext(prices: OHLCVData[]): string {
  if (prices.length < MA_DEVIATION.PERIOD) return ""

  // oldest-first → newest-first に変換して乖離率を計算
  const pricesForCalc = [...prices].reverse().map(p => ({ close: p.close }))
  const rate = calculateDeviationRate(pricesForCalc, MA_DEVIATION.PERIOD)
  if (rate === null) return ""

  let interpretation = ""
  if (rate >= MA_DEVIATION.UPPER_THRESHOLD) {
    interpretation = `${rate.toFixed(1)}%（過熱圏。高値づかみリスクに注意）`
  } else if (rate <= MA_DEVIATION.LOWER_THRESHOLD) {
    interpretation = `${rate.toFixed(1)}%（売られすぎ圏。リバウンドの可能性あり）`
  } else if (Math.abs(rate) <= 5) {
    interpretation = `${rate >= 0 ? "+" : ""}${rate.toFixed(1)}%（移動平均線に沿った安定した値動き）`
  } else {
    interpretation = `${rate >= 0 ? "+" : ""}${rate.toFixed(1)}%`
  }

  return `
【移動平均乖離率】
- 25日移動平均線からの乖離率: ${interpretation}
`
}

/**
 * チャートパターン（複数足フォーメーション）コンテキスト文字列を生成する
 * @param prices - OHLCV データ（oldest-first）
 */
export function buildChartPatternContext(prices: OHLCVData[]): string {
  if (prices.length < 15) return ""

  const pricePoints: PricePoint[] = prices.map(p => ({
    date: p.date,
    open: p.open,
    high: p.high,
    low: p.low,
    close: p.close,
  }))
  const chartPatterns = detectChartPatterns(pricePoints)
  if (chartPatterns.length === 0) return ""

  return "\n" + formatChartPatternsForPrompt(chartPatterns)
}

/**
 * 週間変化率コンテキスト文字列と変化率数値を生成する
 *
 * - portfolio モード: 保有銘柄向け（警告閾値 ±10%、中立の場合も常に表示）
 * - watchlist モード: ウォッチリスト向け（警告閾値 ±20%、変化が少ない場合は非表示）
 *
 * @param prices - OHLCV データ（oldest-first）
 * @param mode - "portfolio" | "watchlist"
 */
export function buildWeekChangeContext(
  prices: OHLCVData[],
  mode: "portfolio" | "watchlist" = "portfolio"
): { text: string; rate: number | null } {
  if (prices.length < 5) return { text: "", rate: null }

  const latestClose = prices[prices.length - 1].close
  const weekAgoClose = prices[Math.max(0, prices.length - 6)].close
  const rate = ((latestClose - weekAgoClose) / weekAgoClose) * 100

  let text = ""

  if (mode === "watchlist") {
    if (rate >= 30) {
      text = `
【警告: 急騰銘柄】
- 週間変化率: +${rate.toFixed(1)}%（非常に高い）
- 急騰後は反落リスクが高いため、今買うのは危険な可能性があります
- 「上がりきった銘柄」を避けるため、stayまたはavoidを検討してください`
    } else if (rate >= 20) {
      text = `
【注意: 上昇率が高い】
- 週間変化率: +${rate.toFixed(1)}%
- すでに上昇している可能性があるため、追加上昇余地を慎重に判断してください`
    } else if (rate <= -20) {
      text = `
【注意: 大幅下落】
- 週間変化率: ${rate.toFixed(1)}%
- 下落理由を確認し、反発の可能性を慎重に判断してください`
    }
  } else {
    // portfolio モード
    if (rate >= 30) {
      text = `
【警告: 急騰銘柄】
- 週間変化率: +${rate.toFixed(1)}%（非常に高い）
- 急騰後は反落リスクが高い状態です
`
    } else if (rate >= 10) {
      text = `
【注意: 上昇率が高い】
- 週間変化率: +${rate.toFixed(1)}%
`
    } else if (rate <= -10) {
      text = `
【注意: 大幅下落】
- 週間変化率: ${rate.toFixed(1)}%
`
    } else {
      text = `
【週間変化率】
- 週間変化率: ${rate >= 0 ? "+" : ""}${rate.toFixed(1)}%
`
    }
  }

  return { text, rate }
}

/**
 * marketSignal 定義セクション（両ルート共通）
 *
 * bullish/neutral/bearish の定義と、recommendation と独立して判断する旨を記載。
 * purchase-recommendation・portfolio-analysis の両プロンプトで使用する。
 */
export const PROMPT_MARKET_SIGNAL_DEFINITION = `【marketSignalの定義】
- bullish: テクニカル・ファンダメンタル総合で上昇優勢（RSI底打ち、MACD上昇転換、黒字増益など）
- neutral: どちらとも言えない、横ばい（シグナルが混在、or 材料不足）
- bearish: 下落優勢、リスクが高い（RSI高水準、MACD下降、赤字継続など）
※ marketSignal は recommendation と独立して判断する（強制補正前の純粋な市場シグナル）`

/**
 * ニュース・創作禁止制約（両ルート共通）
 *
 * 提供されていない情報の創作を禁止するルール。
 * purchase-recommendation・portfolio-analysis の両プロンプトで使用する。
 */
export const PROMPT_NEWS_CONSTRAINTS = `- 提供されたニュース情報を参考にしてください
- ニュースにない情報は推測や創作をしないでください
- 決算発表、業績予想、M&A、人事異動など、提供されていない情報を創作しないでください
- 過去の一般知識（例:「○○社は過去に○○した」）は使用しないでください`

/**
 * 市場全体の状況コンテキスト文字列を生成する（両ルート共通）
 * @param marketData - getNikkei225Data() の戻り値
 */
export function buildMarketContext(marketData: MarketIndexData | null): string {
  if (!marketData) return ""

  const trendDesc =
    marketData.trend === "up" ? "上昇傾向" :
    marketData.trend === "down" ? "下落傾向" :
    "横ばい"

  return `
【市場全体の状況】
- 日経平均株価: ${marketData.currentPrice.toLocaleString()}円
- 週間変化率: ${marketData.weekChangeRate >= 0 ? "+" : ""}${marketData.weekChangeRate.toFixed(1)}%
- トレンド: ${trendDesc}

※市場全体の状況を考慮して判断してください。
  市場が弱い中で堅調な銘柄は評価できます。
  市場上昇時は追い風として言及できます。
`
}

/**
 * 上場廃止コンテキスト文字列を生成する
 * @param isDelisted - 上場廃止フラグ
 * @param fetchFailCount - 連続取得失敗回数
 */
export function buildDelistingContext(
  isDelisted: boolean,
  fetchFailCount: number
): string {
  if (isDelisted) {
    return `
【重要: 上場廃止銘柄】
- この銘柄は上場廃止されています
- 表示されている株価は上場廃止前の最終価格であり、現在の取引価格ではありません
- 新規購入は不可能です。保有している場合は証券会社に確認してください
- 「上場廃止の心配はない」「問題ない」などの誤った安心を与える回答は絶対にしないでください
`
  }

  if (fetchFailCount >= FETCH_FAIL_WARNING_THRESHOLD) {
    return `
【警告: 上場廃止の可能性】
- この銘柄は株価データの取得に${fetchFailCount}回連続で失敗しています
- 上場廃止された可能性があります
- 表示されている株価は最後に取得できた価格であり、最新ではない可能性があります
- 新規購入は推奨しません
`
  }

  return ""
}
