/**
 * @fileoverview Cache-related type definitions
 * @module src/services/cache/types
 */

export interface CacheConfig {
  /** Directory path for cache storage */
  cacheDir: string;
  /** TTL in milliseconds (default: 24 hours) */
  ttlMs: number;
  /** Maximum number of cache entries to store */
  maxEntries: number;
  /** Enable/disable cache statistics tracking */
  enableStats: boolean;
}

export interface CacheEntry<T = any> {
  /** Cached data */
  data: T;
  /** Timestamp when entry was created */
  timestamp: number;
  /** TTL for this specific entry (overrides global TTL) */
  ttl?: number;
  /** Query that generated this cache entry */
  query: string;
  /** Hash of the parameters used to generate the cache key */
  parametersHash: string;
}

export interface CacheStats {
  /** Total number of cache hits */
  hits: number;
  /** Total number of cache misses */
  misses: number;
  /** Total number of cache entries */
  totalEntries: number;
  /** Cache hit rate as percentage */
  hitRate: number;
  /** Total cache size in bytes (approximate) */
  cacheSizeBytes: number;
  /** Oldest entry timestamp */
  oldestEntry: number | null;
  /** Newest entry timestamp */
  newestEntry: number | null;
  /** Statistics last updated timestamp */
  lastUpdated: number;
}

export interface CacheMetrics {
  /** Cache operation type */
  operation: 'hit' | 'miss' | 'set' | 'delete' | 'clear';
  /** Cache key involved in the operation */
  key: string;
  /** Timestamp of the operation */
  timestamp: number;
  /** Size of data in bytes (for set operations) */
  dataSize?: number;
}