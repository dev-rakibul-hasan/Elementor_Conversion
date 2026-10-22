/**
 * Stage-Level AI Response Cache
 * Caches intermediate and final AI model responses by composite cryptographic hash:
 * hash(sourceImageHash + normalizedInput + schemaVersion + skillVersion + promptVersion + provider + model)
 *
 * Persists in PostgreSQL StageCache table with TTL support, version invalidation,
 * and memory fallback for offline/test environments.
 */

import crypto from 'crypto';
import { AIProvider, AIResponse } from './types.js';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';

export interface CacheKeyComponents {
  sourceImageHash?: string;
  normalizedInput?: string | object;
  schemaVersion?: string;
  skillVersion?: string;
  promptVersion?: string;
  provider: AIProvider | string;
  model: string;
  stage?: string;
}

export interface CacheStoreOptions {
  ttlSeconds?: number;
  stage?: string;
}

export interface VersionCheckParams {
  schemaVersion?: string;
  skillVersion?: string;
  promptVersion?: string;
}

export interface CacheEntry {
  cacheKey: string;
  response: AIResponse;
  metadata: {
    sourceImageHash?: string;
    schemaVersion?: string;
    skillVersion?: string;
    promptVersion?: string;
    provider: string;
    model: string;
    stage?: string;
  };
  expiresAt?: Date | null;
  createdAt: Date;
}

export class StageAICache {
  // In-memory fallback if PostgreSQL is unreachable or during unit tests
  private readonly memoryCache = new Map<string, CacheEntry>();
  private isPostgresAvailable = true;

  /**
   * Deterministically normalizes input payload for consistent hashing
   */
  private normalizeInput(input?: string | object): string {
    if (!input) return '';
    if (typeof input === 'string') return input.trim();
    try {
      // Deterministic JSON stringify with sorted keys
      const stable = (value: any): any => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
      return JSON.stringify(stable(input));
    } catch {
      return String(input);
    }
  }

  /**
   * Generates SHA-256 hash for cache key based on the 7 canonical factors
   */
  computeKey(components: CacheKeyComponents): string {
    const normSourceImage = (components.sourceImageHash || 'no_source_image').trim();
    const normInput = this.normalizeInput(components.normalizedInput);
    const normSchemaVer = (components.schemaVersion || 'v1.0.0').trim();
    const normSkillVer = (components.skillVersion || 'v1.0.0').trim();
    const normPromptVer = (components.promptVersion || 'v1.0.0').trim();
    const normProvider = components.provider.trim().toLowerCase();
    const normModel = components.model.trim().toLowerCase();

    const canonicalString = [
      'cache-v2',
      components.stage || '',
      normSourceImage,
      normInput,
      normSchemaVer,
      normSkillVer,
      normPromptVer,
      normProvider,
      normModel,
    ].join('::');

    return crypto.createHash('sha256').update(canonicalString, 'utf-8').digest('hex');
  }

  /**
   * Retrieves a cached response if valid, unexpired, and matching versions
   */
  async get(
    key: string,
    versionCheck?: VersionCheckParams
  ): Promise<AIResponse | null> {
    const now = new Date();

    // 1. Fast-path: Check Tier-1 in-memory cache first (< 0.01ms)
    const memEntry = this.memoryCache.get(key);
    if (memEntry) {
      if (memEntry.expiresAt && memEntry.expiresAt < now) {
        this.memoryCache.delete(key);
      } else if (
        versionCheck &&
        ((versionCheck.schemaVersion && memEntry.metadata.schemaVersion !== versionCheck.schemaVersion) ||
          (versionCheck.promptVersion && memEntry.metadata.promptVersion !== versionCheck.promptVersion) ||
          (versionCheck.skillVersion && memEntry.metadata.skillVersion !== versionCheck.skillVersion))
      ) {
        this.memoryCache.delete(key);
      } else {
        return {
          ...memEntry.response,
          cached: true,
        };
      }
    }

    // 2. Slow-path: Check Tier-2 PostgreSQL database if available
    if (this.isPostgresAvailable) {
      try {
        const record = await prisma.stageCache.findUnique({
          where: { cacheKey: key },
        });

        if (record) {
          // Check expiration
          if (record.expiresAt && record.expiresAt < now) {
            logger.debug({ key }, 'Cache entry expired in DB; discarding');
            // Clean up asynchronously
            prisma.stageCache.delete({ where: { cacheKey: key } }).catch(() => {});
            return null;
          }

          // Check version invalidation
          if (versionCheck) {
            const schemaMismatch =
              versionCheck.schemaVersion &&
              versionCheck.schemaVersion !== record.schemaVersion;
            const promptMismatch =
              versionCheck.promptVersion &&
              versionCheck.promptVersion !== record.promptVersion;
            const skillMismatch =
              versionCheck.skillVersion &&
              versionCheck.skillVersion !== record.skillVersion;

            if (schemaMismatch || promptMismatch || skillMismatch) {
              logger.debug(
                { key, versionCheck, recordVersions: record },
                'Cache entry invalidated by version change'
              );
              prisma.stageCache.delete({ where: { cacheKey: key } }).catch(() => {});
              return null;
            }
          }

          const rawResponse = record.response as unknown as AIResponse;
          const cachedResponse = {
            ...rawResponse,
            cached: true,
          };

          // Populate Tier-1 in-memory cache for subsequent fast hits
          this.memoryCache.set(key, {
            cacheKey: key,
            response: cachedResponse,
            metadata: {
              sourceImageHash: record.sourceImageHash || undefined,
              schemaVersion: record.schemaVersion || undefined,
              skillVersion: record.skillVersion || undefined,
              promptVersion: record.promptVersion || undefined,
              provider: record.provider as any,
              model: record.model,
              stage: record.stage || undefined,
            },
            expiresAt: record.expiresAt,
            createdAt: record.createdAt,
          });

          return cachedResponse;
        }
      } catch (err) {
        logger.warn(
          { err },
          'PostgreSQL StageCache query failed; falling back to in-memory cache'
        );
        this.isPostgresAvailable = false;
      }
    }

    return null;
  }

  /**
   * Stores a response in the cache.
   * NEVER caches errors or empty responses.
   */
  async set(
    components: CacheKeyComponents,
    response: AIResponse,
    options: CacheStoreOptions = {}
  ): Promise<string> {
    // Safety check: Never cache errors, empty content, or truncated/failure responses
    if (!response || !response.content || response.content.trim().length === 0 || response.finishReason === 'length') {
      logger.warn({ finishReason: response?.finishReason }, 'Attempted to cache an empty, invalid, or truncated AI response; skipped');
      return '';
    }

    const key = this.computeKey(components);
    const now = new Date();
    const expiresAt = options.ttlSeconds
      ? new Date(now.getTime() + options.ttlSeconds * 1000)
      : null;

    const sourceImageHash = components.sourceImageHash;
    const normalizedInput = this.normalizeInput(components.normalizedInput);
    const schemaVersion = components.schemaVersion || 'v1.0.0';
    const skillVersion = components.skillVersion || 'v1.0.0';
    const promptVersion = components.promptVersion || 'v1.0.0';
    const stage = options.stage || components.stage;

    // 1. Update in-memory cache
    this.memoryCache.set(key, {
      cacheKey: key,
      response: { ...response, cached: true },
      metadata: {
        sourceImageHash,
        schemaVersion,
        skillVersion,
        promptVersion,
        provider: components.provider,
        model: components.model,
        stage,
      },
      expiresAt,
      createdAt: now,
    });

    // 2. Persist to PostgreSQL if available
    if (this.isPostgresAvailable) {
      try {
        await prisma.stageCache.upsert({
          where: { cacheKey: key },
          create: {
            cacheKey: key,
            stage,
            sourceImageHash,
            normalizedInput,
            schemaVersion,
            skillVersion,
            promptVersion,
            provider: components.provider,
            model: components.model,
            response: response as any,
            usage: response.usage as any,
            expiresAt,
          },
          update: {
            stage,
            sourceImageHash,
            normalizedInput,
            schemaVersion,
            skillVersion,
            promptVersion,
            provider: components.provider,
            model: components.model,
            response: response as any,
            usage: response.usage as any,
            expiresAt,
          },
        });
        logger.debug({ key, stage, model: components.model }, 'Saved AI response to StageCache table');
      } catch (err) {
        logger.warn(
          { err, key },
          'Failed to upsert to PostgreSQL StageCache; cached in memory only'
        );
        this.isPostgresAvailable = false;
      }
    }

    return key;
  }

  /**
   * Invalidates cached stages associated with a specific source image hash
   */
  async invalidateByImage(sourceImageHash: string): Promise<number> {
    let deletedCount = 0;

    // Clear matching entries from memory cache
    for (const [k, v] of this.memoryCache.entries()) {
      if (v.metadata.sourceImageHash === sourceImageHash) {
        this.memoryCache.delete(k);
        deletedCount += 1;
      }
    }

    // Clear from PostgreSQL
    if (this.isPostgresAvailable) {
      try {
        const result = await prisma.stageCache.deleteMany({
          where: { sourceImageHash },
        });
        deletedCount = Math.max(deletedCount, result.count);
      } catch (err) {
        logger.warn({ err, sourceImageHash }, 'Failed to delete StageCache records by image hash');
      }
    }

    return deletedCount;
  }

  /**
   * Invalidates cached items when schema or prompt versions increment
   */
  async invalidateByVersion(params: {
    schemaVersion?: string;
    promptVersion?: string;
    skillVersion?: string;
  }): Promise<number> {
    const versions = Object.entries(params).filter(([, version]) => !!version);
    if (!versions.length) return 0;
    let count = 0;

    for (const [k, v] of this.memoryCache.entries()) {
      if (
        (params.schemaVersion && v.metadata.schemaVersion !== params.schemaVersion) ||
        (params.promptVersion && v.metadata.promptVersion !== params.promptVersion) ||
        (params.skillVersion && v.metadata.skillVersion !== params.skillVersion)
      ) {
        this.memoryCache.delete(k);
        count += 1;
      }
    }

    if (this.isPostgresAvailable) {
      try {
        const result = await prisma.stageCache.deleteMany({
          where: { OR: versions.flatMap(([field, version]) => [
            { [field]: { not: version } }, { [field]: null },
          ]) },
        });
        count = Math.max(count, result.count);
      } catch (err) {
        logger.warn({ err }, 'Failed to invalidate StageCache by version in PostgreSQL');
      }
    }

    return count;
  }

  /**
   * Explicitly invalidate a single cache entry by key
   */
  async invalidateKey(key: string): Promise<boolean> {
    let deleted = false;
    if (this.memoryCache.has(key)) {
      this.memoryCache.delete(key);
      deleted = true;
    }

    if (this.isPostgresAvailable) {
      try {
        const res = await prisma.stageCache.deleteMany({ where: { cacheKey: key } });
        if (res.count > 0) deleted = true;
      } catch {
        // Ignored if DB operation fails
      }
    }

    return deleted;
  }

  /**
   * Purge expired cache entries
   */
  async cleanExpired(): Promise<number> {
    const now = new Date();
    let count = 0;

    for (const [k, v] of this.memoryCache.entries()) {
      if (v.expiresAt && v.expiresAt < now) {
        this.memoryCache.delete(k);
        count += 1;
      }
    }

    if (this.isPostgresAvailable) {
      try {
        const result = await prisma.stageCache.deleteMany({
          where: {
            expiresAt: {
              lt: now,
            },
          },
        });
        count = Math.max(count, result.count);
      } catch (err) {
        logger.warn({ err }, 'Failed to clean expired StageCache entries');
      }
    }

    return count;
  }

  /**
   * Clear all cache entries (useful for test resets)
   */
  async clearAll(): Promise<void> {
    this.memoryCache.clear();
    if (this.isPostgresAvailable) {
      try {
        await prisma.stageCache.deleteMany({});
      } catch {
        // ignore in tests/offline
      }
    }
  }
}

export const stageAICache = new StageAICache();
export default stageAICache;
