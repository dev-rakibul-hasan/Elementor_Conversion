import { StorageAdapter, StorageConfig } from './types.js';
import { LocalStorageAdapter } from './local.js';
import { B2StorageAdapter } from './b2.js';
import { StorageError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { env } from '../../config/env.js';

let storageInstance: StorageAdapter | null = null;

/**
 * Creates a new instance of a storage adapter according to configuration or environment.
 */
export function createStorageAdapter(config?: Partial<StorageConfig>): StorageAdapter {
  const provider = config?.provider || env.STORAGE_PROVIDER || 'local';

  if (provider === 'local') {
    const localPath = config?.localPath || env.LOCAL_STORAGE_PATH;
    if (!localPath) {
      throw new StorageError('LOCAL_STORAGE_PATH must be configured when using local storage provider');
    }

    logger.info({ provider, localPath }, 'Initializing LocalStorageAdapter');
    return new LocalStorageAdapter(localPath);
  }

  if (provider === 'b2') {
    const endpoint = config?.b2Endpoint !== undefined ? config.b2Endpoint : env.B2_ENDPOINT;
    const region = config?.b2Region !== undefined ? config.b2Region : env.B2_REGION;
    const bucket = config?.b2Bucket !== undefined ? config.b2Bucket : env.B2_BUCKET_NAME;
    const keyId = config?.b2KeyId !== undefined ? config.b2KeyId : env.B2_APPLICATION_KEY_ID;
    const key = config?.b2Key !== undefined ? config.b2Key : env.B2_APPLICATION_KEY;

    const missingVars: string[] = [];
    if (!endpoint) missingVars.push('B2_ENDPOINT');
    if (!region) missingVars.push('B2_REGION');
    if (!bucket) missingVars.push('B2_BUCKET_NAME');
    if (!keyId) missingVars.push('B2_APPLICATION_KEY_ID');
    if (!key) missingVars.push('B2_APPLICATION_KEY');

    if (missingVars.length > 0) {
      throw new StorageError(
        `Missing required Backblaze B2 environment variables: ${missingVars.join(', ')}`
      );
    }

    logger.info({ provider, endpoint, region, bucket }, 'Initializing B2StorageAdapter');
    return new B2StorageAdapter({
      endpoint,
      region,
      bucket,
      keyId,
      applicationKey: key,
    });
  }

  throw new StorageError(
    `Unsupported storage provider: '${provider}'. Valid providers are 'local' or 'b2'`
  );
}

/**
 * Returns the global singleton storage adapter instance.
 * If specific config overrides are provided, instantiates a customized adapter.
 */
export function getStorage(config?: Partial<StorageConfig>): StorageAdapter {
  if (!storageInstance) {
    storageInstance = createStorageAdapter(config);
  }

  return storageInstance;
}

/**
 * Reset storage singleton instance (mainly for unit tests).
 */
export function resetStorageInstance(): void {
  storageInstance = null;
}
