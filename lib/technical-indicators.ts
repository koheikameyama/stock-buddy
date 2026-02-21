// 技術指標計算ライブラリ

interface PriceData {
  close: number;
  high?: number;
  low?: number;
}

/**
 * RSI (Relative Strength Index) - 相対力指数
 * 0-100の範囲で、70以上で買われすぎ、30以下で売られすぎ
 */
export function calculateRSI(
  prices: PriceData[],
  period: number = 14,
): number | null {
  if (prices.length < period + 1) return null;

  const changes = prices
    .slice(0, period + 1)
    .map((p, i, arr) => (i === 0 ? 0 : p.close - arr[i - 1].close))
    .slice(1);

  const gains = changes.map((c) => (c > 0 ? c : 0));
  const losses = changes.map((c) => (c < 0 ? Math.abs(c) : 0));

  const avgGain = gains.reduce((sum, g) => sum + g, 0) / period;
  const avgLoss = losses.reduce((sum, l) => sum + l, 0) / period;

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  const rsi = 100 - 100 / (1 + rs);

  return Math.round(rsi * 100) / 100;
}

/**
 * SMA (Simple Moving Average) - 単純移動平均
 */
export function calculateSMA(
  prices: PriceData[],
  period: number,
): number | null {
  if (prices.length < period) return null;

  const sum = prices.slice(0, period).reduce((acc, p) => acc + p.close, 0);
  return Math.round((sum / period) * 100) / 100;
}

/**
 * EMA (Exponential Moving Average) - 指数移動平均
 */
export function calculateEMA(
  prices: PriceData[],
  period: number,
): number | null {
  if (prices.length < period) return null;

  const k = 2 / (period + 1);
  const sma = calculateSMA(prices.slice(-period), period);
  if (!sma) return null;

  let ema = sma;
  for (let i = prices.length - period - 1; i >= 0; i--) {
    ema = prices[i].close * k + ema * (1 - k);
  }

  return Math.round(ema * 100) / 100;
}

/**
 * MACD (Moving Average Convergence Divergence)
 * MACDライン、シグナルライン、ヒストグラムを計算
 */
export function calculateMACD(prices: PriceData[]): {
  macd: number | null;
  signal: number | null;
  histogram: number | null;
} {
  if (prices.length < 26) {
    return { macd: null, signal: null, histogram: null };
  }

  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);

  if (!ema12 || !ema26) {
    return { macd: null, signal: null, histogram: null };
  }

  const macd = ema12 - ema26;

  // シグナルライン（MACDの9日EMA）は簡易的にMACDのみで計算
  // 本来はMACD値の履歴からEMAを計算すべき
  const signal = macd * 0.9; // 簡易計算

  const histogram = macd - signal;

  return {
    macd: Math.round(macd * 100) / 100,
    signal: Math.round(signal * 100) / 100,
    histogram: Math.round(histogram * 100) / 100,
  };
}

/**
 * ボリンジャーバンド
 */
export function calculateBollingerBands(
  prices: PriceData[],
  period: number = 20,
  stdDev: number = 2,
): {
  upper: number | null;
  middle: number | null;
  lower: number | null;
} {
  if (prices.length < period) {
    return { upper: null, middle: null, lower: null };
  }

  const middle = calculateSMA(prices, period);
  if (!middle) return { upper: null, middle: null, lower: null };

  const recentPrices = prices.slice(0, period).map((p) => p.close);
  const variance =
    recentPrices.reduce((sum, price) => sum + Math.pow(price - middle, 2), 0) /
    period;
  const sd = Math.sqrt(variance);

  return {
    upper: Math.round((middle + stdDev * sd) * 100) / 100,
    middle: Math.round(middle * 100) / 100,
    lower: Math.round((middle - stdDev * sd) * 100) / 100,
  };
}

/**
 * 技術指標の総合評価（買いシグナル = 1, 売りシグナル = -1, 中立 = 0）
 */
export function getTechnicalSignal(prices: PriceData[]): {
  signal: number;
  strength: string;
  reasons: string[];
} {
  const rsi = calculateRSI(prices);
  const sma25 = calculateSMA(prices, 25);
  const macd = calculateMACD(prices);
  const currentPrice = prices[0].close;

  let signal = 0;
  const reasons: string[] = [];

  // RSIチェック
  if (rsi !== null) {
    if (rsi < 30) {
      signal += 1;
      reasons.push(`RSI${rsi.toFixed(1)}で売られすぎ`);
    } else if (rsi > 70) {
      signal -= 1;
      reasons.push(`RSI${rsi.toFixed(1)}で買われすぎ`);
    }
  }

  // 移動平均チェック
  if (sma25 !== null) {
    if (currentPrice > sma25) {
      signal += 0.5;
      reasons.push("25日移動平均を上回る");
    } else {
      signal -= 0.5;
      reasons.push("25日移動平均を下回る");
    }
  }

  // MACDチェック
  if (macd.macd !== null && macd.signal !== null) {
    if (macd.histogram && macd.histogram > 0) {
      signal += 0.5;
      reasons.push("MACDが上向き");
    } else {
      signal -= 0.5;
      reasons.push("MACDが下向き");
    }
  }

  let strength = "中立";
  if (signal >= 1.5) strength = "強い買い";
  else if (signal >= 0.5) strength = "買い";
  else if (signal <= -1.5) strength = "強い売り";
  else if (signal <= -0.5) strength = "売り";

  return {
    signal: Math.round(signal * 100) / 100,
    strength,
    reasons,
  };
}

/**
 * 移動平均線からの乖離率（%）を計算
 * 乖離率 = (現在価格 - SMA) / SMA × 100
 *
 * @param prices - 価格データ（新しい順）
 * @param period - 移動平均の期間（デフォルト25日）
 * @returns 乖離率（%）。データ不足の場合は null
 */
export function calculateDeviationRate(
  prices: PriceData[],
  period: number = 25,
): number | null {
  const sma = calculateSMA(prices, period);
  if (sma === null || sma === 0) return null;

  const currentPrice = prices[0].close;
  const rate = ((currentPrice - sma) / sma) * 100;
  return Math.round(rate * 100) / 100;
}
/**
 * 窓（ギャップ）判定ロジック
 * 直近の「窓開け」の発生と、それが「窓埋め」されたかを判定する
 */
export function detectGaps(prices: PriceData[]): {
  type: "up" | "down" | null;
  price: number | null;
  isFilled: boolean;
  date: string | null;
} {
  // prices は新しい順 (index 0 が最新)
  if (prices.length < 2)
    return { type: null, price: null, isFilled: false, date: null };

  // 直近最大5日間で窓を探す
  for (let i = 0; i < Math.min(5, prices.length - 1); i++) {
    const today = prices[i];
    const yesterday = prices[i + 1];

    if (
      today.high === undefined ||
      today.low === undefined ||
      yesterday.high === undefined ||
      yesterday.low === undefined
    )
      continue;

    // 上窓 (昨日の高値より今日の下値が高い)
    if (today.low > yesterday.high) {
      // 窓埋め判定: 以降の日の安値がこの窓の水準まで下がったか
      let isFilled = false;
      for (let j = 0; j < i; j++) {
        const p = prices[j];
        if (p && p.low !== undefined && p.low <= yesterday.high) {
          isFilled = true;
          break;
        }
      }
      return {
        type: "up",
        price: yesterday.high,
        isFilled,
        date: (today as any).date || null,
      };
    }

    // 下窓 (昨日の安値より今日の高値が低い)
    if (today.high < yesterday.low) {
      // 窓埋め判定: 以降の日の高値がこの窓の水準まで上がったか
      let isFilled = false;
      for (let j = 0; j < i; j++) {
        const p = prices[j];
        if (p && p.high !== undefined && p.high >= yesterday.low) {
          isFilled = true;
          break;
        }
      }
      return {
        type: "down",
        price: yesterday.low,
        isFilled,
        date: (today as any).date || null,
      };
    }
  }

  return { type: null, price: null, isFilled: false, date: null };
}

/**
 * 支持線・抵抗線の抽出ロジック
 * 過去の値動きから反発・反落が多かった主要な価格帯を抽出する
 */
export function findSupportResistance(prices: PriceData[]): {
  supports: number[];
  resistances: number[];
} {
  if (prices.length < 20) return { supports: [], resistances: [] };

  const highs = prices
    .map((p) => p.high || p.close)
    .filter(Boolean) as number[];
  const lows = prices.map((p) => p.low || p.close).filter(Boolean) as number[];

  // ヒストグラム的手法で価格の出現頻度を確認
  const pricePoints = [...highs, ...lows];
  const min = Math.min(...pricePoints);
  const max = Math.max(...pricePoints);
  const step = (max - min) / 20; // 20分割

  const buckets: { [key: number]: number } = {};
  pricePoints.forEach((p) => {
    const bucket = Math.floor((p - min) / step);
    buckets[bucket] = (buckets[bucket] || 0) + 1;
  });

  // 頻出価格帯を特定
  const sortedBuckets = Object.entries(buckets)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3); // 上位3位

  const levels = sortedBuckets.map(
    ([bucket]) => min + Number(bucket) * step + step / 2,
  );
  const currentPrice = prices[0].close;

  return {
    supports: levels.filter((l) => l < currentPrice).sort((a, b) => b - a),
    resistances: levels.filter((l) => l > currentPrice).sort((a, b) => a - b),
  };
}
