/**
 * ティッカーコードのユーティリティ関数
 *
 * 東京証券取引所の銘柄には `.T` サフィックスが必要
 * このモジュールで一貫した処理を提供
 */

/**
 * ティッカーコードを正規化（.T サフィックスを確実に付与）
 *
 * @param tickerCode - 元のティッカーコード（例: "7203" or "7203.T"）
 * @returns 正規化されたティッカーコード（例: "7203.T"）
 *
 * @example
 * normalizeTickerCode("7203") // "7203.T"
 * normalizeTickerCode("7203.T") // "7203.T"
 */
export function normalizeTickerCode(tickerCode: string): string {
  if (!tickerCode) {
    throw new Error("tickerCode is required")
  }

  // すでに .T がついている場合はそのまま返す
  if (tickerCode.endsWith(".T")) {
    return tickerCode
  }

  // .T がついていない場合は追加
  return `${tickerCode}.T`
}

/**
 * ティッカーコードから .T サフィックスを削除
 *
 * @param tickerCode - ティッカーコード（例: "7203.T"）
 * @returns サフィックスなしのコード（例: "7203"）
 *
 * @example
 * removeTickerSuffix("7203.T") // "7203"
 * removeTickerSuffix("7203") // "7203"
 */
export function removeTickerSuffix(tickerCode: string): string {
  if (!tickerCode) {
    throw new Error("tickerCode is required")
  }

  return tickerCode.replace(".T", "")
}

/**
 * ティッカーコード配列を正規化
 *
 * @param tickerCodes - ティッカーコード配列
 * @returns 正規化されたティッカーコード配列
 *
 * @example
 * normalizeTickerCodes(["7203", "9432.T"]) // ["7203.T", "9432.T"]
 */
export function normalizeTickerCodes(tickerCodes: string[]): string[] {
  return tickerCodes.map(normalizeTickerCode)
}

/**
 * Yahoo Finance用にティッカーコードを準備
 * （normalizeTickerCodeのエイリアス）
 *
 * @param tickerCode - 元のティッカーコード
 * @returns Yahoo Finance用のティッカーコード
 */
export function prepareTickerForYahoo(tickerCode: string): string {
  return normalizeTickerCode(tickerCode)
}

/**
 * データベース保存用にティッカーコードを準備
 * （現在は .T 付きで統一しているため、normalizeTickerCodeのエイリアス）
 *
 * @param tickerCode - 元のティッカーコード
 * @returns データベース保存用のティッカーコード
 */
export function prepareTickerForDB(tickerCode: string): string {
  return normalizeTickerCode(tickerCode)
}
