/**
 * yfinanceを使った銘柄検索（サーバーサイド専用）
 */

import { exec } from "child_process"
import { promisify } from "util"

const execAsync = promisify(exec)

interface YFinanceResult {
  success: boolean
  tickerCode?: string
  name?: string
  market?: string
  sector?: string
  currentPrice?: number
  error?: string
}

/**
 * Pythonスクリプトを使ってyfinanceで銘柄を検索
 *
 * @param query - 銘柄コードまたは銘柄名
 */
export async function searchStockByQuery(query: string): Promise<YFinanceResult> {
  try {
    // Pythonスクリプトを実行
    const pythonScript = `
import sys
import json
import yfinance as yf

def search_stock(query):
    """銘柄を検索"""
    try:
        # クエリが数字のみの場合は.Tを追加
        if query.isdigit():
            ticker = f"{query}.T"
        elif not "." in query:
            # 日本株と仮定して.Tを追加
            ticker = f"{query}.T"
        else:
            ticker = query

        # yfinanceでデータ取得
        stock = yf.Ticker(ticker)
        info = stock.info

        # データが取得できたか確認
        if not info or "symbol" not in info:
            return {"success": False, "error": f"銘柄 '{query}' が見つかりませんでした"}

        # 結果を返す
        result = {
            "success": True,
            "tickerCode": info.get("symbol", ticker),
            "name": info.get("longName") or info.get("shortName") or query,
            "market": "TSE",
            "sector": info.get("sector"),
            "currentPrice": info.get("currentPrice") or info.get("regularMarketPrice"),
        }

        return result
    except Exception as e:
        return {"success": False, "error": str(e)}

if __name__ == "__main__":
    query = sys.argv[1] if len(sys.argv) > 1 else ""
    result = search_stock(query)
    print(json.dumps(result, ensure_ascii=False))
`

    // Pythonスクリプトを実行
    const { stdout, stderr } = await execAsync(
      `python3 -c '${pythonScript.replace(/'/g, "'\\''")}' '${query.replace(/'/g, "'\\''")}'`
    )

    if (stderr) {
      console.error("Python stderr:", stderr)
    }

    // 結果をパース
    const result: YFinanceResult = JSON.parse(stdout.trim())

    return result
  } catch (error) {
    console.error("Error in searchStockByQuery:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "検索中にエラーが発生しました",
    }
  }
}
