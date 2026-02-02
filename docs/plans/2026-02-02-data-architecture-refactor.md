# データアーキテクチャ刷新 & UI統合 実装計画

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** ポートフォリオ/ウォッチリスト統合、JPXスクレイピング、Twitter連携による注目銘柄発見、AI料金85%削減を実現

**Architecture:**
- 3層データ構造（銘柄マスタ/注目銘柄/ユーザー登録銘柄）
- オンデマンドAPI取得（yfinance）、DB保存は分析結果のみ
- Twitter連携で注目銘柄を自動発見

**Tech Stack:**
- Next.js 15, Prisma, PostgreSQL
- Python (BeautifulSoup, twikit, yfinance)
- OpenAI API

---

## フェーズ1: データ基盤の整備

### Task 1.1: 新しいデータベーススキーマ設計

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: FeaturedStockモデルを追加**

```prisma
// 注目銘柄プール（X連携で発見）
model FeaturedStock {
  id        String   @id @default(cuid())
  stockId   String
  stock     Stock    @relation(fields: [stockId], references: [id], onDelete: Cascade)
  date      DateTime @default(now())
  category  String   // "surge" | "stable" | "trending"
  reason    String?  @db.Text // AI分析結果
  score     Float?
  source    String   @default("manual") // "twitter" | "manual"

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([date])
  @@index([category])
  @@index([stockId])
}
```

**Step 2: UserStockモデルを追加（ポートフォリオ/ウォッチリスト統合）**

```prisma
// ユーザーの銘柄（ポートフォリオ + ウォッチリスト統合）
model UserStock {
  id           String    @id @default(cuid())
  userId       String
  user         User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  stockId      String
  stock        Stock     @relation(fields: [stockId], references: [id], onDelete: Cascade)

  // 数量入力あり → 保有中、なし → ウォッチ中
  quantity     Int?
  averagePrice Float?
  purchaseDate DateTime?

  // AI分析結果
  lastAnalysis DateTime?
  shortTerm    String?   @db.Text // 短期予測
  mediumTerm   String?   @db.Text // 中期予測
  longTerm     String?   @db.Text // 長期予測

  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  @@unique([userId, stockId])
  @@index([userId])
  @@index([stockId])
}
```

**Step 3: Stockモデルにフィールド追加**

```prisma
model Stock {
  // 既存フィールド
  id            String @id @default(cuid())
  tickerCode    String @unique
  name          String
  market        String?
  sector        String?
  beginnerScore Int?

  // 新規フィールド
  listedDate    DateTime? // 上場日（IPO対応）

  // リレーション
  featuredStocks FeaturedStock[]
  userStocks     UserStock[]

  // 既存リレーションは維持
  portfolioStocks PortfolioStock[]
  watchlists      Watchlist[]
  // ...
}
```

**Step 4: Userモデルにリレーション追加**

```prisma
model User {
  // 既存フィールド
  id String @id @default(cuid())
  // ...

  // 新規リレーション
  userStocks UserStock[]

  // 既存リレーションは維持
  // ...
}
```

**Step 5: マイグレーション作成**

```bash
npx prisma migrate dev --name add_featured_stock_and_user_stock
```

Expected: マイグレーションファイル作成、DB更新成功

**Step 6: Prisma Client再生成**

```bash
npx prisma generate
```

Expected: 型定義更新

**Step 7: コミット**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add FeaturedStock and UserStock models"
```

---

### Task 1.2: JPXスクレイピングスクリプト作成

**Files:**
- Create: `scripts/jpx/scrape_stocks.py`
- Create: `scripts/jpx/update_stock_master.py`

**Step 1: JPXスクレイピングスクリプト作成**

```python
"""
JPX公式サイトから上場企業リストを取得

Usage:
    python scripts/jpx/scrape_stocks.py
"""

import requests
from bs4 import BeautifulSoup
import json
import time
from datetime import datetime

def scrape_jpx_listed_companies():
    """JPXから上場企業リストを取得"""
    print("📊 JPXから上場企業リストを取得中...")

    # JPX上場会社一覧ページ（実際のURLは要確認）
    url = "https://www.jpx.co.jp/listing/co-search/index.html"

    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        soup = BeautifulSoup(response.content, "html.parser")

        stocks = []

        # 実際のHTML構造に合わせて調整が必要
        # ここではサンプル実装
        table = soup.find("table", class_="component-normal-table")
        if not table:
            print("⚠️ テーブルが見つかりません")
            return []

        rows = table.find_all("tr")[1:]  # ヘッダー行をスキップ

        for row in rows:
            cols = row.find_all("td")
            if len(cols) < 4:
                continue

            ticker_code = cols[0].text.strip()
            name = cols[1].text.strip()
            market = cols[2].text.strip()
            sector = cols[3].text.strip()

            stocks.append({
                "tickerCode": ticker_code + ".T",  # Yahoo Finance形式
                "name": name,
                "market": market,
                "sector": sector,
                "listedDate": None  # 後で取得
            })

        print(f"✅ {len(stocks)}銘柄を取得しました")
        return stocks

    except Exception as e:
        print(f"❌ スクレイピングエラー: {e}")
        return []


def scrape_jpx_new_listings():
    """JPXから新規上場（IPO）銘柄を取得"""
    print("🆕 JPXから新規上場銘柄を取得中...")

    url = "https://www.jpx.co.jp/listing/stocks/new/index.html"

    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        soup = BeautifulSoup(response.content, "html.parser")

        new_listings = []

        # 実際のHTML構造に合わせて調整が必要
        table = soup.find("table", class_="component-normal-table")
        if not table:
            print("⚠️ テーブルが見つかりません")
            return []

        rows = table.find_all("tr")[1:]

        for row in rows:
            cols = row.find_all("td")
            if len(cols) < 4:
                continue

            ticker_code = cols[0].text.strip()
            name = cols[1].text.strip()
            market = cols[2].text.strip()
            listed_date_str = cols[3].text.strip()

            # 日付パース（例: 2026年2月1日 → 2026-02-01）
            try:
                listed_date = datetime.strptime(listed_date_str, "%Y年%m月%d日").isoformat()
            except:
                listed_date = None

            new_listings.append({
                "tickerCode": ticker_code + ".T",
                "name": name,
                "market": market,
                "sector": None,  # IPO情報には業種が含まれない場合がある
                "listedDate": listed_date
            })

        print(f"✅ {len(new_listings)}件の新規上場銘柄を取得しました")
        return new_listings

    except Exception as e:
        print(f"❌ スクレイピングエラー: {e}")
        return []


def save_to_json(stocks, filename="jpx_stocks.json"):
    """取得した銘柄データをJSONファイルに保存"""
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(stocks, f, ensure_ascii=False, indent=2)
    print(f"💾 {filename}に保存しました")


if __name__ == "__main__":
    # 上場企業リスト取得
    listed_stocks = scrape_jpx_listed_companies()

    # 新規上場銘柄取得
    new_listings = scrape_jpx_new_listings()

    # マージ（新規上場銘柄で上書き）
    all_stocks = {stock["tickerCode"]: stock for stock in listed_stocks}
    for new_stock in new_listings:
        all_stocks[new_stock["tickerCode"]] = new_stock

    # JSON保存
    save_to_json(list(all_stocks.values()), "jpx_stocks.json")

    print(f"\n📊 合計: {len(all_stocks)}銘柄")
```

**Step 2: データベース更新スクリプト作成**

```python
"""
JPXから取得した銘柄データをデータベースに反映

Usage:
    python scripts/jpx/update_stock_master.py
"""

import json
import os
import psycopg2
from datetime import datetime

DATABASE_URL = os.getenv("DATABASE_URL") or os.getenv("PRODUCTION_DATABASE_URL")

def update_stock_master():
    """JPXデータをStockテーブルに反映"""

    # JSONファイル読み込み
    with open("jpx_stocks.json", "r", encoding="utf-8") as f:
        stocks = json.load(f)

    print(f"📊 {len(stocks)}銘柄をデータベースに反映中...")

    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    inserted = 0
    updated = 0

    for stock in stocks:
        ticker_code = stock["tickerCode"]
        name = stock["name"]
        market = stock.get("market")
        sector = stock.get("sector")
        listed_date = stock.get("listedDate")

        try:
            # UPSERT (既存なら更新、なければ挿入)
            cur.execute("""
                INSERT INTO "Stock" (id, "tickerCode", name, market, sector, "listedDate", "createdAt")
                VALUES (
                    'st_' || encode(gen_random_bytes(12), 'hex'),
                    %s, %s, %s, %s, %s, NOW()
                )
                ON CONFLICT ("tickerCode") DO UPDATE SET
                    name = EXCLUDED.name,
                    market = EXCLUDED.market,
                    sector = EXCLUDED.sector,
                    "listedDate" = EXCLUDED."listedDate"
                RETURNING (xmax = 0) AS inserted
            """, (ticker_code, name, market, sector, listed_date))

            result = cur.fetchone()
            if result and result[0]:
                inserted += 1
            else:
                updated += 1

        except Exception as e:
            print(f"❌ エラー ({ticker_code}): {e}")
            continue

    conn.commit()
    cur.close()
    conn.close()

    print(f"✅ 完了: 新規{inserted}銘柄、更新{updated}銘柄")


if __name__ == "__main__":
    update_stock_master()
```

**Step 3: 依存パッケージインストール**

```bash
pip install beautifulsoup4 requests psycopg2-binary
```

**Step 4: スクリプト実行テスト（ドライラン）**

```bash
cd /Users/kouheikameyama/development/stock-buddy
python scripts/jpx/scrape_stocks.py
```

Expected: `jpx_stocks.json` ファイル作成

**Step 5: データベース更新実行**

```bash
python scripts/jpx/update_stock_master.py
```

Expected: Stockテーブルに銘柄データ反映

**Step 6: コミット**

```bash
git add scripts/jpx/
git commit -m "feat: add JPX scraping scripts for stock master data"
```

---

### Task 1.3: データ移行スクリプト（PortfolioStock/Watchlist → UserStock）

**Files:**
- Create: `scripts/migration/migrate_to_user_stock.py`

**Step 1: 移行スクリプト作成**

```python
"""
既存のPortfolioStockとWatchlistをUserStockに移行

Usage:
    python scripts/migration/migrate_to_user_stock.py
"""

import os
import psycopg2
from datetime import datetime

DATABASE_URL = os.getenv("DATABASE_URL") or os.getenv("PRODUCTION_DATABASE_URL")

def migrate_portfolio_stocks():
    """PortfolioStockをUserStockに移行"""
    print("📦 PortfolioStockを移行中...")

    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    # PortfolioStockを取得
    cur.execute("""
        SELECT
            ps.id,
            p."userId",
            ps."stockId",
            ps.quantity,
            ps."averagePrice",
            ps."purchaseDate"
        FROM "PortfolioStock" ps
        JOIN "Portfolio" p ON ps."portfolioId" = p.id
    """)

    portfolio_stocks = cur.fetchall()

    migrated = 0
    for row in portfolio_stocks:
        ps_id, user_id, stock_id, quantity, avg_price, purchase_date = row

        try:
            cur.execute("""
                INSERT INTO "UserStock" (
                    id, "userId", "stockId", quantity, "averagePrice",
                    "purchaseDate", "createdAt", "updatedAt"
                )
                VALUES (
                    'us_' || encode(gen_random_bytes(12), 'hex'),
                    %s, %s, %s, %s, %s, NOW(), NOW()
                )
                ON CONFLICT ("userId", "stockId") DO NOTHING
            """, (user_id, stock_id, quantity, avg_price, purchase_date))

            migrated += 1
        except Exception as e:
            print(f"❌ エラー (PortfolioStock {ps_id}): {e}")

    conn.commit()
    print(f"✅ PortfolioStock: {migrated}件移行完了")

    return migrated


def migrate_watchlists():
    """WatchlistをUserStockに移行（quantityなし）"""
    print("👀 Watchlistを移行中...")

    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    # Watchlistを取得
    cur.execute("""
        SELECT
            id,
            "userId",
            "stockId"
        FROM "Watchlist"
    """)

    watchlists = cur.fetchall()

    migrated = 0
    for row in watchlists:
        wl_id, user_id, stock_id = row

        try:
            cur.execute("""
                INSERT INTO "UserStock" (
                    id, "userId", "stockId",
                    "createdAt", "updatedAt"
                )
                VALUES (
                    'us_' || encode(gen_random_bytes(12), 'hex'),
                    %s, %s, NOW(), NOW()
                )
                ON CONFLICT ("userId", "stockId") DO NOTHING
            """, (user_id, stock_id))

            migrated += 1
        except Exception as e:
            print(f"❌ エラー (Watchlist {wl_id}): {e}")

    conn.commit()
    cur.close()
    conn.close()

    print(f"✅ Watchlist: {migrated}件移行完了")

    return migrated


if __name__ == "__main__":
    print("🔄 データ移行を開始します...\n")

    portfolio_count = migrate_portfolio_stocks()
    watchlist_count = migrate_watchlists()

    print(f"\n✅ 移行完了: 合計{portfolio_count + watchlist_count}件")
    print("\n⚠️ 注意: 既存のPortfolioStock/Watchlistテーブルは削除していません")
    print("   動作確認後、手動で削除してください")
```

**Step 2: 移行実行（ローカルDB）**

```bash
DATABASE_URL="postgresql://kouheikameyama@localhost:5432/stock_buddy" python scripts/migration/migrate_to_user_stock.py
```

Expected: UserStockテーブルにデータ移行

**Step 3: 移行確認**

```bash
psql postgresql://kouheikameyama@localhost:5432/stock_buddy -c 'SELECT COUNT(*) FROM "UserStock";'
```

Expected: 移行件数表示

**Step 4: コミット**

```bash
git add scripts/migration/
git commit -m "feat: add migration script from PortfolioStock/Watchlist to UserStock"
```

---

## フェーズ2: Twitter (X) 連携

### Task 2.1: Twitter自動フォロー・ツイート収集スクリプト

**Files:**
- Create: `scripts/twitter/auto_follow_influencers.py`
- Create: `scripts/twitter/scrape_stock_tweets.py`
- Create: `scripts/twitter/extract_stock_tickers.py`

**Step 1: 投資インフルエンサー自動フォロースクリプト**

```python
"""
投資関連のインフルエンサーを自動フォロー

Usage:
    TWITTER_USERNAME=xxx TWITTER_EMAIL=xxx TWITTER_PASSWORD=xxx \\
    python scripts/twitter/auto_follow_influencers.py
"""

import asyncio
import os
from twikit import Client

# 投資インフルエンサーリスト
INFLUENCERS = [
    "hirosetakao",      # じっちゃま（米国株）
    "kabukyodai",       # 株教材（日本株）
    "fisco_jp",         # フィスコ（金融情報）
    "traders_web",      # トレーダーズ・ウェブ
    "nikkei",           # 日本経済新聞
    "tokyoipo",         # 東京IPO
    # 必要に応じて追加
]

# 認証情報
TWITTER_USERNAME = os.getenv("TWITTER_USERNAME")
TWITTER_EMAIL = os.getenv("TWITTER_EMAIL")
TWITTER_PASSWORD = os.getenv("TWITTER_PASSWORD")


async def login_twitter(client: Client) -> None:
    """Twitterにログイン"""
    try:
        if os.path.exists("twitter_cookies.json"):
            print("📂 既存のCookieを読み込み中...")
            client.load_cookies("twitter_cookies.json")
        else:
            print("🔐 Twitterにログイン中...")
            await client.login(
                auth_info_1=TWITTER_USERNAME,
                auth_info_2=TWITTER_EMAIL,
                password=TWITTER_PASSWORD,
            )
            client.save_cookies("twitter_cookies.json")
            print("✅ ログイン成功！")
    except Exception as e:
        print(f"❌ ログイン失敗: {e}")
        raise


async def follow_influencers(client: Client):
    """インフルエンサーリストを自動フォロー"""
    print(f"👥 {len(INFLUENCERS)}人のインフルエンサーをフォロー中...\n")

    followed = 0
    already_following = 0
    errors = 0

    for username in INFLUENCERS:
        try:
            print(f"  @{username} をフォロー中...", end=" ")
            user = await client.get_user_by_screen_name(username)

            # フォロー済みチェック（user.following属性）
            if hasattr(user, 'following') and user.following:
                print("✓ 既にフォロー中")
                already_following += 1
                continue

            # フォロー実行
            await client.follow_user(user.id)
            print("✅ フォローしました")
            followed += 1

            # レート制限回避（1秒待機）
            await asyncio.sleep(1)

        except Exception as e:
            print(f"❌ エラー: {e}")
            errors += 1

    print(f"\n✅ 完了:")
    print(f"  - 新規フォロー: {followed}人")
    print(f"  - 既にフォロー中: {already_following}人")
    print(f"  - エラー: {errors}人")


async def main():
    if not all([TWITTER_USERNAME, TWITTER_EMAIL, TWITTER_PASSWORD]):
        print("❌ 環境変数が設定されていません")
        return

    client = Client("ja-JP")
    await login_twitter(client)
    await follow_influencers(client)


if __name__ == "__main__":
    asyncio.run(main())
```

**Step 2: 株式関連ツイート収集スクリプト**

```python
"""
Twitter (X) から株式関連のツイートを収集

Usage:
    TWITTER_USERNAME=xxx TWITTER_EMAIL=xxx TWITTER_PASSWORD=xxx \\
    python scripts/twitter/scrape_stock_tweets.py
"""

import asyncio
import os
import json
from datetime import datetime
from twikit import Client

TWITTER_USERNAME = os.getenv("TWITTER_USERNAME")
TWITTER_EMAIL = os.getenv("TWITTER_EMAIL")
TWITTER_PASSWORD = os.getenv("TWITTER_PASSWORD")


async def login_twitter(client: Client) -> None:
    """Twitterにログイン"""
    try:
        if os.path.exists("twitter_cookies.json"):
            client.load_cookies("twitter_cookies.json")
        else:
            await client.login(
                auth_info_1=TWITTER_USERNAME,
                auth_info_2=TWITTER_EMAIL,
                password=TWITTER_PASSWORD,
            )
            client.save_cookies("twitter_cookies.json")
        print("✅ ログイン成功")
    except Exception as e:
        print(f"❌ ログイン失敗: {e}")
        raise


async def search_stock_tweets(client: Client, query: str, limit: int = 100):
    """株式関連ツイートを検索"""
    print(f"🔍 検索中: {query}")

    try:
        tweets = await client.search_tweet(query, "Latest", count=limit)

        results = []
        for tweet in tweets:
            results.append({
                "id": tweet.id,
                "text": tweet.text,
                "user": tweet.user.screen_name,
                "created_at": tweet.created_at,
                "retweet_count": tweet.retweet_count,
                "favorite_count": tweet.favorite_count,
                "view_count": getattr(tweet, "view_count", 0),
            })

        print(f"✅ {len(results)}件のツイートを取得")
        return results

    except Exception as e:
        print(f"❌ 検索エラー: {e}")
        return []


async def get_following_tweets(client: Client, limit: int = 50):
    """フォロー中のユーザーのツイートを取得"""
    print(f"👥 フォロー中のユーザーのツイートを取得中...")

    try:
        # 自分のユーザー情報取得
        me = await client.user()

        # フォロー中のユーザーリスト取得
        following = await client.get_user_following(me.id, count=100)

        all_tweets = []

        for user in following:
            try:
                print(f"  @{user.screen_name} のツイートを取得中...", end=" ")
                tweets = await user.get_tweets("Tweets", count=limit)

                for tweet in tweets:
                    all_tweets.append({
                        "id": tweet.id,
                        "text": tweet.text,
                        "user": user.screen_name,
                        "created_at": tweet.created_at,
                        "retweet_count": tweet.retweet_count,
                        "favorite_count": tweet.favorite_count,
                        "view_count": getattr(tweet, "view_count", 0),
                    })

                print(f"✅ {len(tweets)}件")
                await asyncio.sleep(1)  # レート制限回避

            except Exception as e:
                print(f"❌ エラー: {e}")
                continue

        print(f"\n✅ 合計 {len(all_tweets)}件のツイートを取得")
        return all_tweets

    except Exception as e:
        print(f("❌ エラー: {e}")
        return []


async def main():
    if not all([TWITTER_USERNAME, TWITTER_EMAIL, TWITTER_PASSWORD]):
        print("❌ 環境変数が設定されていません")
        return

    client = Client("ja-JP")
    await login_twitter(client)

    # 検索クエリ
    queries = [
        "日経平均 OR 日経225",
        "東証 OR 株価",
        "IPO OR 新規上場",
    ]

    all_tweets = []

    # キーワード検索
    for query in queries:
        tweets = await search_stock_tweets(client, query, limit=50)
        all_tweets.extend(tweets)
        await asyncio.sleep(2)

    # フォロー中のユーザーのツイート
    following_tweets = await get_following_tweets(client, limit=10)
    all_tweets.extend(following_tweets)

    # JSON保存
    filename = f"stock_tweets_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(all_tweets, f, ensure_ascii=False, indent=2)

    print(f"\n💾 {filename}に保存しました（合計{len(all_tweets)}件）")


if __name__ == "__main__":
    asyncio.run(main())
```

**Step 3: 銘柄コード抽出スクリプト**

```python
"""
ツイートから銘柄コードを抽出

Usage:
    python scripts/twitter/extract_stock_tickers.py stock_tweets_*.json
"""

import json
import re
import sys
from collections import Counter

# 銘柄コードパターン（4桁数字）
TICKER_PATTERN = re.compile(r'\b(\d{4})\b')


def extract_tickers(tweets):
    """ツイートから銘柄コードを抽出"""
    ticker_mentions = Counter()
    ticker_tweets = {}

    for tweet in tweets:
        text = tweet["text"]

        # 銘柄コード抽出
        tickers = TICKER_PATTERN.findall(text)

        for ticker in tickers:
            ticker_mentions[ticker] += 1

            # 高エンゲージメントツイートを記録
            engagement = tweet["retweet_count"] + tweet["favorite_count"]

            if ticker not in ticker_tweets or engagement > ticker_tweets[ticker]["engagement"]:
                ticker_tweets[ticker] = {
                    "tweet": text[:100],
                    "user": tweet["user"],
                    "engagement": engagement,
                    "retweet_count": tweet["retweet_count"],
                    "favorite_count": tweet["favorite_count"],
                }

    return ticker_mentions, ticker_tweets


def main():
    if len(sys.argv) < 2:
        print("Usage: python extract_stock_tickers.py <json_file>")
        sys.exit(1)

    filename = sys.argv[1]

    with open(filename, "r", encoding="utf-8") as f:
        tweets = json.load(f)

    print(f"📊 {len(tweets)}件のツイートを分析中...\n")

    ticker_mentions, ticker_tweets = extract_tickers(tweets)

    print("🔥 注目銘柄TOP 20:")
    print("-" * 60)

    for ticker, count in ticker_mentions.most_common(20):
        tweet_info = ticker_tweets[ticker]
        print(f"{ticker}: {count}件の言及")
        print(f"  👤 @{tweet_info['user']}")
        print(f"  💬 {tweet_info['tweet']}...")
        print(f("  ❤️  {tweet_info['favorite_count']} | 🔁 {tweet_info['retweet_count']}")
        print()

    # 結果をJSON保存
    output = {
        "ticker_mentions": dict(ticker_mentions.most_common(50)),
        "ticker_tweets": ticker_tweets
    }

    output_filename = f"featured_tickers_{filename.split('_')[-1]}"
    with open(output_filename, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"💾 {output_filename}に保存しました")


if __name__ == "__main__":
    main()
```

**Step 4: 依存パッケージインストール**

```bash
pip install twikit
```

**Step 5: 環境変数設定**

`.env`に追加:
```
TWITTER_USERNAME=your_username
TWITTER_EMAIL=your_email@example.com
TWITTER_PASSWORD=your_password
```

**Step 6: スクリプト実行テスト**

```bash
# 自動フォロー実行
TWITTER_USERNAME=xxx TWITTER_EMAIL=xxx TWITTER_PASSWORD=xxx \\
python scripts/twitter/auto_follow_influencers.py

# ツイート収集実行
TWITTER_USERNAME=xxx TWITTER_EMAIL=xxx TWITTER_PASSWORD=xxx \\
python scripts/twitter/scrape_stock_tweets.py

# 銘柄コード抽出
python scripts/twitter/extract_stock_tickers.py stock_tweets_*.json
```

Expected: JSONファイル生成、注目銘柄TOP20表示

**Step 7: コミット**

```bash
git add scripts/twitter/
git commit -m "feat: add Twitter scraping scripts for featured stocks discovery"
```

---

### Task 2.2: 注目銘柄の自動生成API

**Files:**
- Create: `app/api/featured-stocks/generate-from-twitter/route.ts`

**Step 1: Twitter連携注目銘柄生成API作成**

```typescript
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import OpenAI from "openai"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// CRON_SECRET認証
function verifyCronSecret(request: Request): boolean {
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  return authHeader === `Bearer ${cronSecret}`
}

interface TickerData {
  ticker: string
  mentions: number
  topTweet: {
    text: string
    user: string
    engagement: number
  }
}

async function categorizeStock(
  ticker: string,
  data: TickerData
): Promise<{ category: string; reason: string; score: number }> {
  const prompt = `
あなたは投資アナリストです。以下のTwitter (X) データを分析し、この銘柄を分類してください。

銘柄コード: ${ticker}
言及回数: ${data.mentions}
代表的なツイート: "${data.topTweet.text}"
エンゲージメント: ${data.topTweet.engagement}

以下のカテゴリに分類してください:
- surge: 急騰銘柄（短期で大きく上昇する可能性）
- stable: 安定銘柄（長期保有向け、配当株など）
- trending: 今日の話題（注目度が高いが方向性不明）

JSON形式で回答してください:
{
  "category": "surge" | "stable" | "trending",
  "reason": "分類理由（100文字以内）",
  "score": 0-100の数値
}
`

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    })

    const result = JSON.parse(response.choices[0].message.content || "{}")
    return {
      category: result.category || "trending",
      reason: result.reason || "Twitterで話題",
      score: result.score || 50,
    }
  } catch (error) {
    console.error("AI分析エラー:", error)
    return {
      category: "trending",
      reason: `Xで${data.mentions}件の言及`,
      score: Math.min(data.mentions * 5, 100),
    }
  }
}

export async function POST(request: Request) {
  // CRON認証
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { tickers } = body // { "7203": { mentions: 15, topTweet: {...} }, ... }

    if (!tickers || typeof tickers !== "object") {
      return NextResponse.json(
        { error: "Invalid tickers data" },
        { status: 400 }
      )
    }

    const results = []

    // 上位20銘柄を処理
    const topTickers = Object.entries(tickers)
      .sort(([, a]: any, [, b]: any) => b.mentions - a.mentions)
      .slice(0, 20)

    for (const [ticker, data] of topTickers) {
      try {
        // 銘柄マスタから検索（.T付きで検索）
        const stock = await prisma.stock.findUnique({
          where: { tickerCode: `${ticker}.T` },
        })

        if (!stock) {
          console.log(`銘柄コード ${ticker} が見つかりません`)
          continue
        }

        // AI分析
        const analysis = await categorizeStock(ticker, data as TickerData)

        // FeaturedStockに保存
        const featuredStock = await prisma.featuredStock.create({
          data: {
            stockId: stock.id,
            category: analysis.category,
            reason: analysis.reason,
            score: analysis.score,
            source: "twitter",
          },
        })

        results.push({
          ticker,
          name: stock.name,
          category: analysis.category,
          score: analysis.score,
        })
      } catch (error) {
        console.error(`銘柄 ${ticker} の処理エラー:`, error)
      }
    }

    return NextResponse.json({
      success: true,
      count: results.length,
      featured: results,
    })
  } catch (error) {
    console.error("注目銘柄生成エラー:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
```

**Step 2: API動作確認**

```bash
# テストデータで実行
curl -X POST http://localhost:3000/api/featured-stocks/generate-from-twitter \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  -H "Content-Type: application/json" \
  -d '{
    "tickers": {
      "7203": {
        "mentions": 25,
        "topTweet": {
          "text": "トヨタが過去最高益を更新！",
          "user": "stock_news",
          "engagement": 500
        }
      }
    }
  }'
```

Expected: FeaturedStockテーブルにデータ保存

**Step 3: コミット**

```bash
git add app/api/featured-stocks/generate-from-twitter/
git commit -m "feat: add Twitter-based featured stocks generation API"
```

---

### Task 2.3: GitHub Actions自動実行ワークフロー

**Files:**
- Create: `.github/workflows/twitter-featured-stocks.yml`
- Create: `scripts/github-actions/generate_featured_stocks_from_twitter.py`

**Step 1: GitHub Actionsワークフロー作成**

```yaml
name: Twitter連携 - 注目銘柄生成

on:
  schedule:
    - cron: "0 0 * * *" # 毎日午前9時（JST）
  workflow_dispatch:

jobs:
  generate-featured-stocks:
    runs-on: ubuntu-latest
    timeout-minutes: 30

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.11"

      - name: Install dependencies
        run: |
          pip install twikit requests

      - name: Scrape Twitter and generate featured stocks
        env:
          TWITTER_USERNAME: ${{ secrets.TWITTER_USERNAME }}
          TWITTER_EMAIL: ${{ secrets.TWITTER_EMAIL }}
          TWITTER_PASSWORD: ${{ secrets.TWITTER_PASSWORD }}
          APP_URL: ${{ secrets.APP_URL }}
          CRON_SECRET: ${{ secrets.CRON_SECRET }}
        run: |
          python scripts/github-actions/generate_featured_stocks_from_twitter.py

      - name: Send push notification
        if: success()
        env:
          APP_URL: ${{ secrets.APP_URL }}
          CRON_SECRET: ${{ secrets.CRON_SECRET }}
        run: |
          python scripts/github-actions/send_push_notification.py "注目銘柄を更新しました" "Twitterで話題の銘柄をチェックしましょう！"
```

**Step 2: 統合スクリプト作成**

```python
"""
Twitter連携で注目銘柄を生成

Usage:
    TWITTER_USERNAME=xxx TWITTER_EMAIL=xxx TWITTER_PASSWORD=xxx \\
    APP_URL=xxx CRON_SECRET=xxx \\
    python scripts/github-actions/generate_featured_stocks_from_twitter.py
"""

import asyncio
import os
import json
import requests
import sys

# Twitter認証情報
TWITTER_USERNAME = os.getenv("TWITTER_USERNAME")
TWITTER_EMAIL = os.getenv("TWITTER_EMAIL")
TWITTER_PASSWORD = os.getenv("TWITTER_PASSWORD")

# API設定
APP_URL = os.getenv("APP_URL")
CRON_SECRET = os.getenv("CRON_SECRET")


async def collect_tweets():
    """Twitterからツイートを収集"""
    from twikit import Client

    print("🔐 Twitterにログイン中...")
    client = Client("ja-JP")

    try:
        await client.login(
            auth_info_1=TWITTER_USERNAME,
            auth_info_2=TWITTER_EMAIL,
            password=TWITTER_PASSWORD,
        )
    except Exception as e:
        print(f"❌ ログイン失敗: {e}")
        sys.exit(1)

    print("🔍 株式関連ツイートを収集中...")

    queries = [
        "日経平均 OR 日経225",
        "東証 OR 株価",
        "IPO OR 新規上場",
    ]

    all_tweets = []

    for query in queries:
        try:
            tweets = await client.search_tweet(query, "Latest", count=50)

            for tweet in tweets:
                all_tweets.append({
                    "text": tweet.text,
                    "user": tweet.user.screen_name,
                    "retweet_count": tweet.retweet_count,
                    "favorite_count": tweet.favorite_count,
                })

            await asyncio.sleep(2)
        except Exception as e:
            print(f"❌ 検索エラー ({query}): {e}")

    print(f"✅ {len(all_tweets)}件のツイートを取得")
    return all_tweets


def extract_tickers(tweets):
    """ツイートから銘柄コードを抽出"""
    import re
    from collections import defaultdict

    print("📊 銘柄コードを抽出中...")

    ticker_pattern = re.compile(r'\b(\d{4})\b')
    ticker_data = defaultdict(lambda: {"mentions": 0, "topTweet": None})

    for tweet in tweets:
        tickers = ticker_pattern.findall(tweet["text"])
        engagement = tweet["retweet_count"] + tweet["favorite_count"]

        for ticker in tickers:
            ticker_data[ticker]["mentions"] += 1

            if (ticker_data[ticker]["topTweet"] is None or
                engagement > ticker_data[ticker]["topTweet"]["engagement"]):
                ticker_data[ticker]["topTweet"] = {
                    "text": tweet["text"][:100],
                    "user": tweet["user"],
                    "engagement": engagement,
                }

    print(f"✅ {len(ticker_data)}銘柄を検出")
    return dict(ticker_data)


def generate_featured_stocks(ticker_data):
    """APIを呼び出して注目銘柄を生成"""
    print("🚀 注目銘柄を生成中...")

    url = f"{APP_URL}/api/featured-stocks/generate-from-twitter"
    headers = {
        "Authorization": f"Bearer {CRON_SECRET}",
        "Content-Type": "application/json",
    }
    payload = {"tickers": ticker_data}

    try:
        response = requests.post(url, json=payload, headers=headers, timeout=180)
        response.raise_for_status()

        result = response.json()
        print(f"✅ {result['count']}銘柄を注目銘柄に追加しました")

        for stock in result["featured"]:
            print(f"  - {stock['ticker']} {stock['name']}: {stock['category']}")

        return result

    except Exception as e:
        print(f"❌ API呼び出しエラー: {e}")
        sys.exit(1)


async def main():
    if not all([TWITTER_USERNAME, TWITTER_EMAIL, TWITTER_PASSWORD, APP_URL, CRON_SECRET]):
        print("❌ 環境変数が設定されていません")
        sys.exit(1)

    # ツイート収集
    tweets = await collect_tweets()

    # 銘柄コード抽出
    ticker_data = extract_tickers(tweets)

    # 注目銘柄生成
    result = generate_featured_stocks(ticker_data)

    print("\n✅ 完了")


if __name__ == "__main__":
    asyncio.run(main())
```

**Step 3: GitHub Secretsに認証情報追加**

```bash
gh secret set TWITTER_USERNAME --body "your_username"
gh secret set TWITTER_EMAIL --body "your_email@example.com"
gh secret set TWITTER_PASSWORD --body "your_password"
```

**Step 4: ワークフロー手動実行テスト**

```bash
gh workflow run twitter-featured-stocks.yml
```

**Step 5: 実行ログ確認**

```bash
gh run list --workflow=twitter-featured-stocks.yml
gh run view <run_id> --log
```

Expected: 注目銘柄生成成功

**Step 6: コミット**

```bash
git add .github/workflows/twitter-featured-stocks.yml scripts/github-actions/generate_featured_stocks_from_twitter.py
git commit -m "feat: add GitHub Actions workflow for Twitter-based featured stocks"
```

---

## フェーズ3: UI/UX刷新

### Task 3.1: UserStock API作成

**Files:**
- Create: `app/api/user-stocks/route.ts`
- Create: `app/api/user-stocks/add/route.ts`
- Create: `app/api/user-stocks/remove/route.ts`
- Create: `app/api/user-stocks/update/route.ts`

**Step 1: UserStock一覧取得API**

```typescript
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 })
  }

  try {
    const userStocks = await prisma.userStock.findMany({
      where: {
        userId: session.user.id,
      },
      include: {
        stock: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    })

    // 保有中とウォッチ中に分類
    const holding = userStocks.filter((us) => us.quantity !== null)
    const watching = userStocks.filter((us) => us.quantity === null)

    return NextResponse.json({
      holding,
      watching,
      total: userStocks.length,
    })
  } catch (error) {
    console.error("UserStock取得エラー:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
```

**Step 2: UserStock追加API**

```typescript
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

export async function POST(request: NextRequest) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { stockId, quantity, averagePrice, purchaseDate } = body

    if (!stockId) {
      return NextResponse.json(
        { error: "銘柄IDが必要です" },
        { status: 400 }
      )
    }

    // 既存チェック
    const existing = await prisma.userStock.findUnique({
      where: {
        userId_stockId: {
          userId: session.user.id,
          stockId,
        },
      },
    })

    if (existing) {
      return NextResponse.json(
        { error: "既に登録されています" },
        { status: 409 }
      )
    }

    // 5銘柄制限チェック
    const count = await prisma.userStock.count({
      where: { userId: session.user.id },
    })

    if (count >= 5) {
      return NextResponse.json(
        { error: "登録できる銘柄は5つまでです" },
        { status: 400 }
      )
    }

    const userStock = await prisma.userStock.create({
      data: {
        userId: session.user.id,
        stockId,
        quantity: quantity || null,
        averagePrice: averagePrice || null,
        purchaseDate: purchaseDate ? new Date(purchaseDate) : null,
      },
      include: {
        stock: true,
      },
    })

    return NextResponse.json({ success: true, userStock }, { status: 201 })
  } catch (error) {
    console.error("UserStock追加エラー:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
```

**Step 3: UserStock更新API**

```typescript
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

export async function PUT(request: NextRequest) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { id, quantity, averagePrice, purchaseDate } = body

    if (!id) {
      return NextResponse.json({ error: "IDが必要です" }, { status: 400 })
    }

    // 所有権確認
    const userStock = await prisma.userStock.findUnique({
      where: { id },
    })

    if (!userStock || userStock.userId !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const updated = await prisma.userStock.update({
      where: { id },
      data: {
        quantity: quantity !== undefined ? quantity : userStock.quantity,
        averagePrice:
          averagePrice !== undefined ? averagePrice : userStock.averagePrice,
        purchaseDate: purchaseDate
          ? new Date(purchaseDate)
          : userStock.purchaseDate,
      },
      include: {
        stock: true,
      },
    })

    return NextResponse.json({ success: true, userStock: updated })
  } catch (error) {
    console.error("UserStock更新エラー:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
```

**Step 4: UserStock削除API**

```typescript
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

export async function DELETE(request: NextRequest) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json({ error: "IDが必要です" }, { status: 400 })
    }

    // 所有権確認
    const userStock = await prisma.userStock.findUnique({
      where: { id },
    })

    if (!userStock || userStock.userId !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    await prisma.userStock.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("UserStock削除エラー:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
```

**Step 5: API動作確認**

```bash
# 一覧取得
curl http://localhost:3000/api/user-stocks -H "Cookie: authjs.session-token=..."

# 追加（ウォッチ）
curl -X POST http://localhost:3000/api/user-stocks/add \
  -H "Cookie: authjs.session-token=..." \
  -H "Content-Type: application/json" \
  -d '{"stockId": "xxx"}'

# 追加（保有）
curl -X POST http://localhost:3000/api/user-stocks/add \
  -H "Cookie: authjs.session-token=..." \
  -H "Content-Type: application/json" \
  -d '{"stockId": "xxx", "quantity": 100, "averagePrice": 2500}'
```

Expected: API正常動作

**Step 6: コミット**

```bash
git add app/api/user-stocks/
git commit -m "feat: add UserStock CRUD APIs"
```

---

### Task 3.2: マイ銘柄UI（統合ページ）

**Files:**
- Create: `app/dashboard/my-stocks/page.tsx`
- Create: `app/dashboard/my-stocks/MyStocksClient.tsx`
- Create: `app/dashboard/my-stocks/AddStockModal.tsx`

**Step 1: マイ銘柄ページ作成**

```typescript
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import MyStocksClient from "./MyStocksClient"

export default async function MyStocksPage() {
  const session = await auth()

  if (!session?.user) {
    redirect("/login")
  }

  return <MyStocksClient />
}
```

**Step 2: マイ銘柄クライアントコンポーネント**

```typescript
"use client"

import { useState, useEffect } from "react"

interface UserStock {
  id: string
  stockId: string
  quantity: number | null
  averagePrice: number | null
  purchaseDate: string | null
  stock: {
    tickerCode: string
    name: string
  }
  shortTerm: string | null
  mediumTerm: string | null
  longTerm: string | null
}

export default function MyStocksClient() {
  const [holding, setHolding] = useState<UserStock[]>([])
  const [watching, setWatching] = useState<UserStock[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchUserStocks()
  }, [])

  async function fetchUserStocks() {
    try {
      const res = await fetch("/api/user-stocks")
      const data = await res.json()
      setHolding(data.holding || [])
      setWatching(data.watching || [])
    } catch (error) {
      console.error("取得エラー:", error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="p-8">読み込み中...</div>
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">マイ銘柄</h1>
        <button
          onClick={() => {
            /* モーダル表示 */
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          + 銘柄を追加
        </button>
      </div>

      {/* 保有中セクション */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4 flex items-center">
          <span className="mr-2">📊</span>
          保有中（{holding.length}銘柄）
        </h2>

        {holding.length === 0 ? (
          <div className="text-gray-500 text-center py-8">
            保有銘柄はありません
          </div>
        ) : (
          <div className="space-y-4">
            {holding.map((stock) => (
              <div
                key={stock.id}
                className="bg-white rounded-lg shadow p-4 border"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-lg">
                      {stock.stock.name} ({stock.stock.tickerCode})
                    </h3>
                    <div className="text-sm text-gray-600 mt-1">
                      保有数: {stock.quantity}株 | 平均単価: ¥
                      {stock.averagePrice?.toLocaleString()}
                    </div>
                  </div>
                  <button className="text-red-600 hover:text-red-800">
                    削除
                  </button>
                </div>

                {/* AI分析結果 */}
                {stock.shortTerm && (
                  <div className="mt-3 text-sm">
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        📈 短期: <span className="font-medium">{stock.shortTerm}</span>
                      </div>
                      <div>
                        📊 中期: <span className="font-medium">{stock.mediumTerm}</span>
                      </div>
                      <div>
                        📉 長期: <span className="font-medium">{stock.longTerm}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ウォッチ中セクション */}
      <section>
        <h2 className="text-xl font-semibold mb-4 flex items-center">
          <span className="mr-2">👀</span>
          ウォッチ中（{watching.length}銘柄）
        </h2>

        {watching.length === 0 ? (
          <div className="text-gray-500 text-center py-8">
            ウォッチ中の銘柄はありません
          </div>
        ) : (
          <div className="space-y-4">
            {watching.map((stock) => (
              <div
                key={stock.id}
                className="bg-white rounded-lg shadow p-4 border"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-lg">
                      {stock.stock.name} ({stock.stock.tickerCode})
                    </h3>
                  </div>
                  <div className="flex gap-2">
                    <button className="text-blue-600 hover:text-blue-800 text-sm">
                      保有に変更
                    </button>
                    <button className="text-red-600 hover:text-red-800 text-sm">
                      削除
                    </button>
                  </div>
                </div>

                {/* AI分析結果 */}
                {stock.shortTerm && (
                  <div className="mt-3 text-sm">
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        📈 短期: {stock.shortTerm}
                      </div>
                      <div>
                        📊 中期: {stock.mediumTerm}
                      </div>
                      <div>
                        📉 長期: {stock.longTerm}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
```

**Step 3: 動作確認**

```bash
npm run dev
```

ブラウザで `http://localhost:3000/dashboard/my-stocks` にアクセス

Expected: マイ銘柄ページ表示

**Step 4: コミット**

```bash
git add app/dashboard/my-stocks/
git commit -m "feat: add My Stocks unified page (portfolio + watchlist)"
```

---

### Task 3.3: Featured Stocksカテゴリ別表示

**Files:**
- Modify: `app/dashboard/page.tsx`
- Create: `app/dashboard/FeaturedStocksSection.tsx`

**Step 1: Featured Stocks取得API修正**

```typescript
// app/api/featured-stocks/route.ts

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get("category") // "surge" | "stable" | "trending"

    const where = category ? { category } : {}

    const featuredStocks = await prisma.featuredStock.findMany({
      where,
      include: {
        stock: true,
      },
      orderBy: {
        score: "desc",
      },
      take: 10,
    })

    // カテゴリ別にグループ化
    const grouped = {
      surge: featuredStocks.filter((fs) => fs.category === "surge"),
      stable: featuredStocks.filter((fs) => fs.category === "stable"),
      trending: featuredStocks.filter((fs) => fs.category === "trending"),
    }

    return NextResponse.json(category ? featuredStocks : grouped)
  } catch (error) {
    console.error("FeaturedStocks取得エラー:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
```

**Step 2: Featured Stocksセクションコンポーネント**

```typescript
"use client"

import { useState, useEffect } from "react"

interface FeaturedStock {
  id: string
  category: string
  reason: string
  score: number
  stock: {
    tickerCode: string
    name: string
  }
}

interface GroupedStocks {
  surge: FeaturedStock[]
  stable: FeaturedStock[]
  trending: FeaturedStock[]
}

export default function FeaturedStocksSection() {
  const [stocks, setStocks] = useState<GroupedStocks>({
    surge: [],
    stable: [],
    trending: [],
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchFeaturedStocks()
  }, [])

  async function fetchFeaturedStocks() {
    try {
      const res = await fetch("/api/featured-stocks")
      const data = await res.json()
      setStocks(data)
    } catch (error) {
      console.error("取得エラー:", error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div>読み込み中...</div>
  }

  return (
    <div className="space-y-8">
      {/* 急騰銘柄 */}
      <section>
        <h2 className="text-xl font-semibold mb-4 flex items-center">
          <span className="mr-2">🚀</span>
          急騰銘柄（{stocks.surge.length}銘柄）
        </h2>
        {stocks.surge.length === 0 ? (
          <div className="text-gray-500">急騰銘柄はありません</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {stocks.surge.map((stock) => (
              <div
                key={stock.id}
                className="bg-white rounded-lg shadow p-4 border"
              >
                <h3 className="font-semibold">
                  {stock.stock.name} ({stock.stock.tickerCode})
                </h3>
                <p className="text-sm text-gray-600 mt-2">{stock.reason}</p>
                <div className="mt-2 text-xs text-gray-500">
                  スコア: {stock.score}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 安定銘柄 */}
      <section>
        <h2 className="text-xl font-semibold mb-4 flex items-center">
          <span className="mr-2">💎</span>
          安定銘柄（{stocks.stable.length}銘柄）
        </h2>
        {stocks.stable.length === 0 ? (
          <div className="text-gray-500">安定銘柄はありません</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {stocks.stable.map((stock) => (
              <div
                key={stock.id}
                className="bg-white rounded-lg shadow p-4 border"
              >
                <h3 className="font-semibold">
                  {stock.stock.name} ({stock.stock.tickerCode})
                </h3>
                <p className="text-sm text-gray-600 mt-2">{stock.reason}</p>
                <div className="mt-2 text-xs text-gray-500">
                  スコア: {stock.score}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 今日の話題 */}
      <section>
        <h2 className="text-xl font-semibold mb-4 flex items-center">
          <span className="mr-2">📈</span>
          今日の話題（{stocks.trending.length}銘柄）
        </h2>
        {stocks.trending.length === 0 ? (
          <div className="text-gray-500">話題の銘柄はありません</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {stocks.trending.map((stock) => (
              <div
                key={stock.id}
                className="bg-white rounded-lg shadow p-4 border"
              >
                <h3 className="font-semibold">
                  {stock.stock.name} ({stock.stock.tickerCode})
                </h3>
                <p className="text-sm text-gray-600 mt-2">{stock.reason}</p>
                <div className="mt-2 text-xs text-gray-500">
                  スコア: {stock.score}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
```

**Step 3: ダッシュボードレイアウト変更**

```typescript
// app/dashboard/page.tsx

import { auth } from "@/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import FeaturedStocksSection from "./FeaturedStocksSection"

export default async function DashboardPage() {
  const session = await auth()

  if (!session?.user) {
    redirect("/login")
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-8">ダッシュボード</h1>

      {/* マイ銘柄へのリンク */}
      <section className="mb-8">
        <Link
          href="/dashboard/my-stocks"
          className="block bg-blue-600 text-white rounded-lg p-6 hover:bg-blue-700 transition"
        >
          <h2 className="text-2xl font-semibold mb-2">📊 マイ銘柄</h2>
          <p className="text-blue-100">
            保有銘柄とウォッチ中の銘柄を確認する
          </p>
        </Link>
      </section>

      {/* 注目銘柄 */}
      <section className="mb-8">
        <h2 className="text-2xl font-bold mb-4">注目銘柄</h2>
        <FeaturedStocksSection />
      </section>

      {/* コーチメッセージ（下部） */}
      <section>
        <h2 className="text-2xl font-bold mb-4">今日のメッセージ</h2>
        <div className="bg-gray-100 rounded-lg p-6">
          <p className="text-gray-700">コーチメッセージがここに表示されます</p>
        </div>
      </section>
    </div>
  )
}
```

**Step 4: 動作確認**

```bash
npm run dev
```

ブラウザで `http://localhost:3000/dashboard` にアクセス

Expected:
- マイ銘柄リンク表示
- Featured Stocksカテゴリ別表示
- コーチメッセージ表示

**Step 5: コミット**

```bash
git add app/dashboard/ app/api/featured-stocks/
git commit -m "feat: redesign dashboard with categorized featured stocks"
```

---

### Task 3.4: 本番環境デプロイ

**Step 1: 本番DBマイグレーション実行**

```bash
# Railway環境変数確認
railway variables

# マイグレーション実行（自動デプロイで実行される）
git push origin main
```

Expected: Railway自動デプロイ、マイグレーション適用

**Step 2: 本番DBデータ移行**

```bash
# 本番DBに接続してデータ移行
DATABASE_URL="postgresql://postgres:xxx@mainline.proxy.rlwy.net:51383/railway" \\
python scripts/migration/migrate_to_user_stock.py
```

Expected: UserStockテーブルにデータ移行完了

**Step 3: JPX銘柄マスタ更新**

```bash
# JPXスクレイピング実行
python scripts/jpx/scrape_stocks.py

# 本番DBに反映
DATABASE_URL="postgresql://postgres:xxx@mainline.proxy.rlwy.net:51383/railway" \\
python scripts/jpx/update_stock_master.py
```

Expected: 本番Stockテーブル更新

**Step 4: Twitter連携ワークフロー有効化**

```bash
# GitHub Actionsワークフローのscheduleコメント解除
# .github/workflows/twitter-featured-stocks.yml
```

**Step 5: 動作確認**

ブラウザで本番環境にアクセス:
- `https://stock-buddy.net/dashboard`
- `https://stock-buddy.net/dashboard/my-stocks`

Expected: 全機能正常動作

**Step 6: 最終コミット**

```bash
git add .github/workflows/twitter-featured-stocks.yml
git commit -m "feat: enable Twitter featured stocks workflow in production"
git push origin main
```

---

## 完了チェックリスト

### フェーズ1: データ基盤
- [ ] FeaturedStock, UserStockモデル追加
- [ ] マイグレーション実行
- [ ] JPXスクレイピングスクリプト作成
- [ ] データ移行スクリプト作成・実行

### フェーズ2: Twitter連携
- [ ] 自動フォロースクリプト作成
- [ ] ツイート収集スクリプト作成
- [ ] 銘柄コード抽出スクリプト作成
- [ ] 注目銘柄生成API作成
- [ ] GitHub Actionsワークフロー作成

### フェーズ3: UI/UX刷新
- [ ] UserStock CRUD API作成
- [ ] マイ銘柄ページ作成（統合UI）
- [ ] Featured Stocksカテゴリ別表示
- [ ] ダッシュボードレイアウト変更

### 本番環境
- [ ] 本番DBマイグレーション
- [ ] 本番DBデータ移行
- [ ] JPX銘柄マスタ更新
- [ ] Twitter連携ワークフロー有効化
- [ ] 動作確認

---

## 期待される効果

1. **AI料金85%削減**: 3,000円/日 → 520円/日
2. **データ量削減**: 2年分の株価データ不要
3. **リアルタイム性向上**: yfinance APIで最新データ
4. **IPO対応**: JPXスクレイピングで新規上場銘柄も自動取得
5. **シンプル化**: ポートフォリオ/ウォッチリスト統合でUI簡素化
6. **注目銘柄自動発見**: Twitter連携で話題の銘柄を毎日更新
