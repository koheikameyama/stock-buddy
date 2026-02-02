#!/usr/bin/env python3
"""
JPX公式RSSからニュースを取得し、話題の銘柄コードを抽出するスクリプト

Usage:
    python scripts/news/fetch_jpx_news.py
"""

import sys
import re
import feedparser
from typing import List, Dict, Set
from datetime import datetime, timedelta

# ニュースソースURL（Google News RSSを使用）
RSS_URLS = {
    "google_news_stock": "https://news.google.com/rss/search?q=日本株+OR+東証+OR+株式市場+when:7d&hl=ja&gl=JP&ceid=JP:ja",
    "google_news_nikkei": "https://news.google.com/rss/search?q=site:nikkei.com+株+OR+銘柄+when:7d&hl=ja&gl=JP&ceid=JP:ja",
}


def fetch_rss_feed(url: str) -> List[Dict]:
    """
    RSSフィードを取得してパースする

    Args:
        url: RSS URL

    Returns:
        ニュースエントリのリスト
    """
    try:
        print(f"📡 Fetching RSS from {url}")
        feed = feedparser.parse(url)

        if feed.bozo:
            print(f"⚠️  Warning: Feed parsing error: {feed.bozo_exception}")

        entries = []
        for entry in feed.entries:
            entries.append({
                "title": entry.get("title", ""),
                "link": entry.get("link", ""),
                "summary": entry.get("summary", ""),
                "published": entry.get("published", ""),
                "published_parsed": entry.get("published_parsed", None),
            })

        print(f"✅ Fetched {len(entries)} entries")
        return entries

    except Exception as e:
        print(f"❌ Error fetching RSS: {e}")
        return []


def extract_stock_codes(text: str) -> Set[str]:
    """
    テキストから銘柄コード（4桁数字）を抽出

    Args:
        text: 検索対象のテキスト

    Returns:
        抽出された銘柄コードのセット
    """
    # 4桁の数字を抽出（ただし1000-9999の範囲）
    pattern = r'\b([1-9][0-9]{3})\b'
    matches = re.findall(pattern, text)

    # 銘柄コードとして妥当な範囲（1000-9999）のみを返す
    stock_codes = {code for code in matches if 1000 <= int(code) <= 9999}

    return stock_codes


def filter_recent_entries(entries: List[Dict], days: int = 7) -> List[Dict]:
    """
    直近N日間のエントリのみをフィルタリング

    Args:
        entries: ニュースエントリのリスト
        days: フィルタリングする日数（デフォルト: 7日）

    Returns:
        フィルタリングされたエントリのリスト
    """
    cutoff_date = datetime.now() - timedelta(days=days)

    recent_entries = []
    for entry in entries:
        if entry["published_parsed"]:
            entry_date = datetime(*entry["published_parsed"][:6])
            if entry_date >= cutoff_date:
                recent_entries.append(entry)

    return recent_entries


def main():
    """メイン処理"""
    print("=" * 60)
    print("JPX News & Stock Code Extraction Script")
    print("=" * 60)

    all_stock_codes = set()
    all_entries = []

    # 各RSSフィードを取得
    for feed_name, url in RSS_URLS.items():
        print(f"\n📰 Processing feed: {feed_name}")
        entries = fetch_rss_feed(url)

        # 直近7日間のエントリのみを対象
        recent_entries = filter_recent_entries(entries, days=7)
        print(f"ℹ️  Recent entries (last 7 days): {len(recent_entries)}")

        # 銘柄コードを抽出
        for entry in recent_entries:
            text = f"{entry['title']} {entry['summary']}"
            stock_codes = extract_stock_codes(text)

            if stock_codes:
                entry["stock_codes"] = list(stock_codes)
                all_stock_codes.update(stock_codes)
                all_entries.append({
                    "feed": feed_name,
                    "title": entry["title"],
                    "link": entry["link"],
                    "stock_codes": list(stock_codes),
                    "published": entry["published"],
                })

    # 結果を表示
    print(f"\n{'=' * 60}")
    print(f"📊 Summary")
    print(f"{'=' * 60}")
    print(f"Total unique stock codes found: {len(all_stock_codes)}")
    print(f"Stock codes: {sorted(all_stock_codes)}")

    print(f"\n📋 News entries with stock codes:")
    for entry in all_entries:
        print(f"\n  • {entry['title']}")
        print(f"    Codes: {entry['stock_codes']}")
        print(f"    Link: {entry['link']}")
        print(f"    Date: {entry['published']}")

    # 銘柄コードをJSON形式で出力（次のスクリプトで使用）
    import json
    output_file = "scripts/news/trending_stock_codes.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump({
            "timestamp": datetime.now().isoformat(),
            "stock_codes": sorted(all_stock_codes),
            "news_count": len(all_entries),
        }, f, ensure_ascii=False, indent=2)

    print(f"\n✅ Stock codes saved to {output_file}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
