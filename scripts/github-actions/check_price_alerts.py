#!/usr/bin/env python3
"""
株価アラートチェックスクリプト

ウォッチリスト・ポートフォリオの銘柄を監視し、
条件達成時に通知を送信する。

通知トリガー:
- 理想買値到達（ウォッチリスト）
- 急騰（+5%以上）
- 急落（-5%以下）
- 指値到達（ポートフォリオ）
- 逆指値到達（ストップロス）
"""

import os
import sys
import logging
from decimal import Decimal
import psycopg2
import requests

# ロギング設定
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# 設定
CONFIG = {
    "SURGE_THRESHOLD": 5.0,   # 急騰しきい値（%）
    "PLUNGE_THRESHOLD": -5.0, # 急落しきい値（%）
}


def get_env_variable(name: str, required: bool = True) -> str | None:
    """環境変数を取得"""
    value = os.environ.get(name)
    if required and not value:
        logger.error(f"Error: {name} environment variable not set")
        sys.exit(1)
    return value


def fetch_watchlist_alerts(conn) -> list[dict]:
    """
    ウォッチリスト銘柄の理想買値アラートをチェック

    条件: 現在価格 <= 理想の買い値 かつ 有効期限内
    """
    alerts = []

    with conn.cursor() as cur:
        cur.execute('''
            SELECT
                w."userId",
                s.id as "stockId",
                s.name as "stockName",
                s."tickerCode",
                s."latestPrice",
                pr."idealEntryPrice",
                pr."idealEntryPriceExpiry",
                w.id as "userStockId"
            FROM "WatchlistStock" w
            JOIN "Stock" s ON w."stockId" = s.id
            LEFT JOIN LATERAL (
                SELECT "idealEntryPrice", "idealEntryPriceExpiry"
                FROM "PurchaseRecommendation"
                WHERE "stockId" = s.id
                ORDER BY date DESC
                LIMIT 1
            ) pr ON true
            WHERE pr."idealEntryPrice" IS NOT NULL
              AND pr."idealEntryPriceExpiry" > NOW()
              AND s."latestPrice" IS NOT NULL
              AND s."latestPrice" <= pr."idealEntryPrice"
        ''')

        for row in cur.fetchall():
            alerts.append({
                "userId": row[0],
                "stockId": row[1],
                "stockName": row[2],
                "tickerCode": row[3],
                "latestPrice": float(row[4]) if row[4] else None,
                "idealEntryPrice": float(row[5]) if row[5] else None,
                "userStockId": row[7],
            })

    return alerts


def fetch_watchlist_surge_plunge_alerts(conn, surge_threshold: float, plunge_threshold: float) -> list[dict]:
    """
    ウォッチリスト銘柄の急騰・急落アラートをチェック

    条件:
    - 急騰: dailyChangeRate >= surge_threshold
    - 急落: dailyChangeRate <= plunge_threshold
    """
    alerts = []

    with conn.cursor() as cur:
        cur.execute('''
            SELECT
                w."userId",
                s.id as "stockId",
                s.name as "stockName",
                s."tickerCode",
                s."latestPrice",
                s."dailyChangeRate",
                w.id as "userStockId"
            FROM "WatchlistStock" w
            JOIN "Stock" s ON w."stockId" = s.id
            WHERE s."dailyChangeRate" IS NOT NULL
              AND (s."dailyChangeRate" >= %s OR s."dailyChangeRate" <= %s)
        ''', (surge_threshold, plunge_threshold))

        for row in cur.fetchall():
            change_rate = float(row[5]) if row[5] else 0
            alert_type = "surge" if change_rate >= surge_threshold else "plunge"

            alerts.append({
                "userId": row[0],
                "stockId": row[1],
                "stockName": row[2],
                "tickerCode": row[3],
                "latestPrice": float(row[4]) if row[4] else None,
                "changeRate": change_rate,
                "type": alert_type,
                "source": "watchlist",
                "userStockId": row[7],
            })

    return alerts


def fetch_portfolio_surge_plunge_alerts(conn, surge_threshold: float, plunge_threshold: float) -> list[dict]:
    """
    ポートフォリオ銘柄の急騰・急落アラートをチェック

    条件:
    - 急騰: dailyChangeRate >= surge_threshold
    - 急落: dailyChangeRate <= plunge_threshold
    - 保有株数 > 0
    """
    alerts = []

    with conn.cursor() as cur:
        cur.execute('''
            SELECT
                p."userId",
                s.id as "stockId",
                s.name as "stockName",
                s."tickerCode",
                s."latestPrice",
                s."dailyChangeRate",
                COALESCE(
                    (SELECT SUM(
                        CASE WHEN t.type = 'buy' THEN t.quantity
                             WHEN t.type = 'sell' THEN -t.quantity
                             ELSE 0
                        END
                    )
                    FROM "Transaction" t
                    WHERE t."portfolioStockId" = p.id
                    ), 0
                ) as "totalQuantity",
                p.id as "userStockId"
            FROM "PortfolioStock" p
            JOIN "Stock" s ON p."stockId" = s.id
            WHERE s."dailyChangeRate" IS NOT NULL
              AND (s."dailyChangeRate" >= %s OR s."dailyChangeRate" <= %s)
        ''', (surge_threshold, plunge_threshold))

        for row in cur.fetchall():
            total_quantity = row[6] or 0
            if total_quantity <= 0:
                continue  # 保有なしはスキップ

            change_rate = float(row[5]) if row[5] else 0
            alert_type = "surge" if change_rate >= surge_threshold else "plunge"

            alerts.append({
                "userId": row[0],
                "stockId": row[1],
                "stockName": row[2],
                "tickerCode": row[3],
                "latestPrice": float(row[4]) if row[4] else None,
                "changeRate": change_rate,
                "type": alert_type,
                "userStockId": row[7],
            })

    return alerts


def fetch_portfolio_sell_target_alerts(conn) -> list[dict]:
    """
    ポートフォリオ銘柄の利確（売り目標）到達アラートをチェック

    優先順位:
    1. ユーザーが targetReturnRate を設定 → 平均取得単価 * (1 + targetReturnRate/100)
    2. 未設定 → AIの suggestedSellPrice を使用

    条件: 現在価格 >= 目標価格 かつ 保有株数 > 0
    """
    alerts = []

    with conn.cursor() as cur:
        cur.execute('''
            SELECT
                p."userId",
                s.id as "stockId",
                s.name as "stockName",
                s."tickerCode",
                s."latestPrice",
                p."suggestedSellPrice",
                us."targetReturnRate",
                COALESCE(
                    (SELECT SUM(
                        CASE WHEN t.type = 'buy' THEN t.quantity
                             WHEN t.type = 'sell' THEN -t.quantity
                             ELSE 0
                        END
                    )
                    FROM "Transaction" t
                    WHERE t."portfolioStockId" = p.id
                    ), 0
                ) as "totalQuantity",
                COALESCE(
                    (SELECT SUM(t.quantity * t.price) / NULLIF(SUM(t.quantity), 0)
                    FROM "Transaction" t
                    WHERE t."portfolioStockId" = p.id AND t.type = 'buy'
                    ), 0
                ) as "averageCost",
                p.id as "userStockId"
            FROM "PortfolioStock" p
            JOIN "Stock" s ON p."stockId" = s.id
            LEFT JOIN "UserSettings" us ON us."userId" = p."userId"
            WHERE s."latestPrice" IS NOT NULL
              AND (us."targetReturnRate" IS NOT NULL OR p."suggestedSellPrice" IS NOT NULL)
        ''')

        for row in cur.fetchall():
            total_quantity = row[7] or 0
            if total_quantity <= 0:
                continue  # 保有なしはスキップ

            latest_price = float(row[4]) if row[4] else 0
            ai_target_price = float(row[5]) if row[5] else None
            user_target_rate = float(row[6]) if row[6] else None
            average_cost = float(row[8]) if row[8] else 0
            user_stock_id = row[9]

            # 目標価格を決定（ユーザー設定優先）
            if user_target_rate is not None and average_cost > 0:
                # ユーザー設定: 平均取得単価 * (1 + targetReturnRate/100)
                target_price = average_cost * (1 + user_target_rate / 100)
                source = "user"
            elif ai_target_price is not None:
                # AI提案
                target_price = ai_target_price
                source = "ai"
            else:
                continue  # 目標価格がない場合はスキップ

            # 現在価格が目標価格以上なら通知
            if latest_price >= target_price:
                gain_percent = ((latest_price - average_cost) / average_cost) * 100 if average_cost > 0 else 0

                alerts.append({
                    "userId": row[0],
                    "stockId": row[1],
                    "stockName": row[2],
                    "tickerCode": row[3],
                    "latestPrice": latest_price,
                    "targetPrice": target_price,
                    "averageCost": average_cost,
                    "gainPercent": gain_percent,
                    "source": source,
                    "type": "sell_target",
                    "userStockId": user_stock_id,
                })

    return alerts


def fetch_portfolio_stop_loss_alerts(conn) -> list[dict]:
    """
    ポートフォリオ銘柄の逆指値（ストップロス）アラートをチェック

    優先順位:
    1. ユーザーが stopLossRate を設定 → 平均取得単価 * (1 + stopLossRate/100)
    2. 未設定 → AIの StockAnalysis.stopLossPrice を使用

    条件: 現在価格 <= 逆指値価格 かつ 保有株数 > 0
    例: 取得単価1000円、stopLossRate=-10% → 逆指値900円
    """
    alerts = []

    with conn.cursor() as cur:
        cur.execute('''
            SELECT
                p."userId",
                s.id as "stockId",
                s.name as "stockName",
                s."tickerCode",
                s."latestPrice",
                us."stopLossRate",
                sa."stopLossPrice" as "aiStopLossPrice",
                COALESCE(
                    (SELECT SUM(
                        CASE WHEN t.type = 'buy' THEN t.quantity
                             WHEN t.type = 'sell' THEN -t.quantity
                             ELSE 0
                        END
                    )
                    FROM "Transaction" t
                    WHERE t."portfolioStockId" = p.id
                    ), 0
                ) as "totalQuantity",
                COALESCE(
                    (SELECT SUM(t.quantity * t.price) / NULLIF(SUM(t.quantity), 0)
                    FROM "Transaction" t
                    WHERE t."portfolioStockId" = p.id AND t.type = 'buy'
                    ), 0
                ) as "averageCost",
                p.id as "userStockId"
            FROM "PortfolioStock" p
            JOIN "Stock" s ON p."stockId" = s.id
            LEFT JOIN "UserSettings" us ON us."userId" = p."userId"
            LEFT JOIN LATERAL (
                SELECT "stopLossPrice"
                FROM "StockAnalysis"
                WHERE "stockId" = s.id
                ORDER BY "analyzedAt" DESC
                LIMIT 1
            ) sa ON true
            WHERE s."latestPrice" IS NOT NULL
              AND (us."stopLossRate" IS NOT NULL OR sa."stopLossPrice" IS NOT NULL)
        ''')

        for row in cur.fetchall():
            total_quantity = row[7] or 0
            if total_quantity <= 0:
                continue  # 保有なしはスキップ

            latest_price = float(row[4]) if row[4] else 0
            user_stop_loss_rate = float(row[5]) if row[5] else None
            ai_stop_loss_price = float(row[6]) if row[6] else None
            average_cost = float(row[8]) if row[8] else 0
            user_stock_id = row[9]

            # 逆指値価格を決定（ユーザー設定優先）
            if user_stop_loss_rate is not None and average_cost > 0:
                # ユーザー設定: 平均取得単価 * (1 + stopLossRate/100)
                stop_loss_price = average_cost * (1 + user_stop_loss_rate / 100)
                source = "user"
            elif ai_stop_loss_price is not None:
                # AI提案
                stop_loss_price = ai_stop_loss_price
                source = "ai"
            else:
                continue  # 逆指値価格がない場合はスキップ

            # 現在価格が逆指値以下なら通知
            if latest_price <= stop_loss_price:
                loss_percent = ((latest_price - average_cost) / average_cost) * 100 if average_cost > 0 else 0

                alerts.append({
                    "userId": row[0],
                    "stockId": row[1],
                    "stockName": row[2],
                    "tickerCode": row[3],
                    "latestPrice": latest_price,
                    "stopLossPrice": stop_loss_price,
                    "averageCost": average_cost,
                    "lossPercent": loss_percent,
                    "source": source,
                    "type": "stop_loss",
                    "userStockId": user_stock_id,
                })

    return alerts


def send_notifications(app_url: str, cron_secret: str, notifications: list[dict]) -> dict:
    """通知APIを呼び出し"""
    if not notifications:
        return {"created": 0, "pushSent": 0, "skipped": 0, "errors": []}

    api_url = f"{app_url}/api/notifications/send"
    headers = {
        "Authorization": f"Bearer {cron_secret}",
        "Content-Type": "application/json"
    }

    try:
        response = requests.post(
            api_url,
            json={"notifications": notifications},
            headers=headers,
            timeout=60
        )

        if not response.ok:
            logger.error(f"API returned {response.status_code}: {response.text}")
            return {"created": 0, "pushSent": 0, "skipped": 0, "errors": [response.text]}

        return response.json()
    except Exception as e:
        logger.error(f"Failed to call notification API: {e}")
        return {"created": 0, "pushSent": 0, "skipped": 0, "errors": [str(e)]}


def main():
    logger.info("=" * 60)
    logger.info("Price Alert Checker")
    logger.info("=" * 60)

    db_url = get_env_variable("DATABASE_URL")
    app_url = get_env_variable("APP_URL")
    cron_secret = get_env_variable("CRON_SECRET")

    conn = psycopg2.connect(db_url)

    try:
        notifications = []

        # 1. ウォッチリスト: 理想買値到達
        logger.info("Checking watchlist ideal entry price alerts...")
        watchlist_alerts = fetch_watchlist_alerts(conn)
        logger.info(f"  Found {len(watchlist_alerts)} watchlist alerts")

        for alert in watchlist_alerts:
            notifications.append({
                "userId": alert["userId"],
                "type": "ideal_entry_price",
                "stockId": alert["stockId"],
                "title": f"💰 {alert['stockName']}が理想の買値に到達",
                "body": f"現在価格 {alert['latestPrice']:,.0f}円 が理想の買値 {alert['idealEntryPrice']:,.0f}円 以下になりました",
                "url": f"/my-stocks/{alert['userStockId']}",
                "triggerPrice": alert["latestPrice"],
                "targetPrice": alert["idealEntryPrice"],
            })

        # 2. ウォッチリスト: 急騰・急落
        logger.info("Checking watchlist surge/plunge alerts...")
        watchlist_surge_plunge_alerts = fetch_watchlist_surge_plunge_alerts(
            conn,
            CONFIG["SURGE_THRESHOLD"],
            CONFIG["PLUNGE_THRESHOLD"]
        )
        logger.info(f"  Found {len(watchlist_surge_plunge_alerts)} watchlist surge/plunge alerts")

        for alert in watchlist_surge_plunge_alerts:
            if alert["type"] == "surge":
                notifications.append({
                    "userId": alert["userId"],
                    "type": "surge",
                    "stockId": alert["stockId"],
                    "title": f"📈 {alert['stockName']}が急騰中（注目銘柄）",
                    "body": f"本日 +{alert['changeRate']:.1f}% 上昇しています（{alert['latestPrice']:,.0f}円）",
                    "url": f"/my-stocks/{alert['userStockId']}",
                    "triggerPrice": alert["latestPrice"],
                    "changeRate": alert["changeRate"],
                })
            elif alert["type"] == "plunge":
                notifications.append({
                    "userId": alert["userId"],
                    "type": "plunge",
                    "stockId": alert["stockId"],
                    "title": f"📉 {alert['stockName']}が急落中（注目銘柄）",
                    "body": f"本日 {alert['changeRate']:.1f}% 下落しています（{alert['latestPrice']:,.0f}円）",
                    "url": f"/my-stocks/{alert['userStockId']}",
                    "triggerPrice": alert["latestPrice"],
                    "changeRate": alert["changeRate"],
                })

        # 3. ポートフォリオ: 急騰・急落
        logger.info("Checking portfolio surge/plunge alerts...")
        surge_plunge_alerts = fetch_portfolio_surge_plunge_alerts(
            conn,
            CONFIG["SURGE_THRESHOLD"],
            CONFIG["PLUNGE_THRESHOLD"]
        )
        logger.info(f"  Found {len(surge_plunge_alerts)} portfolio surge/plunge alerts")

        for alert in surge_plunge_alerts:
            if alert["type"] == "surge":
                notifications.append({
                    "userId": alert["userId"],
                    "type": "surge",
                    "stockId": alert["stockId"],
                    "title": f"📈 {alert['stockName']}が急騰中（保有銘柄）",
                    "body": f"本日 +{alert['changeRate']:.1f}% 上昇しています（{alert['latestPrice']:,.0f}円）",
                    "url": f"/my-stocks/{alert['userStockId']}",
                    "triggerPrice": alert["latestPrice"],
                    "changeRate": alert["changeRate"],
                })
            elif alert["type"] == "plunge":
                notifications.append({
                    "userId": alert["userId"],
                    "type": "plunge",
                    "stockId": alert["stockId"],
                    "title": f"📉 {alert['stockName']}が急落中（保有銘柄）",
                    "body": f"本日 {alert['changeRate']:.1f}% 下落しています（{alert['latestPrice']:,.0f}円）",
                    "url": f"/my-stocks/{alert['userStockId']}",
                    "triggerPrice": alert["latestPrice"],
                    "changeRate": alert["changeRate"],
                })

        # 4. ポートフォリオ: 指値到達
        logger.info("Checking portfolio sell target alerts...")
        sell_target_alerts = fetch_portfolio_sell_target_alerts(conn)
        logger.info(f"  Found {len(sell_target_alerts)} sell target alerts")

        for alert in sell_target_alerts:
            # ユーザー設定 or AI提案で通知メッセージを変える
            if alert.get("source") == "user":
                body = f"現在価格 {alert['latestPrice']:,.0f}円（+{alert['gainPercent']:.1f}%）が目標価格 {alert['targetPrice']:,.0f}円 を超えました"
            else:
                body = f"現在価格 {alert['latestPrice']:,.0f}円 がAI提案売却価格 {alert['targetPrice']:,.0f}円 を超えました"

            notifications.append({
                "userId": alert["userId"],
                "type": "sell_target",
                "stockId": alert["stockId"],
                "title": f"🎯 {alert['stockName']}が目標価格に到達",
                "body": body,
                "url": f"/my-stocks/{alert['userStockId']}",
                "triggerPrice": alert["latestPrice"],
                "targetPrice": alert["targetPrice"],
                "changeRate": alert.get("gainPercent"),
            })

        # 5. ポートフォリオ: 逆指値（ストップロス）到達
        logger.info("Checking portfolio stop loss alerts...")
        stop_loss_alerts = fetch_portfolio_stop_loss_alerts(conn)
        logger.info(f"  Found {len(stop_loss_alerts)} stop loss alerts")

        for alert in stop_loss_alerts:
            # ユーザー設定 or AI提案で通知メッセージを変える
            if alert.get("source") == "user":
                body = f"現在価格 {alert['latestPrice']:,.0f}円（{alert['lossPercent']:.1f}%）が損切りライン {alert['stopLossPrice']:,.0f}円 を下回りました"
            else:
                body = f"現在価格 {alert['latestPrice']:,.0f}円 がAI提案損切りライン {alert['stopLossPrice']:,.0f}円 を下回りました"

            notifications.append({
                "userId": alert["userId"],
                "type": "stop_loss",
                "stockId": alert["stockId"],
                "title": f"⚠️ {alert['stockName']}が逆指値に到達",
                "body": body,
                "url": f"/my-stocks/{alert['userStockId']}",
                "triggerPrice": alert["latestPrice"],
                "targetPrice": alert["stopLossPrice"],
                "changeRate": alert["lossPercent"],
            })

        # 6. 通知送信
        logger.info(f"Total notifications to send: {len(notifications)}")

        if notifications:
            result = send_notifications(app_url, cron_secret, notifications)
            logger.info(f"  Created: {result.get('created', 0)}")
            logger.info(f"  Push sent: {result.get('pushSent', 0)}")
            logger.info(f"  Skipped (duplicate): {result.get('skipped', 0)}")
            if result.get('errors'):
                logger.warning(f"  Errors: {len(result['errors'])}")
        else:
            logger.info("  No alerts to send")

        logger.info("=" * 60)
        logger.info("✅ Price alert check completed")

    except Exception as e:
        logger.error(f"❌ Error: {e}")
        sys.exit(1)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
