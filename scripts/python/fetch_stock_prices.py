#!/usr/bin/env python3
"""
株価取得スクリプト（バルク最適化版）
yf.Tickers を使用して複数銘柄の情報を一括取得し、前日終値なども含めて効率的に取得する。
"""

import json
import sys
import time
import re
from datetime import datetime, timedelta
import yfinance as yf

# 株価データの鮮度チェック（日数）
STALE_DATA_DAYS = 14

def fetch_prices_bulk(ticker_inputs: list[str]) -> dict:
    """複数銘柄の株価を一括取得
    Returns: {"prices": [...], "staleTickers": [...]}
    """
    if not ticker_inputs:
        return {"prices": [], "staleTickers": []}

    # 1. 判別が必要な銘柄（サフィックスがない、あるいは .T のもの）の候補を作成
    probes = {}  # original_input -> [candidate1, candidate2]
    all_candidates = []
    
    for original in ticker_inputs:
        # 日本株形式（数字 or 新形式）のベース部分を抽出
        match = re.match(r"^(\d+[A-Z]?)(?:\.[A-Z]+)?$", original)
        if match:
            base = match.group(1)
            candidates = [f"{base}.T", f"{base}.NG"]
            probes[original] = candidates
            all_candidates.extend(candidates)
        elif "." not in original:
            # サフィックスがない英字のみの米国株など
            all_candidates.append(original)
        else:
            # すでにサフィックスがある非日本株（インデックス等）
            all_candidates.append(original)

    # 重複除去
    all_candidates = list(set(all_candidates))
    
    # 2. 一括取得 (history を使用して価格データを取得)
    # 2日分のデータを取得すれば、現在価格（最終行）と前日終値（その前）が手に入る
    try:
        tickers_obj = yf.Tickers(" ".join(all_candidates))
        # period='2d' で直近2営業日分を取得
        hist = tickers_obj.history(period="2d", interval="1d", progress=False)
    except Exception as e:
        print(f"Error calling yfinance: {e}", file=sys.stderr)
        return {"prices": [], "staleTickers": [], "error": str(e)}

    results = []
    stale_tickers = []
    processed_originals = set()

    # 3. 取得結果の解析
    # hist は MultiIndex (Close, 7203.T) のような形になるか、単一なら単一の DataFrame
    def get_ticker_data(t):
        if len(all_candidates) > 1:
            try:
                # Column check
                if t in hist.columns.get_level_values(1):
                    return hist.xs(t, axis=1, level=1)
            except:
                pass
        else:
            # 単一銘柄の場合は hist がそのままその銘柄のデータ
            return hist
        return None

    # 各元の入力に対して最適な結果を選ぶ
    for original in ticker_inputs:
        candidates = probes.get(original, [original])
        best_data = None
        hit_ticker = None

        max_volume = -1
        for cand in candidates:
            data = get_ticker_data(cand)
            if data is not None and not data.empty and not data['Close'].dropna().empty:
                # 出来高を比較して、より活発な市場（通常は東証）を選択する
                # ただしデータが存在することが前提
                try:
                    current_vol = int(data['Volume'].iloc[-1]) if 'Volume' in data.columns else 0
                except:
                    current_vol = 0
                
                if current_vol > max_volume:
                    max_volume = current_vol
                    best_data = data
                    hit_ticker = cand

        if best_data is not None:
            try:
                # 最新行（当日）と前行（前日）
                rows = best_data.dropna(subset=['Close'])
                if rows.empty:
                    continue
                
                current_row = rows.iloc[-1]
                prev_row = rows.iloc[-2] if len(rows) > 1 else current_row

                current_price = float(current_row['Close'])
                prev_close = float(prev_row['Close'])
                
                # yfinance の history には volume などの情報も含まれる
                high = float(current_row['High'])
                low = float(current_row['Low'])
                volume = int(current_row['Volume'])
                
                # 計算
                change = current_price - prev_close
                change_percent = (change / prev_close * 100) if prev_close != 0 else 0

                # 鮮度チェック (Index は Timestamp)
                last_date = rows.index[-1]
                if (datetime.now() - last_date.to_pydatetime()).days > STALE_DATA_DAYS:
                    stale_tickers.append(original)
                    continue

                results.append({
                    "tickerCode": original,
                    "actualTicker": hit_ticker,
                    "currentPrice": round(current_price, 2),
                    "previousClose": round(prev_close, 2),
                    "change": round(change, 2),
                    "changePercent": round(change_percent, 2),
                    "volume": volume,
                    "high": round(high, 2),
                    "low": round(low, 2),
                    "marketTime": int(last_date.timestamp())
                })
            except Exception as e:
                print(f"Error processing {original}: {e}", file=sys.stderr)
        else:
            # どの候補もヒットしなかった場合
            print(f"No valid data found for {original}", file=sys.stderr)

    return {"prices": results, "staleTickers": stale_tickers}

if __name__ == "__main__":
    if len(sys.argv) > 1:
        ticker_list = sys.argv[1].split(",")
        output = fetch_prices_bulk(ticker_list)
        print(json.dumps(output))
    else:
        print(json.dumps({"prices": [], "staleTickers": []}))
