#!/usr/bin/env python3
"""
ニュース取得の共通モジュール

MarketNewsテーブルから関連ニュースを取得する
"""

import psycopg2
import psycopg2.extras
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Dict, Any


def get_related_news(
    conn: psycopg2.extensions.connection,
    ticker_codes: Optional[List[str]] = None,
    sectors: Optional[List[str]] = None,
    limit: int = 10,
    days_ago: int = 7,
) -> List[Dict[str, Any]]:
    """
    関連ニュースを取得する（ハイブリッド検索）

    優先度:
    1. 銘柄コード検索（content LIKE '%7203%'）
    2. セクター検索（sector IN (...)）

    Args:
        conn: データベース接続
        ticker_codes: 銘柄コード配列（例：["7203.T", "6758.T"]）
        sectors: セクター配列（例：["自動車", "IT・サービス"]）
        limit: 取得件数（デフォルト: 10）
        days_ago: 何日前まで（デフォルト: 7）

    Returns:
        ニュース配列
    """
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    try:
        cutoff_date = datetime.now(timezone.utc) - timedelta(days=days_ago)
        news_map = {}  # 重複排除用

        # ステップ1: 銘柄コード検索（一括実行）
        if ticker_codes:
            # .Tサフィックスありとなしの両方を準備
            codes_without_suffix = [code.replace(".T", "") for code in ticker_codes]
            all_codes = codes_without_suffix + ticker_codes

            # LIKE条件を動的に構築
            like_conditions = " OR ".join(["content LIKE %s"] * len(all_codes))
            like_params = [f"%{code}%" for code in all_codes]

            cur.execute(
                f"""
                SELECT
                    id,
                    title,
                    content,
                    url,
                    source,
                    sector,
                    sentiment,
                    "publishedAt"
                FROM "MarketNews"
                WHERE ({like_conditions})
                AND "publishedAt" >= %s
                ORDER BY "publishedAt" DESC
                LIMIT %s
                """,
                like_params + [cutoff_date, limit],
            )

            for row in cur.fetchall():
                if row["id"] not in news_map:
                    news_map[row["id"]] = dict(row)
                    news_map[row["id"]]["match_type"] = "ticker"

        # ステップ2: セクター検索（フォールバック）
        if len(news_map) < limit and sectors:
            remaining_limit = limit - len(news_map)
            existing_ids = list(news_map.keys())

            placeholders = ",".join(["%s"] * len(sectors))

            # クエリをパーツで構築
            query_parts = [
                f"""
                SELECT
                    id,
                    title,
                    content,
                    url,
                    source,
                    sector,
                    sentiment,
                    "publishedAt"
                FROM "MarketNews"
                WHERE sector IN ({placeholders})
                AND "publishedAt" >= %s
                """
            ]

            params = list(sectors) + [cutoff_date]

            if existing_ids:
                id_placeholders = ",".join(["%s"] * len(existing_ids))
                query_parts.append(f"AND id NOT IN ({id_placeholders})")
                params.extend(existing_ids)

            query_parts.append('ORDER BY "publishedAt" DESC')
            query_parts.append("LIMIT %s")
            params.append(remaining_limit)

            query = "\n".join(query_parts)
            cur.execute(query, params)

            for row in cur.fetchall():
                if row["id"] not in news_map:
                    news_map[row["id"]] = dict(row)
                    news_map[row["id"]]["match_type"] = "sector"

        # 日付順にソート
        result = sorted(
            news_map.values(),
            key=lambda x: x["publishedAt"],
            reverse=True,
        )

        return result[:limit]

    except Exception as e:
        print(f"Error fetching related news: {e}")
        # エラー時は空配列を返す（分析は継続可能）
        return []
    finally:
        cur.close()


def format_news_for_prompt(news: List[Dict[str, Any]]) -> str:
    """
    システムプロンプト用にニュース情報をフォーマットする

    Args:
        news: ニュース配列

    Returns:
        フォーマット済みニュース文字列
    """
    if not news:
        return "（最新のニュース情報はありません）"

    lines = []
    for n in news:
        published = n["publishedAt"]
        date_str = published.strftime("%Y-%m-%d") if hasattr(published, "strftime") else str(published)[:10]

        content_preview = n["content"][:200] if len(n["content"]) > 200 else n["content"]

        lines.append(
            f"""- タイトル: {n['title']}
- 日付: {date_str}
- センチメント: {n['sentiment'] or '不明'}
- 内容: {content_preview}{'...' if len(n['content']) > 200 else ''}
- URL: {n['url'] or '(URLなし)'}
"""
        )

    return "\n".join(lines)
