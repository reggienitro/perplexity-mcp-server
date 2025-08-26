/**
 * Cache Service for Research Router
 * Implements file-based caching with TTL to reduce API costs
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { logger } from '../../utils/index.js';
import { requestContextService } from '../../utils/internal/requestContext.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface CacheEntry {
  key: string;
  query: string;
  params: Record<string, any>;
  response: any;
  timestamp: number;
  expiresAt: number;
  hits: number;
  modelUsed: string;
  processingTime: number;
}

interface CacheStats {
  totalEntries: number;
  totalHits: number;
  totalMisses: number;
  totalSaved: number;
  oldestEntry: number;
  newestEntry: number;
  estimatedCostSavings: number;
}

export class CacheService {
  private cacheDir: string;
  private statsFile: string;
  private ttlHours: number;
  private stats: CacheStats;

  constructor(ttlHours: number = 24) {
    this.cacheDir = path.join(path.dirname(__dirname), '..', '..', 'cache');
    this.statsFile = path.join(this.cacheDir, 'stats.json');
    this.ttlHours = ttlHours;
    this.stats = {
      totalEntries: 0,
      totalHits: 0,
      totalMisses: 0,
      totalSaved: 0,
      oldestEntry: Date.now(),
      newestEntry: Date.now(),
      estimatedCostSavings: 0
    };
    this.initialize();
  }

  private async initialize() {
    try {
      // Create cache directory if it doesn't exist
      await fs.mkdir(this.cacheDir, { recursive: true });
      
      // Load existing stats if available
      try {
        const statsData = await fs.readFile(this.statsFile, 'utf-8');
        this.stats = JSON.parse(statsData);
      } catch (error) {
        // Stats file doesn't exist yet, use defaults
        await this.saveStats();
      }
      
      const context = requestContextService.createRequestContext({
        cacheDir: this.cacheDir,
        ttlHours: this.ttlHours
      });
      logger.info('Cache service initialized', context);
    } catch (error) {
      const errorContext = requestContextService.createRequestContext({ error });
      logger.error('Failed to initialize cache service', errorContext);
    }
  }

  /**
   * Generate a cache key from query and parameters
   */
  private generateKey(query: string, params: Record<string, any>): string {
    const data = JSON.stringify({ query, params });
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Get cache file path for a key
   */
  private getCacheFilePath(key: string): string {
    return path.join(this.cacheDir, `${key}.json`);
  }

  /**
   * Save stats to file
   */
  private async saveStats(): Promise<void> {
    try {
      await fs.writeFile(this.statsFile, JSON.stringify(this.stats, null, 2));
    } catch (error) {
      const errorContext = requestContextService.createRequestContext({ error });
      logger.error('Failed to save cache stats', errorContext);
    }
  }

  /**
   * Get cached response if available and not expired
   */
  async get(query: string, params: Record<string, any>): Promise<any | null> {
    const key = this.generateKey(query, params);
    const filePath = this.getCacheFilePath(key);

    try {
      const data = await fs.readFile(filePath, 'utf-8');
      const entry: CacheEntry = JSON.parse(data);

      // Check if entry has expired
      if (Date.now() > entry.expiresAt) {
        const context = requestContextService.createRequestContext({ key, query: query.substring(0, 50) });
        logger.info('Cache entry expired', context);
        this.stats.totalMisses++;
        await this.saveStats();
        return null;
      }

      // Update hit count
      entry.hits++;
      await fs.writeFile(filePath, JSON.stringify(entry, null, 2));

      // Update stats
      this.stats.totalHits++;
      this.stats.estimatedCostSavings += 0.013; // Average cost per API call
      await this.saveStats();

      const context = requestContextService.createRequestContext({
        key,
        query: query.substring(0, 50),
        hits: entry.hits,
        savedCost: '$0.013'
      });
      logger.info('Cache hit', context);

      return entry.response;
    } catch (error) {
      // Cache miss
      this.stats.totalMisses++;
      await this.saveStats();
      
      const context = requestContextService.createRequestContext({
        key,
        query: query.substring(0, 50)
      });
      logger.info('Cache miss', context);
      
      return null;
    }
  }

  /**
   * Store response in cache
   */
  async set(
    query: string,
    params: Record<string, any>,
    response: any,
    modelUsed: string,
    processingTime: number
  ): Promise<void> {
    const key = this.generateKey(query, params);
    const filePath = this.getCacheFilePath(key);
    const now = Date.now();

    const entry: CacheEntry = {
      key,
      query,
      params,
      response,
      timestamp: now,
      expiresAt: now + (this.ttlHours * 60 * 60 * 1000),
      hits: 0,
      modelUsed,
      processingTime
    };

    try {
      await fs.writeFile(filePath, JSON.stringify(entry, null, 2));

      // Update stats
      this.stats.totalEntries++;
      this.stats.totalSaved++;
      this.stats.newestEntry = now;
      await this.saveStats();

      const context = requestContextService.createRequestContext({
        key,
        query: query.substring(0, 50),
        expiresIn: `${this.ttlHours} hours`
      });
      logger.info('Response cached', context);
    } catch (error) {
      const errorContext = requestContextService.createRequestContext({ error, key });
      logger.error('Failed to cache response', errorContext);
    }
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    try {
      const files = await fs.readdir(this.cacheDir);
      
      for (const file of files) {
        if (file.endsWith('.json') && file !== 'stats.json') {
          await fs.unlink(path.join(this.cacheDir, file));
        }
      }

      // Reset stats
      this.stats = {
        totalEntries: 0,
        totalHits: 0,
        totalMisses: 0,
        totalSaved: 0,
        oldestEntry: Date.now(),
        newestEntry: Date.now(),
        estimatedCostSavings: 0
      };
      await this.saveStats();

      const context = requestContextService.createRequestContext({});
      logger.info('Cache cleared', context);
    } catch (error) {
      const errorContext = requestContextService.createRequestContext({ error });
      logger.error('Failed to clear cache', errorContext);
    }
  }

  /**
   * Clean up expired entries
   */
  async cleanup(): Promise<number> {
    let cleaned = 0;
    
    try {
      const files = await fs.readdir(this.cacheDir);
      
      for (const file of files) {
        if (file.endsWith('.json') && file !== 'stats.json') {
          const filePath = path.join(this.cacheDir, file);
          const data = await fs.readFile(filePath, 'utf-8');
          const entry: CacheEntry = JSON.parse(data);
          
          if (Date.now() > entry.expiresAt) {
            await fs.unlink(filePath);
            cleaned++;
          }
        }
      }

      if (cleaned > 0) {
        this.stats.totalEntries -= cleaned;
        await this.saveStats();
        const context = requestContextService.createRequestContext({ cleaned });
        logger.info(`Cleaned up ${cleaned} expired cache entries`, context);
      }
    } catch (error) {
      const errorContext = requestContextService.createRequestContext({ error });
      logger.error('Failed to cleanup cache', errorContext);
    }

    return cleaned;
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats & { hitRate: number }> {
    const totalRequests = this.stats.totalHits + this.stats.totalMisses;
    const hitRate = totalRequests > 0 ? (this.stats.totalHits / totalRequests) * 100 : 0;

    return {
      ...this.stats,
      hitRate
    };
  }
}

// Export singleton instance
export const cacheService = new CacheService(24); // 24 hour TTL by default