"""
日付ユーティリティ（Python版）

全ての日付計算はJST（日本時間）基準で統一する。
@db.Date カラムにはJSTの日付がそのまま保存されるように、
UTC 00:00:00 としてdatetimeを作成する。

例: 2024-06-10 10:00 JST に実行した場合
- get_today_for_db() → 2024-06-10 00:00:00 UTC（PostgreSQL date型で 2024-06-10 として保存）
- get_days_ago_for_db(7) → 2024-06-03 00:00:00 UTC（PostgreSQL date型で 2024-06-03 として保存）
"""

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

JST = ZoneInfo("Asia/Tokyo")


def _jst_date_as_utc(jst_dt: datetime) -> datetime:
    """JSTの日付をそのままUTC 00:00:00のdatetimeとして返す"""
    return datetime(jst_dt.year, jst_dt.month, jst_dt.day, tzinfo=timezone.utc)


def get_today_for_db() -> datetime:
    """
    今日の日付（JST基準）
    DB保存・検索用
    """
    return _jst_date_as_utc(datetime.now(JST))


def get_today_jst_date():
    """
    今日の日付（JSTの日付オブジェクト）
    DB保存用（DATE型カラム向け）
    """
    return datetime.now(JST).date()


def get_days_ago_for_db(days: int) -> datetime:
    """
    N日前の日付（JST基準）
    DB検索用（範囲検索など）
    """
    target_jst = datetime.now(JST) - timedelta(days=days)
    return _jst_date_as_utc(target_jst)


def to_jst_date_for_db(dt: datetime) -> datetime:
    """
    指定日時をJST基準の日付に変換
    """
    jst_dt = dt.astimezone(JST)
    return _jst_date_as_utc(jst_dt)
