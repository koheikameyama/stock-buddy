#!/usr/bin/env python3
"""
株価取得スクリプト
yfinanceを使って東京証券取引所の株価をリアルタイム取得
"""

import json
import sys
import time
import yfinance as yf

# 株価データの鮮度チェック（日数）（lib/constants.ts の STALE_DATA_DAYS と同じ値）
STALE_DATA_DAYS = 14


def fetch_prices(tickers: list[str]) -> list[dict]:
    """複数銘柄の株価を取得"""
    results = []

    for ticker in tickers:
        try:
            stock = yf.Ticker(ticker)
            info = stock.info

            # 現在価格を取得（複数のフィールドをフォールバック）
            current_price = (
                info.get("currentPrice")
                or info.get("regularMarketPrice")
                or info.get("previousClose")
                or 0
            )

            # 前日終値
            previous_close = (
                info.get("previousClose")
                or info.get("regularMarketPreviousClose")
                or current_price
            )

            # 変動計算
            change = current_price - previous_close if previous_close else 0
            change_percent = (change / previous_close * 100) if previous_close else 0

            # 高値・安値・出来高
            high = info.get("dayHigh") or info.get("regularMarketDayHigh") or current_price
            low = info.get("dayLow") or info.get("regularMarketDayLow") or current_price
            volume = info.get("volume") or info.get("regularMarketVolume") or 0

            # 最終取引時刻が2週間以上前なら古すぎるため無視
            market_time = info.get("regularMarketTime", 0)
            if market_time and (time.time() - market_time) > STALE_DATA_DAYS * 86400:
                print(f"Stale data for {ticker} (last trade: {market_time})", file=sys.stderr)
                continue

            if current_price > 0:
                results.append(
                    {
                        "tickerCode": ticker,
                        "currentPrice": round(current_price, 2),
                        "previousClose": round(previous_close, 2),
                        "change": round(change, 2),
                        "changePercent": round(change_percent, 2),
                        "volume": volume,
                        "high": round(high, 2),
                        "low": round(low, 2),
                    }
                )
            else:
                print(f"No price data for {ticker}", file=sys.stderr)

        except Exception as e:
            print(f"Error fetching {ticker}: {e}", file=sys.stderr)

    return results


if __name__ == "__main__":
    tickers = sys.argv[1].split(",") if len(sys.argv) > 1 else []
    results = fetch_prices(tickers)
    print(json.dumps(results))
