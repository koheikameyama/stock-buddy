/**
 * UIコンポーネントのスタイル設定
 * カード表示やボタンのスタイルを一元管理
 */

// カードフッターのアクションボタンスタイル
export const ACTION_BUTTON_STYLES = {
  // ベーススタイル（共通）
  base: "px-2 py-1 text-xs font-medium rounded transition-colors",

  // 気になる（ウォッチリスト追加）
  watchlist: "text-green-600 hover:bg-green-50",

  // 追跡
  tracked: "text-gray-600 hover:bg-gray-100",

  // 購入
  purchase: "text-green-600 hover:bg-green-50",

  // 追加購入
  additionalPurchase: "text-blue-600 hover:bg-blue-50",

  // 売却
  sell: "text-orange-600 hover:bg-orange-50",

  // 無効状態
  disabled: "disabled:opacity-50",
  disabledAlt: "disabled:text-gray-400 disabled:hover:bg-transparent",
} as const

// ボタンバリアント型
type ActionButtonVariant = "watchlist" | "tracked" | "purchase" | "additionalPurchase" | "sell"

// ボタンスタイルを結合するヘルパー
export const getActionButtonClass = (
  variant: ActionButtonVariant,
  options?: { disabled?: boolean; disabledAlt?: boolean }
): string => {
  const classes: string[] = [ACTION_BUTTON_STYLES.base, ACTION_BUTTON_STYLES[variant]]

  if (options?.disabled) {
    classes.push(ACTION_BUTTON_STYLES.disabled)
  }
  if (options?.disabledAlt) {
    classes.push(ACTION_BUTTON_STYLES.disabledAlt)
  }

  return classes.join(" ")
}

// カードフッターのスタイル
export const CARD_FOOTER_STYLES = {
  // コンテナ
  container: "flex items-center justify-between pt-2 mt-2 border-t border-gray-100",
  containerLarge: "flex items-center justify-between pt-3 mt-3 border-t border-gray-100",
  containerSold: "flex items-center justify-between mt-4 pt-4 border-t border-gray-200",

  // アクションボタングループ
  actionGroup: "flex items-center gap-1",

  // 詳細リンク
  detailLink: "flex items-center text-blue-600",
  detailLinkText: "text-sm font-medium",
} as const

// アクションボタンのラベル
export const ACTION_BUTTON_LABELS = {
  watchlist: "+気になる",
  tracked: "+追跡",
  purchase: "+購入",
  additionalPurchase: "+追加購入",
  sell: "+売却",

  // 登録済み状態
  watchlistDone: "気になる済",
  trackedDone: "追跡済",
} as const
