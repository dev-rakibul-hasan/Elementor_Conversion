import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { StorageAdapter, UploadResult } from './types.js';
import { StorageError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { env } from '../../config/env.js';

export class LocalStorageAdapter implements StorageAdapter {
  private readonly baseDir: string;

  constructor(baseDir?: string) {
    const rawPath = baseDir || env.LOCAL_STORAGE_PATH || './storage/uploads';
    this.baseDir = path.resolve(rawPath);
    this.ensureBaseDir();
  }

  private ensureBaseDir(): void {
    try {
      if (!fs.existsSync(this.baseDir)) {
        fs.mkdirSync(this.baseDir, { recursive: true });
        logger.info({ baseDir: this.baseDir }, 'Created local storage directory');
      }
    } catch (error) {
      logger.error({ err: error, baseDir: this.baseDir }, 'Failed to initialize local storage directory');
      throw new StorageError(
        `Failed to initialize local storage directory at '${this.baseDir}'`,
        { originalError: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Safely resolves a storage key into an absolute filesystem path,
   * preventing path traversal attacks.
   */
  private getSafePath(key: string): string {
    if (!key || typeof key !== 'string' || key.trim() === '') {
      throw new StorageError('Invalid storage key: key must be a non-empty string');
    }

    // Resolve base path and target file path
    const resolvedBase = path.resolve(this.baseDir);
    const resolvedPath = path.resolve(resolvedBase, key);

    // Verify target path is strictly within the designated storage root
    const relative = path.relative(resolvedBase, resolvedPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      logger.warn({ key, resolvedPath, resolvedBase }, 'Path traversal attempt detected in storage adapter');
      throw new StorageError(`Path traversal attempt detected for storage key: ${key}`);
    }

    return resolvedPath;
  }

  public async upload(
    key: string,
    buffer: Buffer,
    mimeType: string
  ): Promise<UploadResult> {
    try {
      const filePath = this.getSafePath(key);
      const fileDir = path.dirname(filePath);

      // Ensure subdirectory structure exists
      await fs.promises.mkdir(fileDir, { recursive: true });

      // Calculate SHA-256 content hash
      const contentHash = crypto.createHash('sha256').update(buffer).digest('hex');

      // Write file contents to disk
      await fs.promises.writeFile(filePath, buffer);

      logger.debug(
        { key, size: buffer.length, contentHash, mimeType },
        'File successfully stored to local filesystem'
      );

      return {
        key,
        size: buffer.length,
        contentHash,
        mimeType,
      };
    } catch (error) {
      if (error instanceof StorageError) {
        throw error;
      }
      logger.error({ err: error, key }, 'Failed to upload file to local storage');
      throw new StorageError(
        `Failed to upload file '${key}' to local storage`,
        { originalError: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  public async download(key: string): Promise<Buffer> {
    try {
      const filePath = this.getSafePath(key);
      return await fs.promises.readFile(filePath);
    } catch (error: any) {
      if (error instanceof StorageError) {
        throw error;
      }
      if (error && error.code === 'ENOENT') {
        throw new StorageError(`File '${key}' not found in local storage`);
      }
      logger.error({ err: error, key }, 'Failed to download file from local storage');
      throw new StorageError(
        `Failed to download file '${key}' from local storage`,
        { originalError: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  public async delete(key: string): Promise<void> {
    try {
      const filePath = this.getSafePath(key);
      try {
        await fs.promises.unlink(filePath);
        logger.debug({ key }, 'File successfully deleted from local storage');
      } catch (err: any) {
        if (err && err.code === 'ENOENT') {
          // File does not exist, consider delete idempotent
          return;
        }
        throw err;
      }
    } catch (error) {
      if (error instanceof StorageError) {
        throw error;
      }
      logger.error({ err: error, key }, 'Failed to delete file from local storage');
      throw new StorageError(
        `Failed to delete file '${key}' from local storage`,
        { originalError: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  public async getSignedUrl(key: string, _expirySeconds = 3600): Promise<string> {
    try {
      const filePath = this.getSafePath(key);

      // Support signed URLs as local file paths for development
      // Can return the absolute file path, or file URL format
      return filePath;
    } catch (error) {
      if (error instanceof StorageError) {
        throw error;
      }
      throw new StorageError(
        `Failed to generate signed URL for '${key}'`,
        { originalError: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  public async exists(key: string): Promise<boolean> {
    try {
      const filePath = this.getSafePath(key);
      const stat = await fs.promises.stat(filePath);
      return stat.isFile();
    } catch (error: any) {
      if (error && error.code === 'ENOENT') {
        return false;
      }
      if (error instanceof StorageError) {
        throw error;
      }
      logger.error({ err: error, key }, 'Error checking file existence in local storage');
      throw new StorageError(
        `Failed to check existence for '${key}'`,
        { originalError: error instanceof Error ? error.message : String(error) }
      );
    }
  }
}
