import { prisma } from "@/lib/prisma";
import { getOpenAIClient } from "@/lib/openai";
import { getRelatedNews, formatNewsForPrompt } from "@/lib/news-rag";
import {
  fetchHistoricalPrices,
  fetchStockPrices,
} from "@/lib/stock-price-fetcher";
import {
  buildFinancialMetrics,
  buildCandlestickContext,
  buildTechnicalContext,
  buildChartPatternContext,
  buildWeekChangeContext,
  buildMarketContext,
  buildDeviationRateContext,
  buildDelistingContext,
  buildVolumeAnalysisContext,
  buildRelativeStrengthContext,
  PROMPT_MARKET_SIGNAL_DEFINITION,
  PROMPT_NEWS_CONSTRAINTS,
} from "@/lib/stock-analysis-context";
import { MA_DEVIATION, SELL_TIMING, MOMENTUM } from "@/lib/constants";
import {
  calculateDeviationRate,
  calculateSMA,
  calculateRSI,
  calculateMACD,
} from "@/lib/technical-indicators";
import { getTodayForDB } from "@/lib/date-utils";
import { insertRecommendationOutcome, Prediction } from "@/lib/outcome-utils";
import { getNikkei225Data, MarketIndexData } from "@/lib/market-index";
import { calculatePortfolioFromTransactions } from "@/lib/portfolio-calculator";
import {
  isSurgeStock,
  isDangerousStock,
  isOverheated,
  isInDecline,
} from "@/lib/stock-safety-rules";
import { getSectorTrend, formatSectorTrendForPrompt } from "@/lib/sector-trend";
import { AnalysisError } from "@/lib/portfolio-analysis-core";
import {
  getCombinedSignal,
  analyzeSingleCandle,
} from "@/lib/candlestick-patterns";
import { detectChartPatterns } from "@/lib/chart-patterns";

export interface PurchaseRecommendationResult {
  stockId: string;
  stockName: string;
  tickerCode: string;
  currentPrice: number;
  marketSignal: string | null;
  shortTermTrend: string | null;
  shortTermPriceLow: number | null;
  shortTermPriceHigh: number | null;
  shortTermText: string | null;
  midTermTrend: string | null;
  midTermPriceLow: number | null;
  midTermPriceHigh: number | null;
  midTermText: string | null;
  longTermTrend: string | null;
  longTermPriceLow: number | null;
  longTermPriceHigh: number | null;
  longTermText: string | null;
  advice: string | null;
  recommendation: string;
  confidence: number;
  reason: string;
  caution: string;
  positives: string | null;
  concerns: string | null;
  suitableFor: string | null;
  buyCondition: string | null;
  buyTiming: string | null;
  dipTargetPrice: number | null;
  userFitScore: number | null;
  budgetFit: boolean | null;
  periodFit: boolean | null;
  riskFit: boolean | null;
  personalizedReason: string | null;
  analyzedAt: string;
}

/**
 * 購入判断のコアロジック
 * APIルート・fire-and-forget両方から呼ばれる単一ソースオブトゥルース
 */
export async function executePurchaseRecommendation(
  userId: string | null,
  stockId: string,
): Promise<PurchaseRecommendationResult> {
  // 銘柄情報を取得（財務指標も含む）
  const stock = await prisma.stock.findUnique({
    where: { id: stockId },
    select: {
      id: true,
      tickerCode: true,
      name: true,
      sector: true,
      marketCap: true,
      dividendYield: true,
      pbr: true,
      per: true,
      roe: true,
      isProfitable: true,
      profitTrend: true,
      revenueGrowth: true,
      eps: true,
      fiftyTwoWeekHigh: true,
      fiftyTwoWeekLow: true,
      volatility: true,
      isDelisted: true,
      fetchFailCount: true,
    },
  });

  if (!stock) {
    throw new AnalysisError("銘柄が見つかりません", "NOT_FOUND");
  }

  // ユーザー設定を取得
  const userSettings = userId
    ? await prisma.userSettings.findUnique({
        where: { userId },
        select: {
          investmentPeriod: true,
          riskTolerance: true,
          investmentBudget: true,
        },
      })
    : null;

  // 残り予算を計算
  let remainingBudget: number | null = null;
  if (userId && userSettings?.investmentBudget) {
    const userPortfolioStocks = await prisma.portfolioStock.findMany({
      where: { userId },
      select: {
        transactions: {
          select: {
            type: true,
            quantity: true,
            price: true,
            transactionDate: true,
          },
          orderBy: { transactionDate: "asc" },
        },
      },
    });
    let holdingsCost = 0;
    for (const ps of userPortfolioStocks) {
      const { quantity, averagePurchasePrice } =
        calculatePortfolioFromTransactions(ps.transactions);
      if (quantity > 0) {
        holdingsCost += quantity * averagePurchasePrice.toNumber();
      }
    }
    remainingBudget = Math.max(0, userSettings.investmentBudget - holdingsCost);
  }

  // staleチェック兼リアルタイム株価取得
  const { prices: realtimePrices, staleTickers: staleCheck } =
    await fetchStockPrices([stock.tickerCode]);
  if (staleCheck.includes(stock.tickerCode)) {
    throw new AnalysisError(
      "最新の株価が取得できないため分析がおこなえません",
      "STALE_DATA",
    );
  }

  // 直近30日の価格データを取得
  const historicalPrices = await fetchHistoricalPrices(stock.tickerCode, "1m");
  const prices = historicalPrices.slice(-30); // oldest-first

  if (prices.length === 0) {
    throw new AnalysisError("価格データがありません", "NO_PRICE_DATA");
  }

  // ローソク足パターン分析
  const patternContext = buildCandlestickContext(prices);

  // テクニカル指標の計算（RSI/MACD）
  const technicalContext = buildTechnicalContext(prices);

  // チャートパターン（複数足フォーメーション）の検出
  const chartPatternContext = buildChartPatternContext(prices);

  // 移動平均乖離率
  const deviationRateContext = buildDeviationRateContext(prices);

  // 出来高分析
  const volumeAnalysisContext = buildVolumeAnalysisContext(prices);

  // 関連ニュースを取得
  const tickerCode = stock.tickerCode.replace(".T", "");
  const news = await getRelatedNews({
    tickerCodes: [tickerCode],
    sectors: stock.sector ? [stock.sector] : [],
    limit: 5,
    daysAgo: 7,
  });
  const newsContext =
    news.length > 0
      ? `\n【最新のニュース情報】\n${formatNewsForPrompt(news)}`
      : "";

  // 既存の予測データを取得（StockAnalysisから）
  const analysis = await prisma.stockAnalysis.findFirst({
    where: { stockId },
    orderBy: { analyzedAt: "desc" },
  });

  const trendLabel = (trend: string) =>
    trend === "up" ? "上昇" : trend === "down" ? "下落" : "横ばい";

  const predictionContext = analysis
    ? `
【AI予測データ（購入判断の重要な根拠として活用）】
※ 以下は事前に生成された価格予測です。この予測を踏まえて購入判断を出してください。

■ 短期予測（今週）: ${trendLabel(analysis.shortTermTrend)}
  - 予測価格帯: ${Number(analysis.shortTermPriceLow).toLocaleString()}円 〜 ${Number(analysis.shortTermPriceHigh).toLocaleString()}円
  - 解説: ${analysis.shortTermText || "解説なし"}

■ 中期予測（今月）: ${trendLabel(analysis.midTermTrend)}
  - 予測価格帯: ${Number(analysis.midTermPriceLow).toLocaleString()}円 〜 ${Number(analysis.midTermPriceHigh).toLocaleString()}円
  - 解説: ${analysis.midTermText || "解説なし"}

■ 長期予測（3ヶ月）: ${trendLabel(analysis.longTermTrend)}
  - 予測価格帯: ${Number(analysis.longTermPriceLow).toLocaleString()}円 〜 ${Number(analysis.longTermPriceHigh).toLocaleString()}円
  - 解説: ${analysis.longTermText || "解説なし"}

■ 総合判断: ${analysis.recommendation === "buy" ? "買い推奨" : analysis.recommendation === "sell" ? "売り推奨" : "ホールド"}
■ アドバイス: ${analysis.advice || "なし"}
■ 信頼度: ${(analysis.confidence * 100).toFixed(0)}%
`
    : "";

  // 市場全体の状況を取得
  let marketData: MarketIndexData | null = null;
  try {
    marketData = await getNikkei225Data();
  } catch (error) {
    console.error("市場データ取得失敗（フォールバック）:", error);
  }

  const currentPrice =
    realtimePrices[0]?.currentPrice ??
    (prices[0] ? Number(prices[0].close) : 0);

  // 週間変化率を計算
  const { text: weekChangeContext, rate: weekChangeRate } =
    buildWeekChangeContext(prices, "watchlist");

  // 市場全体の状況コンテキスト
  const marketContext = buildMarketContext(marketData);

  // セクタートレンド
  let sectorTrendContext = "";
  let sectorAvgWeekChangeRate: number | null = null;
  if (stock.sector) {
    const sectorTrend = await getSectorTrend(stock.sector);
    if (sectorTrend) {
      sectorTrendContext = `\n【セクタートレンド】\n${formatSectorTrendForPrompt(sectorTrend)}\n`;
      sectorAvgWeekChangeRate = sectorTrend.avgWeekChangeRate ?? null;
    }
  }

  // 相対強度分析
  const relativeStrengthContext = buildRelativeStrengthContext(
    weekChangeRate,
    marketData?.weekChangeRate ?? null,
    sectorAvgWeekChangeRate,
  );

  // 財務指標のフォーマット
  const financialMetrics = buildFinancialMetrics(stock, currentPrice);

  // 上場廃止コンテキスト
  const delistingContext = buildDelistingContext(
    stock.isDelisted,
    stock.fetchFailCount,
  );

  // ユーザー設定のコンテキスト
  const periodMap: Record<string, string> = {
    short: "短期（数週間〜数ヶ月）",
    medium: "中期（半年〜1年）",
    long: "長期（数年以上）",
  };
  const riskMap: Record<string, string> = {
    low: "低リスク（安定重視）",
    medium: "中リスク（バランス）",
    high: "高リスク（積極的）",
  };

  const userContext = userSettings
    ? `
【ユーザーの投資設定】
- 投資期間: ${periodMap[userSettings.investmentPeriod] || userSettings.investmentPeriod}
- リスク許容度: ${riskMap[userSettings.riskTolerance] || userSettings.riskTolerance}
- 投資予算（合計）: ${userSettings.investmentBudget ? `${userSettings.investmentBudget.toLocaleString()}円` : "未設定"}
- 投資予算（残り）: ${remainingBudget !== null ? `${remainingBudget.toLocaleString()}円` : userSettings.investmentBudget ? "未計算" : "未設定"}
`
    : "";

  const hasPrediction = analysis !== null;

  const prompt = `あなたは投資を学びたい人向けのAIコーチです。
以下の銘柄について、詳細な購入判断をしてください。
テクニカル分析の結果を活用し、専門用語は解説を添えて使ってください。
${hasPrediction ? "\n【重要】AI予測データが提供されています。この予測を購入判断の主要な根拠として活用してください。" : ""}

【銘柄情報】
- 名前: ${stock.name}
- ティッカーコード: ${stock.tickerCode}
- セクター: ${stock.sector || "不明"}
- 現在価格: ${currentPrice}円

【財務指標（銘柄の質を評価）】
${financialMetrics}
${userContext}${predictionContext}
【株価データ】
直近30日の終値: ${prices.length}件のデータあり
${delistingContext}${weekChangeContext}${marketContext}${sectorTrendContext}${patternContext}${technicalContext}${chartPatternContext}${deviationRateContext}${volumeAnalysisContext}${relativeStrengthContext}${newsContext}
【回答形式】
以下のJSON形式で回答してください。JSON以外のテキストは含めないでください。
${hasPrediction ? "※ 価格帯予測は【AI予測データ】の値をそのまま使用してください。" : ""}

{
  "marketSignal": "bullish" | "neutral" | "bearish",

  // A. 価格帯予測${hasPrediction ? "（【AI予測データ】の値をそのまま使用）" : "（予測を根拠として購入判断の前に示す）"}
  "shortTermTrend": "up" | "neutral" | "down",
  "shortTermPriceLow": ${hasPrediction ? Number(analysis.shortTermPriceLow) : "短期（今週）の予測安値（数値のみ、円単位）"},
  "shortTermPriceHigh": ${hasPrediction ? Number(analysis.shortTermPriceHigh) : "短期（今週）の予測高値（数値のみ、円単位）"},
  "shortTermText": "短期予測の根拠・解説（初心者向け、60文字以内）",
  "midTermTrend": "up" | "neutral" | "down",
  "midTermPriceLow": ${hasPrediction ? Number(analysis.midTermPriceLow) : "中期（今月）の予測安値（数値のみ、円単位）"},
  "midTermPriceHigh": ${hasPrediction ? Number(analysis.midTermPriceHigh) : "中期（今月）の予測高値（数値のみ、円単位）"},
  "midTermText": "中期予測の根拠・解説（初心者向け、60文字以内）",
  "longTermTrend": "up" | "neutral" | "down",
  "longTermPriceLow": ${hasPrediction ? Number(analysis.longTermPriceLow) : "長期（今後3ヶ月）の予測安値（数値のみ、円単位）"},
  "longTermPriceHigh": ${hasPrediction ? Number(analysis.longTermPriceHigh) : "長期（今後3ヶ月）の予測高値（数値のみ、円単位）"},
  "longTermText": "長期予測の根拠・解説（初心者向け、60文字以内）",
  "advice": "${hasPrediction ? "【AI予測データ】を踏まえた購入判断のアドバイス" : "上記予測を踏まえた総合アドバイス"}（100文字以内）",

  // B. 購入判断（${hasPrediction ? "【AI予測データ】を根拠として導出" : "価格帯予測を根拠として導出"}する）
  "recommendation": "buy" | "stay" | "avoid",
  "confidence": 0.0から1.0の数値（小数点2桁）,
  "reason": "初心者に分かりやすい言葉で1-2文の理由（${hasPrediction ? "AI予測の根拠を含める" : "価格予測の根拠を含める"}）",
  "caution": "注意点を1-2文",

  // C. 深掘り評価（文字列で返す。配列ではない）
  "positives": "・良い点1\n・良い点2\n・良い点3",
  "concerns": "・不安な点1\n・不安な点2\n・不安な点3",
  "suitableFor": "こんな人におすすめ（1-2文で具体的に）",

  // D. 買い時条件（recommendationがstayの場合のみ）
  "buyCondition": "どうなったら買い時か（例：「株価が○○円を下回ったら」「RSIが30を下回ったら」など具体的に）",

  // E. パーソナライズ（ユーザー設定がある場合）
  "userFitScore": 0-100のおすすめ度,
  "budgetFit": 予算内で購入可能か（true/false）,
  "periodFit": 投資期間にマッチするか（true/false）,
  "riskFit": リスク許容度に合うか（true/false）,
  "personalizedReason": "このユーザーにとってのおすすめ理由（2-3文）"
}

${PROMPT_MARKET_SIGNAL_DEFINITION}

【価格帯予測の指針】
${
  hasPrediction
    ? `
- 【重要】AI予測データが提供されている場合は、その値をそのまま使用してください
- 価格帯（priceLow/priceHigh）は提供された値を変更しないでください
- トレンド（shortTermTrend等）も提供された値に従ってください
- 購入判断（recommendation）は、この予測を根拠として導出してください
- 予測が「上昇」なら買い検討、「下落」なら様子見、という整合性を保ってください`
    : `
- 予測は提供されたテクニカル指標・チャートパターン・ファンダメンタルを根拠として算出する
- 現在価格を起点に、直近ボラティリティ・トレンドを反映した現実的な価格帯にすること
- shortTermPriceLow/High: 直近のボラティリティと今週のトレンドを基準（現在価格±5〜15%を目安）
- midTermPriceLow/High: 中期トレンド・ファンダメンタルを基準（現在価格±10〜25%を目安）
- longTermPriceLow/High: 事業展望・長期トレンドを基準（現在価格±15〜35%を目安）`
}
- 予測レンジが recommendation と整合すること（例: buyならshortTermが上昇傾向）
- advice は価格帯予測の数値を踏まえた具体的なコメントにする（例:「今週は○○〜○○円で推移する見込みで...」）
- 【重要】最近のトレンドや決算情報の好調を過信しすぎず、反落や天井圏の可能性を常に考慮してください。期待がすでに価格に織り込み済み（材料出尽くし）であるリスクがないか慎重に評価してください。
- 【重要】提供された【AI予測データ】が「上昇」となっていても、直近の【株価データ】やテクニカル指標で強い下落・売りシグナルが出ている場合は、安全性を優先し、無理に「買い」を推奨せず "stay" を選んでください。

【重要: この銘柄はまだ購入していません】
- この分析はウォッチリスト（購入検討中）の銘柄に対するものです
- ユーザーはまだこの株を保有していません
- 「損切り」「損切りライン」「利確」「利益確定」「売り時」「売却」「保有株」「含み損」「含み益」など、株を保有している前提の表現は絶対に使わないでください
- 代わりに「購入を検討」「エントリー」「買いのタイミング」「見送り」など、購入前の視点で表現してください

【制約】
${PROMPT_NEWS_CONSTRAINTS}
- 「買い時」「今すぐ買うべき」などの断定的な表現は避け、「検討できる」「検討のタイミング」などの表現を使う
- 赤字企業の場合は concerns で必ず「業績が赤字である」ことに言及し、リスクを伝える
- 赤字かつ減益傾向の場合は、特に慎重な表現を使う
- 専門用語（RSI、MACD、チャートパターン名など）は使ってOKだが、必ず簡単な解説を添える
  例: 「RSI（売られすぎ・買われすぎを判断する指標）が30を下回り…」
  例: 「ダブルボトム（2回底を打って反転する形）が形成され…」
- チャートパターンが検出された場合は、reasonで言及する
- positives、concernsは「・項目1\n・項目2」形式の文字列で返す（配列ではない）
- ユーザー設定がない場合、パーソナライズ項目はnullにする
- buyConditionはrecommendationが"stay"の場合のみ具体的な条件を記載し、"buy"や"avoid"の場合はnullにする

【財務指標の活用】
- 財務指標は銘柄の質を評価する参考情報として活用してください
- 財務に懸念点がある場合（割高、ROE低めなど）は、cautionやconcernsで言及してください
- テクニカルが良ければ買い推奨は出せますが、財務リスクは必ず伝えてください

【テクニカル指標の重視】
- RSI・MACD・ローソク足パターンなどのテクニカル指標が提供されている場合は、必ず判断根拠として活用する
- 複数の指標が同じ方向を示している場合（例: RSI売られすぎ + MACD上昇転換）は信頼度を高める
- 指標間で矛盾がある場合（例: RSI買われすぎ だが MACD上昇中）は慎重な判断とし、その旨をcautionで言及する

【相対強度・出来高を考慮した性質判断 - 最重要】
■ 相対強度（銘柄 vs 市場/セクター）で動きを分析してください:
- 銘柄が市場をアンダーパフォーム（例: 市場-1%、銘柄-5%）している場合、銘柄固有の弱さが強く、安値での「拾い買い」は極めて慎重に判断してください（"stay"推奨）。

■ 出来高分析で売り圧力の質を判定してください:
- 分配売り（下落日出来高 > 上昇日出来高の1.5倍以上）: 本物の売り圧力があり、下落は継続しやすく「落ちるナイフ」の状態です。絶対に "buy" を出さないでください。
- 出来高を伴わない調整（下落日出来高 < 上昇日出来高の0.7倍以下）: 売り圧力が弱く、押し目買いの検討が可能です。

【モメンタム（トレンドフォロー）判断 - 重要】
■ 下落トレンドへの対応:
- 直近で強い下落（大陰線、連続下落）がある銘柄は、どれだけファンダメンタルが良くても "buy" ではなく "stay" を推奨する
- 特に短期投資の場合、下落中の銘柄へのエントリーは「落ちるナイフ」を掴むリスクがあるため厳禁
- 週間変化率が-7%以下の銘柄は、短期的には下げ止まりを確認するまで "stay" 推奨
- 下落銘柄にはcautionで「下落トレンド中のリスク」について必ず言及する

■ 上昇トレンドへの対応:
- 直近で強い上昇の兆候がある銘柄はモメンタムが強く、買いの好機である
- ただし週間+30%以上の急騰は天井掴みのリスクがあるため "stay" とし、反落を待つアドバイスをすること
- 逆三尊やダブルボトムなどのチャートパターンが検出されても、出来高が伴っていない場合や市場全体の地合いが悪い場合は「騙し（一時的な反発）」のリスクを必ず指摘してください。

【"avoid"（見送り推奨）について】
- "avoid"は購入を見送り、今後の保有候補からも外すことを検討するほど「かなり強いマイナス条件」が揃った場合の判断です。
- 通常の下落トレンドや一時的な悪材料であれば、"avoid"ではなく"stay"（様子見）としてください。
- 以下の条件が複合的に揃い、当面は回復の見込みが極めて低い場合のみ使用してください:
  * 赤字が継続し、業績改善の兆しが全くない
  * 長期的な下落トレンドが継続し、テクニカル指標がすべて強いネガティブ（強い下落シグナル）を示している
  * 致命的な悪材料（上場廃止リスク、不祥事など）が出ている
- "avoid"を選ぶ場合は、confidence を 0.8 以上に設定してください
- 少しでも迷う場合や「今は買い時ではないだけ」の場合は、必ず "stay" を選んでください
`;

  // OpenAI API呼び出し（Structured Outputs使用）
  const openai = getOpenAIClient();
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "You are a helpful investment coach for beginners.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.4,
    max_tokens: 1200,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "purchase_recommendation",
        strict: true,
        schema: {
          type: "object",
          properties: {
            marketSignal: {
              type: "string",
              enum: ["bullish", "neutral", "bearish"],
            },
            shortTermTrend: { type: "string", enum: ["up", "neutral", "down"] },
            shortTermPriceLow: { type: "number" },
            shortTermPriceHigh: { type: "number" },
            shortTermText: { type: "string" },
            midTermTrend: { type: "string", enum: ["up", "neutral", "down"] },
            midTermPriceLow: { type: "number" },
            midTermPriceHigh: { type: "number" },
            midTermText: { type: "string" },
            longTermTrend: { type: "string", enum: ["up", "neutral", "down"] },
            longTermPriceLow: { type: "number" },
            longTermPriceHigh: { type: "number" },
            longTermText: { type: "string" },
            advice: { type: "string" },
            recommendation: { type: "string", enum: ["buy", "stay", "avoid"] },
            confidence: { type: "number" },
            reason: { type: "string" },
            caution: { type: "string" },
            positives: { type: ["string", "null"] },
            concerns: { type: ["string", "null"] },
            suitableFor: { type: ["string", "null"] },
            buyCondition: { type: ["string", "null"] },
            userFitScore: { type: ["number", "null"] },
            budgetFit: { type: ["boolean", "null"] },
            periodFit: { type: ["boolean", "null"] },
            riskFit: { type: ["boolean", "null"] },
            personalizedReason: { type: ["string", "null"] },
          },
          required: [
            "marketSignal",
            "shortTermTrend",
            "shortTermPriceLow",
            "shortTermPriceHigh",
            "shortTermText",
            "midTermTrend",
            "midTermPriceLow",
            "midTermPriceHigh",
            "midTermText",
            "longTermTrend",
            "longTermPriceLow",
            "longTermPriceHigh",
            "longTermText",
            "advice",
            "recommendation",
            "confidence",
            "reason",
            "caution",
            "positives",
            "concerns",
            "suitableFor",
            "buyCondition",
            "userFitScore",
            "budgetFit",
            "periodFit",
            "riskFit",
            "personalizedReason",
          ],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices[0].message.content?.trim() || "{}";
  const result = JSON.parse(content);

  // --- 強制補正ロジック（Hard Overrides） ---

  // 1. テクニカル総合判定による強制ブレーキ (Consistency Fix)
  // ポートフォリオ側と同じロジックで強い売りシグナルが出ている場合は、AIの回答に関わらず stay にする
  const pricesNewestFirst = [...prices].reverse().map((p) => ({
    date: p.date,
    open: p.open,
    high: p.high,
    low: p.low,
    close: p.close,
  }));

  const rsiValue = calculateRSI(pricesNewestFirst, 14);
  const macd = calculateMACD(pricesNewestFirst);
  const candlestickPatterns = prices.slice(-1).map((p) => ({
    date: p.date,
    open: p.open,
    high: p.high,
    low: p.low,
    close: p.close,
  }));
  const latestCandle = candlestickPatterns[0];

  const chartPatterns = detectChartPatterns(
    prices.map((p) => ({
      date: p.date,
      open: p.open,
      high: p.high,
      low: p.low,
      close: p.close,
    })),
  );

  const combinedTechnical = getCombinedSignal(
    latestCandle ? analyzeSingleCandle(latestCandle) : null,
    rsiValue,
    macd.histogram,
    chartPatterns,
  );

  // テクニカル判定が sell で強さが 70% 以上の場合は、buy を禁止する
  if (combinedTechnical.signal === "sell" && combinedTechnical.strength >= 70) {
    if (result.recommendation === "buy") {
      result.recommendation = "stay";
      result.confidence = Math.max(0.5, combinedTechnical.strength / 100);
      result.reason = `テクニカル指標で強い下落シグナル（${combinedTechnical.reasons.join("、")}）が出ているため、購入は下げ止まりを確認してからを推奨します。 ${result.reason}`;
      result.caution = `最新のローソク足パターン等が強い下落（強さ${combinedTechnical.strength}%）を示しています。ポートフォリオ分析との一貫性を保つため、様子見を推奨します。${result.caution}`;
      result.buyCondition =
        "テクニカルシグナルが好転し、下げ止まりを確認できたら検討してください";
    }
  }

  // "avoid" は confidence >= 0.8 の場合のみ許可
  if (result.recommendation === "avoid" && result.confidence < 0.8) {
    result.recommendation = "stay";
  }

  const investmentPeriod = userSettings?.investmentPeriod ?? null;

  // 今日のおすすめ銘柄かどうかを確認
  const isRecommendedToday = await prisma.userDailyRecommendation.findFirst({
    where: {
      userId: userId || undefined,
      stockId: stockId,
      date: getTodayForDB(),
    },
  });

  // おすすめ銘柄の場合は、モメンタムやボラティリティの強制ストップ（stay化）をスキップする
  // （AIがおすすめと判断したのに「気になる」に入れたら即「見送り」になるのを防ぐため）
  const skipSafetyRules = !!isRecommendedToday;

  // 下落トレンドの強制補正（投資期間別）
  if (
    !skipSafetyRules &&
    isInDecline(weekChangeRate, investmentPeriod) &&
    result.recommendation === "buy"
  ) {
    result.recommendation = "stay";
    result.confidence = Math.max(
      0,
      result.confidence + MOMENTUM.DECLINE_CONFIDENCE_PENALTY,
    );
    result.caution = `週間${weekChangeRate!.toFixed(0)}%の下落トレンドのため、様子見を推奨します。${result.caution}`;
    result.buyCondition =
      result.buyCondition || "下落トレンドが落ち着いてから検討してください";
  }

  // 急騰銘柄の強制補正（投資期間別：短期は制限なし）
  if (
    !skipSafetyRules &&
    isSurgeStock(weekChangeRate, investmentPeriod) &&
    result.recommendation === "buy"
  ) {
    result.recommendation = "stay";
    result.caution = `週間+${weekChangeRate!.toFixed(0)}%の急騰銘柄のため、様子見を推奨します。${result.caution}`;
  }

  // 危険銘柄の強制補正
  const volatility = stock.volatility ? Number(stock.volatility) : null;
  if (
    !skipSafetyRules &&
    isDangerousStock(stock.isProfitable, volatility) &&
    result.recommendation === "buy"
  ) {
    result.recommendation = "stay";
    result.caution = `業績が赤字かつボラティリティが${volatility?.toFixed(0)}%と高いため、様子見を推奨します。${result.caution}`;
  }

  // 市場急落時の強制補正
  if (marketData?.isMarketCrash && result.recommendation === "buy") {
    result.recommendation = "stay";
    result.reason = `市場全体が急落しているため、様子見をおすすめします。${result.reason}`;
    result.buyCondition =
      result.buyCondition || "市場が落ち着いてから検討してください";
  }

  // 移動平均乖離率による補正（短期投資は過熱圏ルールをスキップ）
  const deviationRate = calculateDeviationRate(
    pricesNewestFirst,
    MA_DEVIATION.PERIOD,
  );

  if (
    !skipSafetyRules &&
    isOverheated(deviationRate, investmentPeriod) &&
    result.recommendation === "buy"
  ) {
    result.recommendation = "stay";
    result.confidence = Math.max(
      0,
      result.confidence + MA_DEVIATION.CONFIDENCE_PENALTY,
    );
    result.caution = `25日移動平均線から+${deviationRate!.toFixed(1)}%乖離しており過熱圏のため、様子見を推奨します。${result.caution}`;
  }

  // 下方乖離ボーナス
  const isLowVolatility =
    volatility !== null && volatility <= MA_DEVIATION.LOW_VOLATILITY_THRESHOLD;
  if (
    deviationRate !== null &&
    deviationRate <= MA_DEVIATION.LOWER_THRESHOLD &&
    stock.isProfitable === true &&
    isLowVolatility
  ) {
    result.confidence = Math.min(
      1.0,
      result.confidence + MA_DEVIATION.CONFIDENCE_BONUS,
    );
  }

  // パニック売り防止（avoid→stay）
  if (
    deviationRate !== null &&
    deviationRate <= SELL_TIMING.PANIC_SELL_THRESHOLD &&
    result.recommendation === "avoid"
  ) {
    result.recommendation = "stay";
    result.caution = `25日移動平均線から${deviationRate.toFixed(1)}%下方乖離しており売られすぎです。大底で見送るのはもったいないため、様子見を推奨します。${result.caution}`;
  }

  // 購入タイミング判断
  let buyTiming: string | null = null;
  let dipTargetPrice: number | null = null;

  if (result.recommendation === "buy") {
    const rsi = calculateRSI(pricesNewestFirst, 14);
    const sma25 = calculateSMA(pricesNewestFirst, MA_DEVIATION.PERIOD);

    const isHighDeviation =
      deviationRate !== null && deviationRate > MA_DEVIATION.DIP_BUY_THRESHOLD;
    const isOverboughtRSI =
      rsi !== null && rsi > MA_DEVIATION.RSI_OVERBOUGHT_THRESHOLD;

    if (isHighDeviation || isOverboughtRSI) {
      buyTiming = "dip";
      dipTargetPrice = sma25;
    } else {
      buyTiming = "market";
    }
  }

  // 売りタイミング判定（avoid推奨時のみ）
  let sellTiming: string | null = null;
  let sellTargetPrice: number | null = null;

  if (result.recommendation === "avoid") {
    const rsi = calculateRSI(pricesNewestFirst, 14);
    const sma25 = calculateSMA(pricesNewestFirst, MA_DEVIATION.PERIOD);

    const isDeviationOk =
      deviationRate === null ||
      deviationRate >= SELL_TIMING.DEVIATION_LOWER_THRESHOLD;
    const isRsiOk = rsi === null || rsi >= SELL_TIMING.RSI_OVERSOLD_THRESHOLD;

    if (isDeviationOk && isRsiOk) {
      sellTiming = "market";
    } else {
      sellTiming = "rebound";
      sellTargetPrice = sma25;
    }
  }

  // データベースに保存
  const today = getTodayForDB();

  const savedRecommendation = await prisma.purchaseRecommendation.upsert({
    where: {
      stockId_date: {
        stockId,
        date: today,
      },
    },
    update: {
      marketSignal: result.marketSignal || null,
      recommendation: result.recommendation,
      confidence: result.confidence,
      reason: result.reason,
      caution: result.caution,
      positives: result.positives || null,
      concerns: result.concerns || null,
      suitableFor: result.suitableFor || null,
      buyCondition:
        result.recommendation === "stay" ? result.buyCondition || null : null,
      buyTiming: buyTiming,
      dipTargetPrice: dipTargetPrice,
      sellTiming: sellTiming,
      sellTargetPrice: sellTargetPrice,
      userFitScore: result.userFitScore ?? null,
      budgetFit: result.budgetFit ?? null,
      periodFit: result.periodFit ?? null,
      riskFit: result.riskFit ?? null,
      personalizedReason: result.personalizedReason || null,
      updatedAt: new Date(),
    },
    create: {
      stockId,
      date: today,
      marketSignal: result.marketSignal || null,
      recommendation: result.recommendation,
      confidence: result.confidence,
      reason: result.reason,
      caution: result.caution,
      positives: result.positives || null,
      concerns: result.concerns || null,
      suitableFor: result.suitableFor || null,
      buyCondition:
        result.recommendation === "stay" ? result.buyCondition || null : null,
      buyTiming: buyTiming,
      dipTargetPrice: dipTargetPrice,
      sellTiming: sellTiming,
      sellTargetPrice: sellTargetPrice,
      userFitScore: result.userFitScore ?? null,
      budgetFit: result.budgetFit ?? null,
      periodFit: result.periodFit ?? null,
      riskFit: result.riskFit ?? null,
      personalizedReason: result.personalizedReason || null,
    },
  });

  // StockAnalysisに価格帯予測を保存
  const now = new Date();
  await prisma.stockAnalysis.create({
    data: {
      stockId,
      shortTermTrend: result.shortTermTrend || "neutral",
      shortTermPriceLow: result.shortTermPriceLow || currentPrice || 0,
      shortTermPriceHigh: result.shortTermPriceHigh || currentPrice || 0,
      shortTermText: result.shortTermText || "",
      midTermTrend: result.midTermTrend || "neutral",
      midTermPriceLow: result.midTermPriceLow || currentPrice || 0,
      midTermPriceHigh: result.midTermPriceHigh || currentPrice || 0,
      midTermText: result.midTermText || "",
      longTermTrend: result.longTermTrend || "neutral",
      longTermPriceLow: result.longTermPriceLow || currentPrice || 0,
      longTermPriceHigh: result.longTermPriceHigh || currentPrice || 0,
      longTermText: result.longTermText || "",
      recommendation:
        result.recommendation === "buy"
          ? "buy"
          : result.recommendation === "avoid"
            ? "sell"
            : "hold",
      advice: result.advice || result.reason || "",
      confidence: result.confidence || 0.7,
      limitPrice: null,
      stopLossPrice: null,
      analyzedAt: now,
    },
  });

  // Outcome追跡
  const predictionMap: Record<string, Prediction> = {
    buy: "buy",
    stay: "stay",
    avoid: "remove",
  };

  await insertRecommendationOutcome({
    type: "purchase",
    recommendationId: savedRecommendation.id,
    stockId,
    tickerCode: stock.tickerCode,
    sector: stock.sector,
    recommendedAt: new Date(),
    priceAtRec: currentPrice,
    prediction: predictionMap[result.recommendation] || "stay",
    confidence: result.confidence,
    volatility: volatility,
    marketCap: stock.marketCap
      ? BigInt(Number(stock.marketCap) * 100_000_000)
      : null,
  });

  return {
    stockId: stock.id,
    stockName: stock.name,
    tickerCode: stock.tickerCode,
    currentPrice: currentPrice,
    marketSignal: result.marketSignal || null,
    shortTermTrend: result.shortTermTrend || null,
    shortTermPriceLow: result.shortTermPriceLow || null,
    shortTermPriceHigh: result.shortTermPriceHigh || null,
    shortTermText: result.shortTermText || null,
    midTermTrend: result.midTermTrend || null,
    midTermPriceLow: result.midTermPriceLow || null,
    midTermPriceHigh: result.midTermPriceHigh || null,
    midTermText: result.midTermText || null,
    longTermTrend: result.longTermTrend || null,
    longTermPriceLow: result.longTermPriceLow || null,
    longTermPriceHigh: result.longTermPriceHigh || null,
    longTermText: result.longTermText || null,
    advice: result.advice || null,
    recommendation: result.recommendation,
    confidence: result.confidence,
    reason: result.reason,
    caution: result.caution,
    positives: result.positives || null,
    concerns: result.concerns || null,
    suitableFor: result.suitableFor || null,
    buyCondition:
      result.recommendation === "stay" ? result.buyCondition || null : null,
    buyTiming: buyTiming,
    dipTargetPrice: dipTargetPrice,
    userFitScore: result.userFitScore ?? null,
    budgetFit: result.budgetFit ?? null,
    periodFit: result.periodFit ?? null,
    riskFit: result.riskFit ?? null,
    personalizedReason: result.personalizedReason || null,
    analyzedAt: today.toISOString(),
  };
}
