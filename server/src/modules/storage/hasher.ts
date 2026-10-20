/**
 * Cryptographic SHA-256 Hashing & Scoped Deduplication Service
 * Module Owner: Rakib (Storage & Upload Lead)
 * 
 * Computes authoritative content digests and manages duplicate detection
 * with tenant/project scope isolation.
 */

import crypto from 'node:crypto';
import type { Readable } from 'node:stream';
import type { ValidatedImageMetadata } from './types.js';

/**
 * Computes authoritative SHA-256 hex digest from a byte buffer.
 */
export function computeSha256(buffer: Buffer): string {
  if (!buffer) {
    throw new Error('Cannot compute SHA-256 on null or undefined buffer');
  }
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Computes SHA-256 hex digest incrementally from a readable stream.
 */
export async function computeStreamSha256(stream: Readable): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', (err) => reject(err));
  });
}

/**
 * Interface for duplicate lookup and registration with tenancy scope.
 */
export interface IAssetDeduplicationStore {
  /**
   * Looks up an existing asset matching the given SHA-256 hash strictly within the authorized scope.
   */
  findBySha256(scope: string, sha256: string): Promise<ValidatedImageMetadata | null>;

  /**
   * Registers a newly verified asset to the deduplication index under the given scope.
   */
  registerAsset(scope: string, metadata: ValidatedImageMetadata): Promise<void>;

  /**
   * Clears the index (primarily for testing and cache reset).
   */
  clear(): Promise<void>;
}

/**
 * In-memory reference implementation of IAssetDeduplicationStore.
 */
export class InMemoryDeduplicationStore implements IAssetDeduplicationStore {
  private store = new Map<string, ValidatedImageMetadata>();

  private buildKey(scope: string, sha256: string): string {
    return `${scope}:${sha256.toLowerCase().trim()}`;
  }

  public async findBySha256(scope: string, sha256: string): Promise<ValidatedImageMetadata | null> {
    const key = this.buildKey(scope, sha256);
    const existing = this.store.get(key);
    if (!existing) {
      return null;
    }
    // Return a defensive clone to avoid mutation
    return JSON.parse(JSON.stringify(existing)) as ValidatedImageMetadata;
  }

  public async registerAsset(scope: string, metadata: ValidatedImageMetadata): Promise<void> {
    const key = this.buildKey(scope, metadata.sha256);
    this.store.set(key, JSON.parse(JSON.stringify(metadata)));
  }

  public async clear(): Promise<void> {
    this.store.clear();
  }

  public async findDuplicate(
    sha256: string,
    scope: string
  ): Promise<{ assetId: string; sha256: string; scope: string } | null> {
    const meta = await this.findBySha256(scope, sha256);
    if (!meta) {
      return null;
    }
    return { assetId: meta.id, sha256: meta.sha256, scope };
  }

  public async recordAsset(sha256: string, assetId: string, scope: string): Promise<void> {
    const dummyMetadata: ValidatedImageMetadata = {
      id: assetId,
      sha256,
      originalFileName: 'recorded.bin',
      sanitizedFileName: 'recorded.bin',
      mimeType: 'image/png',
      format: 'png',
      sizeBytes: 100,
      width: 100,
      height: 100,
      normalizedWidth: 100,
      normalizedHeight: 100,
      aspectRatio: 1,
      channels: 4,
      hasAlpha: true,
      colorSpace: 'srgb',
      frameCount: 1,
      exifOrientation: null,
      isOrientationNormalized: true,
      storagePath: `storage/${scope}/${assetId}.png`,
      storageProvider: 'local',
      createdAt: new Date().toISOString(),
      warnings: [],
    };
    await this.registerAsset(scope, dummyMetadata);
  }

  public async remove(sha256: string, scope: string): Promise<void> {
    const key = this.buildKey(scope, sha256);
    this.store.delete(key);
  }
}
