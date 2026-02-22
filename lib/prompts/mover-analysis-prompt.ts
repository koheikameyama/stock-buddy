export function buildMoverAnalysisMessages(params: {
  direction: string;
  stockName: string;
  tickerCode: string;
  sector: string | null;
  changeRate: number;
  latestPrice: number | null;
  latestVolume: number | null;
  weekChangeRate: number | null;
  volumeRatio: number | null;
  newsForPrompt: string;
}): { systemMessage: string; userMessage: string } {
  const {
    direction,
    stockName,
    tickerCode,
    sector,
    changeRate,
    latestPrice,
    latestVolume,
    weekChangeRate,
    volumeRatio,
    newsForPrompt,
  } = params;

  const systemMessage = `あなたは株式投資の専門家です。初心者向けに株価変動の原因を分析してください。
専門用語を使う場合は必ず簡単な解説を添えてください。
例:「出来高（取引された株の数）が急増しており...」

【重要: ハルシネーション防止】
- 提供されたニュース情報のみを参考にしてください
- ニュースにない情報（決算発表、業績予想、M&A、人事異動など）は推測・創作しないでください
- 関連ニュースがない場合は「具体的な材料は確認できませんが」と前置きしてください
- 過去の一般知識（例:「○○社は過去に○○した」）は使用しないでください`;

  const userMessage = `以下の銘柄が本日${direction}しました。原因を分析してください。

【銘柄情報】
- 銘柄: ${stockName}（${tickerCode}）
- セクター: ${sector || "不明"}
- 前日比: ${changeRate > 0 ? "+" : ""}${changeRate.toFixed(2)}%
- 現在株価: ${latestPrice != null ? Number(latestPrice).toLocaleString() : "不明"}円
- 出来高: ${latestVolume != null ? Number(latestVolume).toLocaleString() : "不明"}
- 週間変化率: ${weekChangeRate != null ? `${Number(weekChangeRate) > 0 ? "+" : ""}${Number(weekChangeRate).toFixed(2)}%` : "不明"}
- 出来高比率: ${volumeRatio != null ? `${Number(volumeRatio).toFixed(2)}倍` : "不明"}

【関連ニュース】
${newsForPrompt || "関連ニュースなし"}

【回答の制約】
- 上記のニュース情報のみを参考にしてください
- ニュースにない情報は創作しないでください`;

  return { systemMessage, userMessage };
}
