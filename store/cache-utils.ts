// store/cache-utils.ts
import { CacheEntry } from "./types"

/**
 * キャッシュが有効かどうかを判定
 */
export function isCacheValid<T>(
  entry: CacheEntry<T> | null,
  ttl: number
): entry is CacheEntry<T> {
  if (!entry) return false
  return Date.now() - entry.fetchedAt < ttl
}

/**
 * キャッシュエントリを作成
 */
export function createCacheEntry<T>(data: T): CacheEntry<T> {
  return {
    data,
    fetchedAt: Date.now(),
  }
}
