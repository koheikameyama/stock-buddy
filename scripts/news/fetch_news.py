#!/usr/bin/env python3
"""
株式関連ニュースを取得してMarketNewsテーブルに保存するスクリプト

機能:
- Google News RSSから株式関連ニュースを取得
- セクター・センチメント分析（ルールベース + AI）
- MarketNewsテーブルへの保存
- 話題の銘柄コード抽出

Usage:
    python scripts/news/fetch_news.py
"""

import sys
import re
import os
import json
import feedparser
import psycopg2
import psycopg2.extras
from typing import List, Dict, Set, Optional, Tuple
from datetime import datetime, timedelta
from openai import OpenAI

# ニュースソースURL
RSS_URLS = {
    # Google News（総合）
    "google_news_stock": "https://news.google.com/rss/search?q=日本株+OR+東証+OR+株式市場+when:7d&hl=ja&gl=JP&ceid=JP:ja",
    "google_news_nikkei": "https://news.google.com/rss/search?q=site:nikkei.com+株+OR+銘柄+when:7d&hl=ja&gl=JP&ceid=JP:ja",
    # Google News（決算・業績）
    "google_news_earnings": "https://news.google.com/rss/search?q=決算+OR+業績+OR+増益+OR+減益+株+when:7d&hl=ja&gl=JP&ceid=JP:ja",
    # Google News（セクター別）
    "google_news_tech": "https://news.google.com/rss/search?q=半導体+OR+AI関連+OR+テック株+when:7d&hl=ja&gl=JP&ceid=JP:ja",
    "google_news_auto": "https://news.google.com/rss/search?q=自動車+OR+EV+株+when:7d&hl=ja&gl=JP&ceid=JP:ja",
    # Yahoo Finance Japan
    "yahoo_finance_market": "https://news.yahoo.co.jp/rss/topics/business.xml",
    "yahoo_finance_stock": "https://finance.yahoo.co.jp/rss/stock/domestic",
    # Bloomberg Japan
    "google_news_bloomberg": "https://news.google.com/rss/search?q=site:bloomberg.co.jp+株+OR+市場+when:7d&hl=ja&gl=JP&ceid=JP:ja",
    # Reuters Japan
    "google_news_reuters": "https://news.google.com/rss/search?q=site:jp.reuters.com+株+OR+市場+when:7d&hl=ja&gl=JP&ceid=JP:ja",
    # 株探（Kabutan）
    "google_news_kabutan": "https://news.google.com/rss/search?q=site:kabutan.jp+when:7d&hl=ja&gl=JP&ceid=JP:ja",
    # みんかぶ（Minkabu）
    "google_news_minkabu": "https://news.google.com/rss/search?q=site:minkabu.jp+株+when:7d&hl=ja&gl=JP&ceid=JP:ja",
    # 東洋経済
    "google_news_toyokeizai": "https://news.google.com/rss/search?q=site:toyokeizai.net+株+OR+企業+when:7d&hl=ja&gl=JP&ceid=JP:ja",
}

# フィードごとのソース名マッピング
FEED_SOURCE_MAP = {
    "google_news_stock": "google_news",
    "google_news_nikkei": "nikkei",
    "google_news_earnings": "google_news",
    "google_news_tech": "google_news",
    "google_news_auto": "google_news",
    "yahoo_finance_market": "yahoo_finance",
    "yahoo_finance_stock": "yahoo_finance",
    "google_news_bloomberg": "bloomberg",
    "google_news_reuters": "reuters",
    "google_news_kabutan": "kabutan",
    "google_news_minkabu": "minkabu",
    "google_news_toyokeizai": "toyokeizai",
}

# セクター分類キーワード
SECTOR_KEYWORDS = {
    "半導体・電子部品": ["半導体", "電子部品", "チップ", "DRAM", "NAND", "フラッシュメモリ"],
    "自動車": ["自動車", "トヨタ", "ホンダ", "日産", "マツダ", "スバル", "EV", "電気自動車"],
    "金融": ["銀行", "証券", "保険", "金融", "メガバンク", "地銀", "信託"],
    "医薬品": ["製薬", "医薬品", "新薬", "治験", "バイオ", "創薬"],
    "通信": ["通信", "NTT", "KDDI", "ソフトバンク", "5G", "携帯"],
    "小売": ["小売", "百貨店", "コンビニ", "EC", "通販", "スーパー"],
    "不動産": ["不動産", "マンション", "オフィス", "REIT", "商業施設"],
    "エネルギー": ["石油", "ガス", "電力", "エネルギー", "再生可能", "太陽光"],
    "素材": ["鉄鋼", "化学", "素材", "建材", "セメント"],
    "IT・サービス": ["IT", "ソフトウェア", "クラウド", "AI", "DX", "SaaS"],
}

# センチメント分類キーワード
SENTIMENT_KEYWORDS = {
    "positive": ["急騰", "上昇", "好調", "最高益", "増益", "買い", "強気", "上方修正", "好決算"],
    "negative": ["急落", "下落", "減益", "赤字", "売り", "弱気", "懸念", "下方修正", "不調"],
    "neutral": ["横ばい", "様子見", "保ち合い", "変わらず", "据え置き"],
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


def detect_sector_by_keywords(text: str) -> Optional[str]:
    """
    キーワードマッチングでセクターを判定

    Args:
        text: ニュースのタイトル + 内容

    Returns:
        セクター名（見つからない場合はNone）
    """
    text_lower = text.lower()

    for sector, keywords in SECTOR_KEYWORDS.items():
        for keyword in keywords:
            if keyword.lower() in text_lower:
                return sector

    return None


def detect_sentiment_by_keywords(text: str) -> Optional[str]:
    """
    キーワードマッチングでセンチメントを判定

    Args:
        text: ニュースのタイトル + 内容

    Returns:
        センチメント（positive/neutral/negative）（見つからない場合はNone）
    """
    text_lower = text.lower()

    for sentiment, keywords in SENTIMENT_KEYWORDS.items():
        for keyword in keywords:
            if keyword.lower() in text_lower:
                return sentiment

    return None


def analyze_with_openai(title: str, content: str) -> Tuple[Optional[str], Optional[str]]:
    """
    OpenAI APIでセクター・センチメントを分析

    Args:
        title: ニュースタイトル
        content: ニュース内容

    Returns:
        (sector, sentiment) のタプル
    """
    try:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            print("⚠️  OPENAI_API_KEY not found, skipping AI analysis")
            return None, None

        client = OpenAI(api_key=api_key)

        prompt = f"""以下のニュースを分析して、セクターとセンチメントを判定してください。

タイトル: {title}
内容: {content}

セクター候補: 半導体・電子部品、自動車、金融、医薬品、通信、小売、不動産、エネルギー、素材、IT・サービス
センチメント候補: positive、neutral、negative

回答形式（JSON）:
{{"sector": "セクター名 or null", "sentiment": "positive/neutral/negative or null"}}
"""

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.3,
        )

        result = json.loads(response.choices[0].message.content)
        sector = result.get("sector")
        sentiment = result.get("sentiment")

        return sector, sentiment

    except Exception as e:
        print(f"⚠️  OpenAI API error: {e}")
        return None, None


def check_duplicate_news(title: str, url: str, cursor) -> bool:
    """
    重複ニュースをチェック（タイトル + URLでユニーク判定）

    Args:
        title: ニュースタイトル
        url: ニュースURL
        cursor: データベースカーソル

    Returns:
        True: 重複あり、False: 重複なし
    """
    try:
        cursor.execute(
            """
            SELECT COUNT(*) FROM "MarketNews"
            WHERE title = %s AND url = %s
            """,
            (title, url)
        )
        count = cursor.fetchone()[0]
        return count > 0
    except Exception as e:
        print(f"⚠️  Error checking duplicate: {e}")
        return False


def save_news_to_db(news_items: List[Dict], conn) -> int:
    """
    MarketNewsテーブルにニュースを保存（バッチINSERT）

    Args:
        news_items: 保存するニュースアイテムのリスト
        conn: データベース接続

    Returns:
        保存した件数
    """
    if not news_items:
        return 0

    try:
        cursor = conn.cursor()

        # バッチINSERT用のデータ準備
        values = [
            (
                item["title"],
                item["content"],
                item["url"],
                item["source"],
                item["sector"],
                item["sentiment"],
                item["published_at"],
            )
            for item in news_items
        ]

        # cuidの生成（Prismaの@default(cuid())を模倣）
        import secrets
        import base64

        def generate_cuid():
            """Prismaのcuidを模倣したID生成"""
            random_bytes = secrets.token_bytes(12)
            return base64.urlsafe_b64encode(random_bytes).decode('utf-8').rstrip('=')

        values_with_id = [
            (
                generate_cuid(),
                item["title"],
                item["content"],
                item["url"],
                item["source"],
                item["sector"],
                item["sentiment"],
                item["published_at"],
            )
            for item in news_items
        ]

        psycopg2.extras.execute_values(
            cursor,
            """
            INSERT INTO "MarketNews"
            (id, title, content, url, source, sector, sentiment, "publishedAt", "createdAt")
            VALUES %s
            """,
            values_with_id,
            template='(%s, %s, %s, %s, %s, %s, %s, %s, NOW())',
            page_size=100
        )

        conn.commit()
        cursor.close()

        return len(news_items)

    except Exception as e:
        print(f"❌ Error saving news to DB: {e}")
        conn.rollback()
        return 0


def main():
    """メイン処理"""
    print("=" * 60)
    print("JPX News & Stock Code Extraction Script (Enhanced)")
    print("=" * 60)

    # データベース接続
    database_url = os.getenv("DATABASE_URL")
    conn = None

    if database_url:
        try:
            print(f"\n🔌 Connecting to database...")
            conn = psycopg2.connect(database_url)
            print("✅ Database connected")
        except Exception as e:
            print(f"❌ Database connection failed: {e}")
            print("⚠️  Continuing without database (stock code extraction only)")
    else:
        print("⚠️  DATABASE_URL not found, skipping database operations")

    all_stock_codes = set()
    all_entries = []
    news_to_save = []

    rule_based_count = 0
    ai_based_count = 0

    # 各RSSフィードを取得
    for feed_name, url in RSS_URLS.items():
        print(f"\n📰 Processing feed: {feed_name}")
        entries = fetch_rss_feed(url)

        # 直近7日間のエントリのみを対象
        recent_entries = filter_recent_entries(entries, days=7)
        print(f"ℹ️  Recent entries (last 7 days): {len(recent_entries)}")

        # 各ニュースを処理
        for entry in recent_entries:
            text = f"{entry['title']} {entry['summary']}"

            # 銘柄コード抽出（既存機能）
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

            # データベース保存用の処理
            if conn:
                # 重複チェック
                cursor = conn.cursor()
                if check_duplicate_news(entry["title"], entry["link"], cursor):
                    cursor.close()
                    continue
                cursor.close()

                # セクター・センチメント分析（ルールベース）
                sector = detect_sector_by_keywords(text)
                sentiment = detect_sentiment_by_keywords(text)

                # ルールベースで判定できなかった場合はAI分析
                if sector is None or sentiment is None:
                    ai_sector, ai_sentiment = analyze_with_openai(entry["title"], entry["summary"])
                    if sector is None:
                        sector = ai_sector
                    if sentiment is None:
                        sentiment = ai_sentiment
                    ai_based_count += 1
                else:
                    rule_based_count += 1

                # 保存用データに追加
                published_at = datetime(*entry["published_parsed"][:6]) if entry["published_parsed"] else datetime.now()
                source_name = FEED_SOURCE_MAP.get(feed_name, "google_news")
                news_to_save.append({
                    "title": entry["title"],
                    "content": entry["summary"],
                    "url": entry["link"],
                    "source": source_name,
                    "sector": sector,
                    "sentiment": sentiment,
                    "published_at": published_at,
                })

    # ニュースをデータベースに保存
    if conn and news_to_save:
        print(f"\n🔍 Analyzing {len(news_to_save)} new entries...")
        print(f"  ├─ Rule-based: {rule_based_count} entries")
        print(f"  └─ AI-based: {ai_based_count} entries")

        saved_count = save_news_to_db(news_to_save, conn)
        print(f"💾 Saved {saved_count} news to database")

    # データベース接続をクローズ
    if conn:
        conn.close()
        print("🔌 Database connection closed")

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
