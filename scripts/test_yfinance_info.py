#!/usr/bin/env python3
"""
yfinanceで取得できる財務指標を確認するテストスクリプト
"""

import yfinance as yf

# テスト用に日本株を取得
ticker = "7203.T"  # トヨタ自動車
print(f"Testing with {ticker}...")

stock = yf.Ticker(ticker)

# infoから取得できる全情報を表示
info = stock.info

print("\n=== 基本情報 ===")
print(f"会社名: {info.get('longName')}")
print(f"セクター: {info.get('sector')}")
print(f"業種: {info.get('industry')}")

print("\n=== 株価指標 ===")
print(f"現在株価: {info.get('currentPrice')}")
print(f"PER (株価収益率): {info.get('trailingPE')}")
print(f"PBR (株価純資産倍率): {info.get('priceToBook')}")
print(f"配当利回り: {info.get('dividendYield')}")
print(f"時価総額: {info.get('marketCap')}")

print("\n=== 財務指標 ===")
print(f"ROE (自己資本利益率): {info.get('returnOnEquity')}")
print(f"ROA (総資産利益率): {info.get('returnOnAssets')}")
print(f"粗利率: {info.get('grossMargins')}")
print(f"営業利益率: {info.get('operatingMargins')}")
print(f"純利益率: {info.get('profitMargins')}")

print("\n=== キャッシュフロー ===")
print(f"営業CF: {info.get('operatingCashflow')}")
print(f"フリーCF: {info.get('freeCashflow')}")

print("\n=== その他の有用な指標 ===")
print(f"ベータ (市場感応度): {info.get('beta')}")
print(f"52週高値: {info.get('fiftyTwoWeekHigh')}")
print(f"52週安値: {info.get('fiftyTwoWeekLow')}")
print(f"平均出来高: {info.get('averageVolume')}")

print("\n\n=== 利用可能な全キー ===")
available_keys = sorted([k for k in info.keys() if info.get(k) is not None])
for key in available_keys:
    print(f"{key}: {info[key]}")
