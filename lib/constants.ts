/**
 * アプリケーション全体で使用する定数
 */

// 銘柄管理の制限
export const MAX_PORTFOLIO_STOCKS = 100;
export const MAX_WATCHLIST_STOCKS = 100;
export const MAX_TRACKED_STOCKS = 100;

// データ取得の制限
export const MAX_PASSED_STOCKS_RETRIEVE = 20;

// 株価取得のバッチサイズ（1リクエストあたりの銘柄数）
export const STOCK_PRICE_BATCH_SIZE = 10;

// 株価取得失敗の警告閾値（上場廃止の可能性）
export const FETCH_FAIL_WARNING_THRESHOLD = 3;

// 株価データの鮮度チェック（日数）: これより古いデータは無視
export const STALE_DATA_DAYS = 14;

// デフォルト値
export const DEFAULT_INVESTMENT_BUDGET = 100000;

// テクニカル指標の閾値
export const RSI_THRESHOLDS = {
  OVERBOUGHT: 70,
  SLIGHTLY_OVERBOUGHT: 60,
  OVERSOLD: 30,
  SLIGHTLY_OVERSOLD: 40,
} as const;

export const MACD_THRESHOLDS = {
  STRONG_UPTREND: 1,
  UPTREND: 0,
  STRONG_DOWNTREND: -1,
} as const;

// 財務指標の閾値
export const MARKET_CAP_THRESHOLDS = {
  LARGE: 10000, // 10兆円以上
  MEDIUM: 1000, // 1000億円以上
} as const;

export const DIVIDEND_THRESHOLDS = {
  HIGH: 4, // 4%以上
  NORMAL: 2, // 2%以上
} as const;

export const PBR_THRESHOLDS = {
  FAIR_VALUE: 1, // 1未満 = 割安
  SLIGHTLY_HIGH: 1.5, // 1.5未満 = 適正
} as const;

// ポートフォリオ分析の閾値
export const PORTFOLIO_ANALYSIS = {
  // 購入直後の猶予期間（日数）: この期間中は売り推奨を抑制
  RECENT_PURCHASE_DAYS: 3,
  // 猶予期間中でも警告する含み損の閾値（%）
  FORCE_SELL_LOSS_THRESHOLD: -15,
} as const;

// OpenAI設定
export const OPENAI_CONFIG = {
  MODEL: "gpt-4o-mini",
  TEMPERATURE: 0.7,
  MAX_TOKENS_ANALYSIS: 600,
  MAX_TOKENS_RECOMMENDATION: 500,
} as const;

// チャットAI設定
export const CHAT_CONFIG = {
  MAX_STEPS: 3, // ツール呼び出しの最大ステップ数
  MODEL: "gpt-4o-mini",
  TEMPERATURE: 0.7,
  MAX_TOKENS: 3000,
} as const;

// AI分析の更新スケジュール（平日のみ）
export const UPDATE_SCHEDULES = {
  // あなたへのおすすめ
  PERSONAL_RECOMMENDATIONS: "9:30 / 13:00 / 15:35",
  // ポートフォリオ分析・購入レコメンド（stock-predictions.yml）
  STOCK_ANALYSIS: "9:30 / 10:30 / 13:00 / 14:00 / 15:30",
} as const;

// キャッシュTTL（ミリ秒）
export const CACHE_TTL = {
  USER_STOCKS: 5 * 60 * 1000, // 5分
  TRACKED_STOCKS: 5 * 60 * 1000, // 5分
  SOLD_STOCKS: 5 * 60 * 1000, // 5分
  STOCK_PRICES: 30 * 1000, // 30秒
  PORTFOLIO_SUMMARY: 2 * 60 * 1000, // 2分
} as const;

// 市場指標の閾値
export const MARKET_INDEX = {
  CRASH_THRESHOLD: -5, // 急落判定（週間変化率%）
  UP_TREND_THRESHOLD: 3, // 上昇トレンド判定（週間変化率%）
  DOWN_TREND_THRESHOLD: -3, // 下落トレンド判定（週間変化率%）
} as const;

// バッジ表示設定
// 各種ステータスの英語キーから表示テキスト・色を一元管理

// ポートフォリオ個別銘柄ステータス
export const PORTFOLIO_STATUS_CONFIG: Record<
  string,
  {
    text: string;
    color: string;
    bg: string;
  }
> = {
  全力買い: { text: "全力買い", color: "text-purple-700", bg: "bg-purple-50" },
  押し目買い: {
    text: "押し目買い",
    color: "text-green-700",
    bg: "bg-green-50",
  },
  ホールド: { text: "ホールド", color: "text-blue-700", bg: "bg-blue-50" },
  戻り売り: { text: "戻り売り", color: "text-amber-700", bg: "bg-amber-50" },
  即時売却: { text: "即時売却", color: "text-red-700", bg: "bg-red-50" },
  // 互換性維持のためのエイリアス
  good: { text: "押し目買い", color: "text-green-700", bg: "bg-green-50" },
  neutral: { text: "ホールド", color: "text-blue-700", bg: "bg-blue-50" },
  warning: { text: "戻り売り", color: "text-amber-700", bg: "bg-amber-50" },
  caution: { text: "戻り売り", color: "text-amber-700", bg: "bg-amber-50" },
};

// ウォッチリスト購入判断
export const PURCHASE_JUDGMENT_CONFIG: Record<
  string,
  {
    text: string;
    color: string;
    bg: string;
  }
> = {
  buy: { text: "買い推奨", color: "text-green-700", bg: "bg-green-50" },
  stay: { text: "様子見", color: "text-blue-700", bg: "bg-blue-50" },
  avoid: { text: "見送り推奨", color: "text-red-700", bg: "bg-red-50" },
};

// ポートフォリオ総評ステータス
export const OVERALL_STATUS_CONFIG: Record<
  string,
  {
    color: string;
    bg: string;
  }
> = {
  excellent: { color: "text-green-800", bg: "bg-green-100" },
  good: { color: "text-blue-800", bg: "bg-blue-100" },
  neutral: { color: "text-gray-800", bg: "bg-gray-100" },
  caution: { color: "text-yellow-800", bg: "bg-yellow-100" },
  warning: { color: "text-red-800", bg: "bg-red-100" },
};

// 指標評価バッジ
export const EVALUATION_BADGE_CONFIG: Record<
  string,
  {
    color: string;
    bg: string;
  }
> = {
  good: { color: "text-green-700", bg: "bg-green-100" },
  neutral: { color: "text-gray-700", bg: "bg-gray-100" },
  warning: { color: "text-yellow-700", bg: "bg-yellow-100" },
};

// 投資テーマバッジ（おすすめの根拠）
export const INVESTMENT_THEME_CONFIG: Record<
  string,
  {
    text: string;
    color: string;
    bg: string;
    icon: string;
  }
> = {
  短期成長: {
    text: "短期成長",
    color: "text-orange-700",
    bg: "bg-orange-50",
    icon: "🚀",
  },
  中長期安定成長: {
    text: "中長期安定成長",
    color: "text-blue-700",
    bg: "bg-blue-50",
    icon: "📈",
  },
  高配当: {
    text: "高配当",
    color: "text-emerald-700",
    bg: "bg-emerald-50",
    icon: "💰",
  },
  割安反発: {
    text: "割安反発",
    color: "text-purple-700",
    bg: "bg-purple-50",
    icon: "💎",
  },
  テクニカル好転: {
    text: "テクニカル好転",
    color: "text-cyan-700",
    bg: "bg-cyan-50",
    icon: "📊",
  },
  安定ディフェンシブ: {
    text: "安定ディフェンシブ",
    color: "text-teal-700",
    bg: "bg-teal-50",
    icon: "🛡️",
  },
};

// 投資テーマのenumリスト（AI生成用）
export const INVESTMENT_THEMES = Object.keys(INVESTMENT_THEME_CONFIG);

// 市場シグナルバッジ
export const MARKET_SIGNAL_CONFIG: Record<
  string,
  {
    text: string;
    color: string;
    bg: string;
    icon: string;
  }
> = {
  bullish: {
    text: "上昇優勢",
    color: "text-green-700",
    bg: "bg-green-100",
    icon: "↑",
  },
  neutral: {
    text: "横ばい",
    color: "text-gray-600",
    bg: "bg-gray-100",
    icon: "→",
  },
  bearish: {
    text: "下落優勢",
    color: "text-red-700",
    bg: "bg-red-100",
    icon: "↓",
  },
};

// 移動平均乖離率の閾値
export const MA_DEVIATION = {
  PERIOD: 25, // 移動平均の期間（日）
  UPPER_THRESHOLD: 20, // 上方乖離の閾値（%）
  LOWER_THRESHOLD: -20, // 下方乖離の閾値（%）
  CONFIDENCE_PENALTY: -0.15, // 上方乖離時のconfidenceペナルティ
  CONFIDENCE_BONUS: 0.1, // 下方乖離時のconfidenceボーナス
  SCORE_PENALTY: -20, // 日次おすすめのスコアペナルティ
  SCORE_BONUS: 10, // 日次おすすめのスコアボーナス
  LOW_VOLATILITY_THRESHOLD: 30, // 低ボラティリティの閾値（%）
  DIP_BUY_THRESHOLD: 5, // 乖離率(%)がこれを超えたら押し目買い推奨
  RSI_OVERBOUGHT_THRESHOLD: 70, // RSIがこれを超えたら押し目買い推奨
} as const;

// モメンタム（トレンドフォロー）の閾値
export const MOMENTUM = {
  // 下落トレンド検出（週間変化率 %）: これ以下で buy → stay
  SHORT_TERM_DECLINE_THRESHOLD: -10, // 短期投資: -10% で下落判定
  MEDIUM_TERM_DECLINE_THRESHOLD: -15, // 中期投資: -15% で下落判定
  LONG_TERM_DECLINE_THRESHOLD: -20, // 長期投資: -20% で下落判定
  DEFAULT_DECLINE_THRESHOLD: -15, // 投資期間未設定時のデフォルト
  DECLINE_CONFIDENCE_PENALTY: -0.1, // 下落トレンド時のconfidenceペナルティ
  // 急騰銘柄ルールの投資期間別閾値（週間変化率 %）: これ以上で buy → stay
  SHORT_TERM_SURGE_THRESHOLD: null, // 短期投資: 制限なし（モメンタム重視）
  MEDIUM_TERM_SURGE_THRESHOLD: 40, // 中期投資: +40% 以上でブロック
  LONG_TERM_SURGE_THRESHOLD: 30, // 長期投資: +30% 以上でブロック（現行維持）
  DEFAULT_SURGE_THRESHOLD: 30, // 投資期間未設定時のデフォルト
  // 過熱圏ルール: 短期投資は無効化
  SHORT_TERM_SKIP_OVERHEAT: true, // 短期投資: 過熱圏ルールをスキップ
  // おすすめスコアリング用ペナルティ
  DECLINE_SCORE_PENALTY: -15, // 下落銘柄のスコアペナルティ
  STRONG_DECLINE_SCORE_PENALTY: -25, // 強い下落銘柄のスコアペナルティ
} as const;

// 売りタイミング判断の閾値
export const SELL_TIMING = {
  DEVIATION_LOWER_THRESHOLD: -5, // 乖離率がこれ未満で戻り売り推奨
  RSI_OVERSOLD_THRESHOLD: 30, // RSIがこれ未満で戻り売り推奨
  PANIC_SELL_THRESHOLD: -20, // 乖離率がこれ以下でsell→hold強制補正
  PROFIT_TAKING_THRESHOLD: 10, // 利益率(%)がこれ以上で利確優先
  STOP_LOSS_THRESHOLD: -15, // 損失率(%)がこれ以下で損切り優先
  NEAR_AVERAGE_PRICE_THRESHOLD: 5, // 平均購入価格から+5%以内は「平均価格に近い」とみなす（指値提案）
  TREND_OVERRIDE_LOSS_THRESHOLD: -15, // 中長期トレンド保護を無視する損失閾値(%)
  SELL_PRICE_PROXIMITY_THRESHOLD: 0.02, // 売却目標近接の閾値（比率）
} as const;

// 出来高分析の閾値（下落日 vs 上昇日の出来高比較）
export const VOLUME_ANALYSIS = {
  ANALYSIS_DAYS: 10, // 分析対象の直近日数
  // 下落日出来高 / 上昇日出来高 の比率
  DISTRIBUTION_THRESHOLD: 1.5, // これ以上 → 分配売り（構造的な下落シグナル）
  ACCUMULATION_THRESHOLD: 0.7, // これ以下 → 出来高を伴わない調整（一時的な下落シグナル）
} as const;

// 相対強度分析の閾値（銘柄 vs 市場/セクター）
export const RELATIVE_STRENGTH = {
  // 銘柄変化率 - 市場変化率（%）: これ以上でアウトパフォーム
  OUTPERFORM_THRESHOLD: 3,
  // 銘柄変化率 - 市場変化率（%）: これ以下でアンダーパフォーム
  UNDERPERFORM_THRESHOLD: -3,
  // 下落局面でアウトパフォームしている場合、sellをholdに戻す閾値
  OUTPERFORM_SELL_PROTECTION: 3,
} as const;

// セクタートレンド分析の閾値・重み
export const SECTOR_TREND = {
  UP_THRESHOLD: 20, // compositeScore >= 20 → "up"
  DOWN_THRESHOLD: -20, // compositeScore <= -20 → "down"
  US_INFLUENCE_WEIGHT: 0.7, // US→JPの影響度係数
  // 総合スコアの重み配分
  NEWS_WEIGHT: 0.4, // ニューススコアの重み
  PRICE_WEIGHT: 0.4, // 株価モメンタムの重み
  VOLUME_WEIGHT: 0.2, // 出来高スコアの重み
  // スケーリング用キャップ
  PRICE_CLAMP: 10, // weekChangeRate のキャップ（±%）
  VOLUME_CLAMP: 1, // volumeRatio - 1.0 のキャップ（±）
  // 強弱閾値
  STRONG_UP_THRESHOLD: 40, // 強い追い風の閾値
  STRONG_DOWN_THRESHOLD: -40, // 強い逆風の閾値
  // おすすめスコアリングへのボーナス/ペナルティ
  STRONG_UP_BONUS: 15, // compositeScore >= 40 → +15点
  UP_BONUS: 10, // compositeScore >= 20 → +10点
  DOWN_PENALTY: -5, // compositeScore <= -20 → -5点
  STRONG_DOWN_PENALTY: -10, // compositeScore <= -40 → -10点
} as const;

// 10セクターの定義
export const SECTORS = [
  "半導体・電子部品",
  "自動車",
  "金融",
  "医薬品",
  "IT・サービス",
  "エネルギー",
  "通信",
  "小売",
  "不動産",
  "素材",
] as const;
