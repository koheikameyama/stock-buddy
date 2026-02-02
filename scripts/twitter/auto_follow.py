#!/usr/bin/env python3
"""
Twitter Auto-Follow Script
投資インフルエンサーを自動でフォローするスクリプト

Features:
- Predefined influencer list (50-100 accounts)
- Search-based discovery (high engagement tweets)
- Rate limiting (50 follows/day to avoid suspension)
- Cookie persistence for authentication
- Detailed logging
"""

import os
import sys
import json
import asyncio
import time
from datetime import datetime
from typing import List, Dict, Any, Optional
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
FOLLOWS_LOG_FILE = SCRIPT_DIR / "twitter_follows.json"
MAX_FOLLOWS_PER_DAY = 50
FOLLOW_DELAY_SECONDS = 120  # 2 minutes between follows (rate limit safety)
SEARCH_DELAY_SECONDS = 60   # 1 minute between searches

# Predefined influencer list (投資インフルエンサー)
INFLUENCERS = [
    "hirosetakao",      # じっちゃま（米国株）
    "kabukyodai",       # 株教材（日本株）
    "fisco_jp",         # フィスコ（金融情報）
    "traders_web",      # トレーダーズ・ウェブ
    "nikkei",           # 日本経済新聞
    "tokyoIPO",         # 東京IPO
    "zai_online",       # ダイヤモンドZAi
    "kabutan_jp",       # 株探
    "minkabu_jp",       # みんなの株式
    "yakara_jp",        # やから（株式投資）
    "gentosha_mc",      # 幻冬舎ゴールドオンライン マネー
    "diamond_online",   # ダイヤモンド・オンライン
    "toyo_keizai",      # 東洋経済オンライン
    "Bloomberg_jp",     # ブルームバーグ
    "reuters_co_jp",    # ロイター
]

# Search queries for discovering high engagement accounts
SEARCH_QUERIES = [
    "日経平均",
    "日本株",
    "東証",
    "株式投資",
    "IPO",
    "銘柄",
]


class TwitterAutoFollower:
    """Twitter自動フォロークラス"""

    def __init__(self, dry_run: bool = False):
        """
        初期化

        Args:
            dry_run: True の場合、実際にフォローせずにログのみ出力
        """
        self.client = Client('ja')
        self.dry_run = dry_run
        self.follows_today = 0
        self.followed_accounts: List[Dict[str, Any]] = []
        self.load_follows_log()

    def load_follows_log(self) -> None:
        """フォローログを読み込み"""
        if FOLLOWS_LOG_FILE.exists():
            try:
                with open(FOLLOWS_LOG_FILE, 'r', encoding='utf-8') as f:
                    self.followed_accounts = json.load(f)
                print(f"ℹ️  Loaded {len(self.followed_accounts)} previously followed accounts")
            except Exception as e:
                print(f"⚠️  Warning: Failed to load follows log: {e}")
                self.followed_accounts = []
        else:
            self.followed_accounts = []

    def save_follows_log(self) -> None:
        """フォローログを保存"""
        try:
            with open(FOLLOWS_LOG_FILE, 'w', encoding='utf-8') as f:
                json.dump(self.followed_accounts, f, ensure_ascii=False, indent=2)
            print(f"✅ Saved follows log to {FOLLOWS_LOG_FILE}")
        except Exception as e:
            print(f"❌ Error: Failed to save follows log: {e}")

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

    def is_already_followed(self, user_id: str) -> bool:
        """
        既にフォロー済みかチェック

        Args:
            user_id: ユーザーID

        Returns:
            フォロー済みならTrue
        """
        return any(acc.get("user_id") == user_id for acc in self.followed_accounts)

    async def follow_user(self, user_id: str, username: str, reason: str) -> bool:
        """
        ユーザーをフォロー

        Args:
            user_id: ユーザーID
            username: ユーザー名
            reason: フォロー理由

        Returns:
            成功したらTrue
        """
        if self.follows_today >= MAX_FOLLOWS_PER_DAY:
            print(f"⚠️  Reached daily follow limit ({MAX_FOLLOWS_PER_DAY})")
            return False

        if self.is_already_followed(user_id):
            print(f"ℹ️  Already followed: @{username}")
            return False

        if self.dry_run:
            print(f"🔵 [DRY RUN] Would follow: @{username} ({reason})")
        else:
            try:
                await self.client.follow_user(user_id)
                print(f"✅ Followed: @{username} ({reason})")
            except Exception as e:
                print(f"❌ Error: Failed to follow @{username}: {e}")
                return False

        # Log the follow
        follow_record = {
            "user_id": user_id,
            "username": username,
            "reason": reason,
            "followed_at": datetime.now().isoformat()
        }
        self.followed_accounts.append(follow_record)
        self.follows_today += 1

        return True

    async def follow_influencers(self) -> int:
        """
        定義済みインフルエンサーをフォロー

        Returns:
            フォローした人数
        """
        print(f"\n📋 Following predefined influencers ({len(INFLUENCERS)} accounts)...")
        followed_count = 0

        for username in INFLUENCERS:
            if self.follows_today >= MAX_FOLLOWS_PER_DAY:
                break

            try:
                print(f"ℹ️  Looking up: @{username}")
                user = await self.client.get_user_by_screen_name(username)

                if await self.follow_user(
                    user.id,
                    username,
                    "predefined_influencer"
                ):
                    followed_count += 1
                    # Wait to avoid rate limits
                    print(f"⏳ Waiting {FOLLOW_DELAY_SECONDS} seconds...")
                    await asyncio.sleep(FOLLOW_DELAY_SECONDS)

            except Exception as e:
                print(f"❌ Error: Failed to process @{username}: {e}")
                continue

        return followed_count

    async def follow_from_search(self) -> int:
        """
        検索結果から高エンゲージメントのアカウントをフォロー

        Returns:
            フォローした人数
        """
        print(f"\n🔍 Searching for high engagement accounts...")
        followed_count = 0

        for query in SEARCH_QUERIES:
            if self.follows_today >= MAX_FOLLOWS_PER_DAY:
                break

            try:
                print(f"ℹ️  Searching: {query}")
                tweets = await self.client.search_tweet(
                    query,
                    product='Latest',
                    count=50
                )

                for tweet in tweets:
                    if self.follows_today >= MAX_FOLLOWS_PER_DAY:
                        break

                    # Check engagement thresholds
                    if (tweet.retweet_count > 100 and
                        tweet.favorite_count > 500):

                        username = tweet.user.screen_name
                        user_id = tweet.user.id

                        print(f"ℹ️  Found high engagement: @{username} "
                              f"(RT: {tweet.retweet_count}, Likes: {tweet.favorite_count})")

                        if await self.follow_user(
                            user_id,
                            username,
                            f"high_engagement_search:{query}"
                        ):
                            followed_count += 1
                            # Wait to avoid rate limits
                            print(f"⏳ Waiting {FOLLOW_DELAY_SECONDS} seconds...")
                            await asyncio.sleep(FOLLOW_DELAY_SECONDS)

                # Wait between searches
                print(f"⏳ Waiting {SEARCH_DELAY_SECONDS} seconds before next search...")
                await asyncio.sleep(SEARCH_DELAY_SECONDS)

            except Exception as e:
                print(f"❌ Error: Search failed for '{query}': {e}")
                continue

        return followed_count

    async def run(self) -> None:
        """メイン処理"""
        print("=" * 60)
        print("Twitter Auto-Follow Script")
        print("=" * 60)
        print(f"Mode: {'DRY RUN' if self.dry_run else 'LIVE'}")
        print(f"Max follows per day: {MAX_FOLLOWS_PER_DAY}")
        print(f"Follow delay: {FOLLOW_DELAY_SECONDS} seconds")
        print("=" * 60)

        # Login
        await self.login()

        # Follow influencers
        influencer_count = await self.follow_influencers()

        # Follow from search
        search_count = await self.follow_from_search()

        # Save results
        self.save_follows_log()

        # Summary
        print("\n" + "=" * 60)
        print("Summary")
        print("=" * 60)
        print(f"✅ Followed from influencer list: {influencer_count}")
        print(f"✅ Followed from search: {search_count}")
        print(f"✅ Total followed today: {self.follows_today}")
        print(f"✅ Total accounts followed: {len(self.followed_accounts)}")
        print("=" * 60)


async def main():
    """エントリーポイント"""
    # Check for dry-run mode
    dry_run = "--dry-run" in sys.argv or os.environ.get("DRY_RUN", "").lower() == "true"

    follower = TwitterAutoFollower(dry_run=dry_run)

    try:
        await follower.run()
    except KeyboardInterrupt:
        print("\n⚠️  Interrupted by user")
        follower.save_follows_log()
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ Error: {e}")
        follower.save_follows_log()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
