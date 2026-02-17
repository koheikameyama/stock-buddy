/**
 * アプリケーション全体で使用する定数
 */

// 銘柄管理の制限
export const MAX_PORTFOLIO_STOCKS = 100
export const MAX_WATCHLIST_STOCKS = 100
export const MAX_TRACKED_STOCKS = 100

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

// ポートフォリオ分析の閾値
export const PORTFOLIO_ANALYSIS = {
  // 購入直後の猶予期間（日数）: この期間中は売り推奨を抑制
  RECENT_PURCHASE_DAYS: 3,
  // 猶予期間中でも警告する含み損の閾値（%）
  FORCE_SELL_LOSS_THRESHOLD: -15,
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
  // ポートフォリオ分析・購入レコメンド（stock-predictions.yml）
  STOCK_ANALYSIS: "8:00 / 10:30 / 12:30 / 14:00 / 15:30",
} as const

// キャッシュTTL（ミリ秒）
export const CACHE_TTL = {
  USER_STOCKS: 5 * 60 * 1000,       // 5分
  TRACKED_STOCKS: 5 * 60 * 1000,    // 5分
  SOLD_STOCKS: 5 * 60 * 1000,       // 5分
  STOCK_PRICES: 2 * 60 * 1000,      // 2分
  PORTFOLIO_SUMMARY: 2 * 60 * 1000, // 2分
} as const
