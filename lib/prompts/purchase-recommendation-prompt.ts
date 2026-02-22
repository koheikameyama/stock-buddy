import {
  PROMPT_MARKET_SIGNAL_DEFINITION,
  PROMPT_NEWS_CONSTRAINTS,
} from "@/lib/stock-analysis-context";

export function buildPurchaseRecommendationPrompt(params: {
  stockName: string;
  tickerCode: string;
  sector: string | null;
  currentPrice: number;
  financialMetrics: string;
  userContext: string;
  predictionContext: string;
  pricesCount: number;
  delistingContext: string;
  weekChangeContext: string;
  marketContext: string;
  sectorTrendContext: string;
  patternContext: string;
  technicalContext: string;
  chartPatternContext: string;
  deviationRateContext: string;
  volumeAnalysisContext: string;
  relativeStrengthContext: string;
  newsContext: string;
  hasPrediction: boolean;
  prediction: {
    shortTermPriceLow: number;
    shortTermPriceHigh: number;
    midTermPriceLow: number;
    midTermPriceHigh: number;
    longTermPriceLow: number;
    longTermPriceHigh: number;
  } | null;
}): string {
  const {
    stockName,
    tickerCode,
    sector,
    currentPrice,
    financialMetrics,
    userContext,
    predictionContext,
    pricesCount,
    delistingContext,
    weekChangeContext,
    marketContext,
    sectorTrendContext,
    patternContext,
    technicalContext,
    chartPatternContext,
    deviationRateContext,
    volumeAnalysisContext,
    relativeStrengthContext,
    newsContext,
    hasPrediction,
    prediction,
  } = params;

  return `あなたは投資を学びたい人向けのAIコーチです。
以下の銘柄について、詳細な購入判断をしてください。
テクニカル分析の結果を活用し、専門用語は解説を添えて使ってください。
${hasPrediction ? "\n【重要】AI予測データが提供されています。この予測を購入判断の主要な根拠として活用してください。" : ""}

【銘柄情報】
- 名前: ${stockName}
- ティッカーコード: ${tickerCode}
- セクター: ${sector || "不明"}
- 現在価格: ${currentPrice}円

【財務指標（銘柄の質を評価）】
${financialMetrics}
${userContext}${predictionContext}
【株価データ】
直近30日の終値: ${pricesCount}件のデータあり
${delistingContext}${weekChangeContext}${marketContext}${sectorTrendContext}${patternContext}${technicalContext}${chartPatternContext}${deviationRateContext}${volumeAnalysisContext}${relativeStrengthContext}${newsContext}
【回答形式】
以下のJSON形式で回答してください。JSON以外のテキストは含めないでください。
${hasPrediction ? "※ 価格帯予測は【AI予測データ】の値をそのまま使用してください。" : ""}

{
  "marketSignal": "bullish" | "neutral" | "bearish",
  "statusType": "即時売却" | "戻り売り" | "ホールド" | "押し目買い" | "全力買い",

  // A. 価格帯予測${hasPrediction ? "（【AI予測データ】の値をそのまま使用）" : "（予測を根拠として購入判断の前に示す）"}
  "shortTermTrend": "up" | "neutral" | "down",
  "shortTermPriceLow": ${hasPrediction && prediction ? prediction.shortTermPriceLow : "短期（今週）の予測安値（数値のみ、円単位）"},
  "shortTermPriceHigh": ${hasPrediction && prediction ? prediction.shortTermPriceHigh : "短期（今週）の予測高値（数値のみ、円単位）"},
  "shortTermText": "短期予測の根拠・解説（初心者向け、60文字以内）",
  "midTermTrend": "up" | "neutral" | "down",
  "midTermPriceLow": ${hasPrediction && prediction ? prediction.midTermPriceLow : "中期（今月）の予測安値（数値のみ、円単位）"},
  "midTermPriceHigh": ${hasPrediction && prediction ? prediction.midTermPriceHigh : "中期（今月）の予測高値（数値のみ、円単位）"},
  "midTermText": "中期予測の根拠・解説（初心者向け、60文字以内）",
  "longTermTrend": "up" | "neutral" | "down",
  "longTermPriceLow": ${hasPrediction && prediction ? prediction.longTermPriceLow : "長期（今後3ヶ月）の予測安値（数値のみ、円単位）"},
  "longTermPriceHigh": ${hasPrediction && prediction ? prediction.longTermPriceHigh : "長期（今後3ヶ月）の予測高値（数値のみ、円単位）"},
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
}
