/**
 * アプリケーション全体で使用する定数
 */

// 銘柄管理の制限
export const MAX_PORTFOLIO_STOCKS = 100
export const MAX_WATCHLIST_STOCKS = 100
export const MAX_TRACKED_STOCKS = 10

// データ取得の制限
export const MAX_PASSED_STOCKS_RETRIEVE = 20

// デフォルト値
export const DEFAULT_INVESTMENT_BUDGET = 100000

// テクニカル指標の閾値
export const RSI_THRESHOLDS = {
  OVERBOUGHT: 70,
  SLIGHTLY_OVERBOUGHT: 60,
  OVERSOLD: 30,
  SLIGHTLY_OVERSOLD: 40,
} as const

export const MACD_THRESHOLDS = {
  STRONG_UPTREND: 1,
  UPTREND: 0,
  STRONG_DOWNTREND: -1,
} as const

// 財務指標の閾値
export const MARKET_CAP_THRESHOLDS = {
  LARGE: 10000, // 10兆円以上
  MEDIUM: 1000, // 1000億円以上
} as const

export const DIVIDEND_THRESHOLDS = {
  HIGH: 4, // 4%以上
  NORMAL: 2, // 2%以上
} as const

export const PBR_THRESHOLDS = {
  FAIR_VALUE: 1, // 1未満 = 割安
  SLIGHTLY_HIGH: 1.5, // 1.5未満 = 適正
} as const

// OpenAI設定
export const OPENAI_CONFIG = {
  MODEL: "gpt-4o-mini",
  TEMPERATURE: 0.7,
  MAX_TOKENS_ANALYSIS: 600,
  MAX_TOKENS_RECOMMENDATION: 500,
} as const

// AI分析の更新スケジュール（平日のみ）
export const UPDATE_SCHEDULES = {
  // あなたへのおすすめ
  PERSONAL_RECOMMENDATIONS: "8:00 / 12:30 / 15:35",
  // みんなが注目（featured-stocks.yml: morning/afternoonのみ生成）
  FEATURED_STOCKS: "8:00 / 12:30",
  // ポートフォリオ分析・購入レコメンド（stock-predictions.yml）
  STOCK_ANALYSIS: "8:00 / 10:30 / 12:30 / 14:00 / 15:30",
} as const
