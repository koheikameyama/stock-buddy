"""
推薦結果追跡（RecommendationOutcome）ユーティリティ

推薦1件ごとに、推薦時点の状態と時間経過後のリターンを記録する。
精度検証用のデータ基盤。
"""

from datetime import datetime
from decimal import Decimal
from typing import Any


def insert_recommendation_outcome(
    conn,
    outcome_data: dict[str, Any]
) -> str | None:
    """
    RecommendationOutcome レコードを作成する。

    Args:
        conn: psycopg2接続オブジェクト
        outcome_data: 以下のキーを持つ辞書
            - type: "daily" | "purchase" | "analysis"
            - recommendationId: 元の推薦レコードのID
            - stockId: 銘柄ID
            - tickerCode: ティッカーコード
            - sector: セクター（nullable）
            - recommendedAt: 推薦日時
            - priceAtRec: 推薦時点の株価
            - prediction: "buy" | "stay" | "remove" | "up" | "down" | "neutral"
            - confidence: 信頼度 0.0-1.0（nullable）
            - volatility: ボラティリティ（nullable）
            - marketCap: 時価総額（nullable）

    Returns:
        作成されたレコードのID。失敗時はNone。
    """
    try:
        with conn.cursor() as cur:
            cur.execute(
                '''
                INSERT INTO "RecommendationOutcome" (
                    id,
                    type,
                    "recommendationId",
                    "stockId",
                    "tickerCode",
                    sector,
                    "recommendedAt",
                    "priceAtRec",
                    prediction,
                    confidence,
                    volatility,
                    "marketCap",
                    "createdAt",
                    "updatedAt"
                ) VALUES (
                    gen_random_uuid(),
                    %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s, %s,
                    NOW(), NOW()
                )
                ON CONFLICT (type, "recommendationId") DO NOTHING
                RETURNING id
                ''',
                (
                    outcome_data["type"],
                    outcome_data["recommendationId"],
                    outcome_data["stockId"],
                    outcome_data["tickerCode"],
                    outcome_data.get("sector"),
                    outcome_data["recommendedAt"],
                    outcome_data["priceAtRec"],
                    outcome_data["prediction"],
                    outcome_data.get("confidence"),
                    outcome_data.get("volatility"),
                    outcome_data.get("marketCap"),
                )
            )
            result = cur.fetchone()
            conn.commit()

            if result:
                return result[0]
            return None

    except Exception as e:
        print(f"  Warning: Failed to insert RecommendationOutcome: {e}")
        conn.rollback()
        return None
