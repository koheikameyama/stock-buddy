#!/usr/bin/env python3
"""
Twitter Tweet Collection Script
フォローしているアカウントのツイートを収集し、銘柄コードを抽出するスクリプト

Features:
- Collect tweets from followed accounts
- Collect tweets from search results
- Extract Japanese stock ticker codes (4-digit pattern)
- Deduplication by tweet ID
- Date range filtering (last 24 hours)
- Detailed logging
"""

import os
import sys
import json
import asyncio
import re
from datetime import datetime, timedelta
from typing import List, Dict, Any, Set
from pathlib import Path

try:
    from twikit import Client
except ImportError:
    print("❌ Error: twikit is not installed")
    print("Please run: pip install twikit")
    sys.exit(1)


# Constants
SCRIPT_DIR = Path(__file__).parent
COOKIES_FILE = SCRIPT_DIR / "cookies.json"
TWEETS_OUTPUT_FILE = SCRIPT_DIR / "twitter_tweets.json"
FOLLOWS_LOG_FILE = SCRIPT_DIR / "twitter_follows.json"

# Ticker pattern: Japanese stocks are 4-digit codes
TICKER_PATTERN = re.compile(r'\b(\d{4})\b')

# Search queries for discovering market sentiment
SEARCH_QUERIES = [
    "日経平均",
    "日本株",
    "東証",
    "株式投資",
    "銘柄",
]


class TwitterTweetCollector:
    """Twitterツイート収集クラス"""

    def __init__(self, hours_back: int = 24, max_tweets: int = 1000):
        """
        初期化

        Args:
            hours_back: 何時間前までのツイートを収集するか
            max_tweets: 最大収集ツイート数
        """
        self.client = Client('ja')
        self.hours_back = hours_back
        self.max_tweets = max_tweets
        self.cutoff_time = datetime.now() - timedelta(hours=hours_back)
        self.collected_tweets: List[Dict[str, Any]] = []
        self.seen_tweet_ids: Set[str] = set()
        self.ticker_mentions: Dict[str, int] = {}

    async def login(self) -> None:
        """Twitter にログイン"""
        # Check for existing cookies
        if COOKIES_FILE.exists():
            try:
                print("ℹ️  Loading saved cookies...")
                self.client.load_cookies(str(COOKIES_FILE))
                print("✅ Loaded cookies successfully")
                return
            except Exception as e:
                print(f"⚠️  Warning: Failed to load cookies: {e}")
                print("ℹ️  Attempting fresh login...")

        # Fresh login
        username = os.environ.get("TWITTER_USERNAME")
        email = os.environ.get("TWITTER_EMAIL")
        password = os.environ.get("TWITTER_PASSWORD")

        if not all([username, email, password]):
            print("❌ Error: Missing Twitter credentials")
            print("Please set environment variables:")
            print("  - TWITTER_USERNAME")
            print("  - TWITTER_EMAIL")
            print("  - TWITTER_PASSWORD")
            sys.exit(1)

        try:
            print("ℹ️  Logging in to Twitter...")
            await self.client.login(
                auth_info_1=username,
                auth_info_2=email,
                password=password
            )
            print("✅ Logged in successfully")

            # Save cookies for future use
            self.client.save_cookies(str(COOKIES_FILE))
            print(f"✅ Saved cookies to {COOKIES_FILE}")

        except Exception as e:
            print(f"❌ Error: Login failed: {e}")
            sys.exit(1)

    def extract_tickers(self, text: str) -> List[str]:
        """
        テキストから銘柄コードを抽出

        Args:
            text: ツイート本文

        Returns:
            抽出された銘柄コードのリスト（.T suffix付き）
        """
        matches = TICKER_PATTERN.findall(text)
        # Add .T suffix for yfinance compatibility
        tickers = [f"{code}.T" for code in matches]
        return list(set(tickers))  # Remove duplicates

    def is_recent(self, tweet_time: datetime) -> bool:
        """
        ツイートが収集対象の時間範囲内かチェック

        Args:
            tweet_time: ツイート時刻

        Returns:
            範囲内ならTrue
        """
        return tweet_time >= self.cutoff_time

    def add_tweet(self, tweet: Any) -> bool:
        """
        ツイートをコレクションに追加

        Args:
            tweet: ツイートオブジェクト

        Returns:
            追加されたらTrue（重複の場合はFalse）
        """
        tweet_id = tweet.id

        # Check for duplicates
        if tweet_id in self.seen_tweet_ids:
            return False

        # Check if we've reached max tweets
        if len(self.collected_tweets) >= self.max_tweets:
            return False

        # Extract tweet data
        text = tweet.text
        username = tweet.user.screen_name
        created_at = tweet.created_at_datetime

        # Check if recent
        if not self.is_recent(created_at):
            return False

        # Extract tickers
        tickers = self.extract_tickers(text)

        # Build tweet record
        tweet_record = {
            "id": tweet_id,
            "text": text,
            "author": username,
            "author_id": tweet.user.id,
            "created_at": created_at.isoformat(),
            "retweet_count": tweet.retweet_count,
            "favorite_count": tweet.favorite_count,
            "reply_count": tweet.reply_count,
            "tickers": tickers,
        }

        # Add to collection
        self.collected_tweets.append(tweet_record)
        self.seen_tweet_ids.add(tweet_id)

        # Update ticker mentions count
        for ticker in tickers:
            self.ticker_mentions[ticker] = self.ticker_mentions.get(ticker, 0) + 1

        return True

    async def collect_from_timeline(self) -> int:
        """
        タイムラインからツイートを収集

        Returns:
            収集したツイート数
        """
        print("\n📰 Collecting tweets from timeline...")
        collected_count = 0

        try:
            # Get home timeline
            tweets = await self.client.get_timeline(count=100)

            for tweet in tweets:
                if self.add_tweet(tweet):
                    collected_count += 1
                    print(f"✅ Collected: @{tweet.user.screen_name} "
                          f"(RT: {tweet.retweet_count}, Likes: {tweet.favorite_count})")

                if len(self.collected_tweets) >= self.max_tweets:
                    print(f"ℹ️  Reached max tweets limit ({self.max_tweets})")
                    break

        except Exception as e:
            print(f"❌ Error: Failed to collect from timeline: {e}")

        return collected_count

    async def collect_from_follows(self) -> int:
        """
        フォローしているアカウントからツイートを収集

        Returns:
            収集したツイート数
        """
        print("\n👥 Collecting tweets from followed accounts...")

        # Load follows log
        if not FOLLOWS_LOG_FILE.exists():
            print("⚠️  Warning: No follows log found. Run auto_follow.py first.")
            return 0

        try:
            with open(FOLLOWS_LOG_FILE, 'r', encoding='utf-8') as f:
                followed_accounts = json.load(f)
        except Exception as e:
            print(f"❌ Error: Failed to load follows log: {e}")
            return 0

        collected_count = 0

        for account in followed_accounts[:50]:  # Limit to first 50 to avoid rate limits
            if len(self.collected_tweets) >= self.max_tweets:
                break

            username = account.get("username")
            if not username:
                continue

            try:
                print(f"ℹ️  Collecting from: @{username}")
                user_tweets = await self.client.get_user_tweets(
                    username,
                    tweet_type='Tweets',
                    count=20
                )

                for tweet in user_tweets:
                    if self.add_tweet(tweet):
                        collected_count += 1

                # Small delay to avoid rate limits
                await asyncio.sleep(2)

            except Exception as e:
                print(f"❌ Error: Failed to collect from @{username}: {e}")
                continue

        return collected_count

    async def collect_from_search(self) -> int:
        """
        検索結果からツイートを収集

        Returns:
            収集したツイート数
        """
        print("\n🔍 Collecting tweets from search...")
        collected_count = 0

        for query in SEARCH_QUERIES:
            if len(self.collected_tweets) >= self.max_tweets:
                break

            try:
                print(f"ℹ️  Searching: {query}")
                tweets = await self.client.search_tweet(
                    query,
                    product='Latest',
                    count=50
                )

                for tweet in tweets:
                    if self.add_tweet(tweet):
                        collected_count += 1

                    if len(self.collected_tweets) >= self.max_tweets:
                        break

                # Delay between searches
                await asyncio.sleep(3)

            except Exception as e:
                print(f"❌ Error: Search failed for '{query}': {e}")
                continue

        return collected_count

    def save_tweets(self) -> None:
        """収集したツイートをJSONファイルに保存"""
        try:
            output_data = {
                "collected_at": datetime.now().isoformat(),
                "hours_back": self.hours_back,
                "total_tweets": len(self.collected_tweets),
                "unique_tickers": len(self.ticker_mentions),
                "ticker_mentions": self.ticker_mentions,
                "tweets": self.collected_tweets,
            }

            with open(TWEETS_OUTPUT_FILE, 'w', encoding='utf-8') as f:
                json.dump(output_data, f, ensure_ascii=False, indent=2)

            print(f"✅ Saved {len(self.collected_tweets)} tweets to {TWEETS_OUTPUT_FILE}")

        except Exception as e:
            print(f"❌ Error: Failed to save tweets: {e}")

    async def run(self) -> None:
        """メイン処理"""
        print("=" * 60)
        print("Twitter Tweet Collection Script")
        print("=" * 60)
        print(f"Time range: Last {self.hours_back} hours")
        print(f"Max tweets: {self.max_tweets}")
        print(f"Cutoff time: {self.cutoff_time.isoformat()}")
        print("=" * 60)

        # Login
        await self.login()

        # Collect from timeline
        timeline_count = await self.collect_from_timeline()

        # Collect from followed accounts
        follows_count = await self.collect_from_follows()

        # Collect from search
        search_count = await self.collect_from_search()

        # Save results
        self.save_tweets()

        # Summary
        print("\n" + "=" * 60)
        print("Summary")
        print("=" * 60)
        print(f"✅ Collected from timeline: {timeline_count}")
        print(f"✅ Collected from follows: {follows_count}")
        print(f"✅ Collected from search: {search_count}")
        print(f"✅ Total tweets collected: {len(self.collected_tweets)}")
        print(f"✅ Unique tickers mentioned: {len(self.ticker_mentions)}")

        if self.ticker_mentions:
            print("\n📊 Top 10 mentioned tickers:")
            sorted_tickers = sorted(
                self.ticker_mentions.items(),
                key=lambda x: x[1],
                reverse=True
            )[:10]
            for ticker, count in sorted_tickers:
                print(f"  {ticker}: {count} mentions")

        print("=" * 60)


async def main():
    """エントリーポイント"""
    # Parse command line arguments
    hours_back = 24
    max_tweets = 1000

    if "--hours" in sys.argv:
        try:
            idx = sys.argv.index("--hours")
            hours_back = int(sys.argv[idx + 1])
        except (IndexError, ValueError):
            print("⚠️  Warning: Invalid --hours value, using default (24)")

    if "--max" in sys.argv:
        try:
            idx = sys.argv.index("--max")
            max_tweets = int(sys.argv[idx + 1])
        except (IndexError, ValueError):
            print("⚠️  Warning: Invalid --max value, using default (1000)")

    collector = TwitterTweetCollector(hours_back=hours_back, max_tweets=max_tweets)

    try:
        await collector.run()
    except KeyboardInterrupt:
        print("\n⚠️  Interrupted by user")
        collector.save_tweets()
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ Error: {e}")
        collector.save_tweets()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
