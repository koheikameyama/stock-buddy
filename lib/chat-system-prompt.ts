import { getNikkei225Data, getTrendDescription } from "@/lib/market-index"

interface UserSettings {
  investmentPeriod: string
  riskTolerance: string
  investmentBudget: number | null
}

interface StockContext {
  stockId: string
  tickerCode: string
  name: string
  sector: string | null
  currentPrice: number | null
  type: "portfolio" | "watchlist"
  quantity?: number
  averagePurchasePrice?: number
  profit?: number
  profitPercent?: number
}

interface MarketData {
  currentPrice: number
  weekChangeRate: number
  trend: "up" | "down" | "neutral"
  isMarketCrash: boolean
}

export async function buildChatSystemPrompt(
  userSettings: UserSettings | null,
  stockContext?: StockContext
): Promise<string> {
  // 市場データを取得
  let marketData: MarketData | null = null
  try {
    marketData = await getNikkei225Data()
  } catch {
    // 取得失敗しても続行
  }

  const sections: string[] = []

  // ペルソナ
  sections.push(`あなたは投資初心者向けのAIコーチです。
専門用語は使わず、中学生でも分かる言葉で説明してください。
ユーザーの質問に答えるために、必要に応じてツールを使ってデータを取得してください。`)

  // 銘柄コンテキスト
  if (stockContext) {
    let stockInfo = `\n## 質問対象の銘柄
- 銘柄名: ${stockContext.name}
- 証券コード: ${stockContext.tickerCode}
- セクター: ${stockContext.sector ?? "不明"}
- 種別: ${stockContext.type === "portfolio" ? "保有中" : "ウォッチリスト"}`

    if (
      stockContext.type === "portfolio" &&
      stockContext.quantity
    ) {
      stockInfo += `
- 保有株数: ${stockContext.quantity}株
- 平均取得単価: ${(stockContext.averagePurchasePrice ?? 0).toLocaleString()}円
- 評価損益: ${(stockContext.profit ?? 0) >= 0 ? "+" : ""}${(stockContext.profit ?? 0).toLocaleString()}円（${(stockContext.profitPercent ?? 0).toFixed(2)}%）`
    }

    stockInfo += `

この銘柄について質問されたら、以下のツールを使って詳細データを取得してください:
- getStockPrice: リアルタイム株価
- getStockFinancials: 財務指標
- getStockAnalysis: AI売買分析
- getRelatedNews: 関連ニュース（tickerCodes=["${stockContext.tickerCode.replace(".T", "")}"]${stockContext.sector ? `, sectors=["${stockContext.sector}"]` : ""}）`

    if (stockContext.type === "portfolio") {
      stockInfo += `\n- getPortfolioAnalysis: 保有銘柄分析（stockId="${stockContext.stockId}"）`
    } else {
      stockInfo += `\n- getPurchaseRecommendations: 購入推奨（stockIds=["${stockContext.stockId}"]）`
    }

    sections.push(stockInfo)
  }

  // 市場概況
  if (marketData) {
    let marketSection = `\n## 市場概況
- 日経平均: ${marketData.currentPrice.toLocaleString()}円
- 週間変化率: ${marketData.weekChangeRate >= 0 ? "+" : ""}${marketData.weekChangeRate.toFixed(1)}%
- トレンド: ${getTrendDescription(marketData.trend)}`

    if (marketData.isMarketCrash) {
      marketSection +=
        "\n⚠️ 市場全体が急落中です。新規購入は慎重に判断してください。"
    }

    sections.push(marketSection)
  }

  // ユーザーの投資スタイル
  if (userSettings) {
    const periodText =
      userSettings.investmentPeriod === "short"
        ? "短期（1年未満）"
        : userSettings.investmentPeriod === "medium"
          ? "中期（1-3年）"
          : "長期（3年以上）"
    const riskText =
      userSettings.riskTolerance === "low"
        ? "低（安定志向）"
        : userSettings.riskTolerance === "medium"
          ? "中（バランス）"
          : "高（積極的）"

    sections.push(`\n## ユーザーの投資スタイル
- 投資期間: ${periodText}
- リスク許容度: ${riskText}${userSettings.investmentBudget ? `\n- 投資予算: ${userSettings.investmentBudget.toLocaleString()}円` : ""}`)
  }

  // 回答ルール
  sections.push(`\n## 回答のルール
1. 専門用語は使わず、「上がりそう」「下がりそう」「今が買い時かも」など分かりやすい言葉で
2. 断定的な表現は避け、「〜と考えられます」「〜の可能性があります」を使う
3. ユーザーの投資スタイルに合わせたアドバイスをする
4. 親しみやすく丁寧な「ですます調」で話す
5. 回答は簡潔に（300字以内を目安）
6. 具体的な数字を引用して説得力を持たせる
7. 分析データが古い（7日以上前）場合は再分析を促す
8. ニュースを参照した場合は、回答の最後に以下の形式で参考情報を追加する:

---
📰 参考にした情報:
• ニュースタイトル
  URL

9. 上場廃止情報がある場合は必ず言及する
10. 必要なデータだけをツールで取得する（すべてのツールを呼ぶ必要はない）`)

  return sections.join("\n")
}
