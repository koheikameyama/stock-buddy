"""
日付ユーティリティ（Python版）

全ての日付計算はJST（日本時間）基準で統一する。
DBにはUTC形式で保存されるが、日付の境界はJST 00:00:00。

例: 2024-06-10 10:00 JST に実行した場合
- get_today_for_db() → 2024-06-09 15:00:00 UTC（= JST 2024-06-10 00:00:00）
- get_days_ago_for_db(7) → 2024-06-02 15:00:00 UTC（= JST 2024-06-03 00:00:00）
"""

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

JST = ZoneInfo("Asia/Tokyo")


def get_today_for_db() -> datetime:
    """
    今日の日付（JST 00:00:00をUTCに変換）
    DB保存・検索用（DateTime型カラム向け）
    """
    today_jst = datetime.now(JST).replace(hour=0, minute=0, second=0, microsecond=0)
    return today_jst.astimezone(timezone.utc)


def get_today_jst_date():
    """
    今日の日付（JSTの日付オブジェクト）
    DB保存用（DATE型カラム向け）

    DATE型はタイムゾーン情報を持たないため、
    JSTの日付をそのまま渡す必要がある。
    """
    return datetime.now(JST).date()


def get_days_ago_for_db(days: int) -> datetime:
    """
    N日前の日付（JST 00:00:00をUTCに変換）
    DB検索用（範囲検索など）
    """
    today_jst = datetime.now(JST).replace(hour=0, minute=0, second=0, microsecond=0)
    target_jst = today_jst - timedelta(days=days)
    return target_jst.astimezone(timezone.utc)


def to_jst_date_for_db(dt: datetime) -> datetime:
    """
    指定日時をJST基準の日付（00:00:00）に変換
    """
    jst_dt = dt.astimezone(JST).replace(hour=0, minute=0, second=0, microsecond=0)
    return jst_dt.astimezone(timezone.utc)
