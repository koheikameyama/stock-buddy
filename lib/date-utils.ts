/**
 * 日付ユーティリティ
 *
 * 全ての日付計算はJST（日本時間）基準で統一する。
 * DBにはUTC形式で保存されるが、日付の境界はJST 00:00:00。
 *
 * 例: 2024-06-10 10:00 JST に実行した場合
 * - getTodayForDB() → 2024-06-09 15:00:00 UTC（= JST 2024-06-10 00:00:00）
 * - getDaysAgoForDB(7) → 2024-06-02 15:00:00 UTC（= JST 2024-06-03 00:00:00）
 */

import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"

dayjs.extend(utc)
dayjs.extend(timezone)

const JST = "Asia/Tokyo"

/**
 * 今日の日付（JST 00:00:00をUTCに変換）
 * DB保存・検索用
 */
export function getTodayForDB(): Date {
  return dayjs().tz(JST).startOf("day").utc().toDate()
}

/**
 * N日前の日付（JST 00:00:00をUTCに変換）
 * DB検索用（範囲検索など）
 */
export function getDaysAgoForDB(days: number): Date {
  return dayjs().tz(JST).subtract(days, "day").startOf("day").utc().toDate()
}

/**
 * 指定日時をJST基準の日付（00:00:00）に変換
 */
export function toJSTDateForDB(date: Date | string): Date {
  return dayjs(date).tz(JST).startOf("day").utc().toDate()
}
