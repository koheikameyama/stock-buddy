/**
 * アプリケーション全体で使用する定数
 */

// 銘柄管理の制限
export const MAX_PORTFOLIO_STOCKS = 100
export const MAX_WATCHLIST_STOCKS = 100
export const MAX_TRACKED_STOCKS = 100

// データ取得の制限
export const MAX_PASSED_STOCKS_RETRIEVE = 20

// 株価取得失敗の警告閾値（上場廃止の可能性）
export const FETCH_FAIL_WARNING_THRESHOLD = 3

// 株価データの鮮度チェック（日数）: これより古いデータは無視
export const STALE_DATA_DAYS = 14

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

// 市場指標の閾値
export const MARKET_INDEX = {
  CRASH_THRESHOLD: -5,      // 急落判定（週間変化率%）
  UP_TREND_THRESHOLD: 3,    // 上昇トレンド判定（週間変化率%）
  DOWN_TREND_THRESHOLD: -3, // 下落トレンド判定（週間変化率%）
} as const

// バッジ表示設定
// 各種ステータスの英語キーから表示テキスト・色を一元管理

// ポートフォリオ個別銘柄ステータス
export const PORTFOLIO_STATUS_CONFIG: Record<string, {
  text: string
  color: string
  bg: string
}> = {
  good: { text: "買増検討", color: "text-green-700", bg: "bg-green-50" },
  neutral: { text: "様子見", color: "text-blue-700", bg: "bg-blue-50" },
  caution: { text: "注意", color: "text-amber-700", bg: "bg-amber-50" },
  warning: { text: "売却検討", color: "text-red-700", bg: "bg-red-50" },
}

// ウォッチリスト購入判断
export const PURCHASE_JUDGMENT_CONFIG: Record<string, {
  text: string
  color: string
  bg: string
}> = {
  buy: { text: "買い推奨", color: "text-green-700", bg: "bg-green-50" },
  stay: { text: "様子見", color: "text-blue-700", bg: "bg-blue-50" },
  avoid: { text: "見送り推奨", color: "text-red-700", bg: "bg-red-50" },
}

// ポートフォリオ総評ステータス
export const OVERALL_STATUS_CONFIG: Record<string, {
  color: string
  bg: string
}> = {
  excellent: { color: "text-green-800", bg: "bg-green-100" },
  good: { color: "text-blue-800", bg: "bg-blue-100" },
  neutral: { color: "text-gray-800", bg: "bg-gray-100" },
  caution: { color: "text-yellow-800", bg: "bg-yellow-100" },
  warning: { color: "text-red-800", bg: "bg-red-100" },
}

// 指標評価バッジ
export const EVALUATION_BADGE_CONFIG: Record<string, {
  color: string
  bg: string
}> = {
  good: { color: "text-green-700", bg: "bg-green-100" },
  neutral: { color: "text-gray-700", bg: "bg-gray-100" },
  warning: { color: "text-yellow-700", bg: "bg-yellow-100" },
}

// 市場シグナルバッジ
export const MARKET_SIGNAL_CONFIG: Record<string, {
  text: string
  color: string
  bg: string
  icon: string
}> = {
  bullish: { text: "上昇優勢", color: "text-green-700", bg: "bg-green-100", icon: "↑" },
  neutral: { text: "横ばい", color: "text-gray-600", bg: "bg-gray-100", icon: "→" },
  bearish: { text: "下落優勢", color: "text-red-700", bg: "bg-red-100", icon: "↓" },
}

// 移動平均乖離率の閾値
export const MA_DEVIATION = {
  PERIOD: 25,                    // 移動平均の期間（日）
  UPPER_THRESHOLD: 20,           // 上方乖離の閾値（%）
  LOWER_THRESHOLD: -20,          // 下方乖離の閾値（%）
  CONFIDENCE_PENALTY: -0.15,     // 上方乖離時のconfidenceペナルティ
  CONFIDENCE_BONUS: 0.1,         // 下方乖離時のconfidenceボーナス
  SCORE_PENALTY: -20,            // 日次おすすめのスコアペナルティ
  SCORE_BONUS: 10,               // 日次おすすめのスコアボーナス
  LOW_VOLATILITY_THRESHOLD: 30,  // 低ボラティリティの閾値（%）
  DIP_BUY_THRESHOLD: 5,          // 乖離率(%)がこれを超えたら押し目買い推奨
  RSI_OVERBOUGHT_THRESHOLD: 70,  // RSIがこれを超えたら押し目買い推奨
} as const

// 売りタイミング判断の閾値
export const SELL_TIMING = {
  DEVIATION_LOWER_THRESHOLD: -5,        // 乖離率がこれ未満で戻り売り推奨
  RSI_OVERSOLD_THRESHOLD: 30,           // RSIがこれ未満で戻り売り推奨
  PANIC_SELL_THRESHOLD: -20,            // 乖離率がこれ以下でsell→hold強制補正
  PROFIT_TAKING_THRESHOLD: 10,          // 利益率(%)がこれ以上で利確優先
  STOP_LOSS_THRESHOLD: -15,             // 損失率(%)がこれ以下で損切り優先
  NEAR_AVERAGE_PRICE_THRESHOLD: 5,      // 平均購入価格から+5%以内は「平均価格に近い」とみなす（指値提案）
} as const
