/**
 * Storage Provider Abstraction & Local Filesystem Implementation
 * Module Owner: Rakib (Storage & Upload Lead)
 * 
 * Provides atomic file persistence, safe relative path resolution,
 * and path-traversal prevention.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { StorageWriteError } from './errors.js';

export interface IStorageProvider {
  /**
   * Persists a buffer atomically to the storage location.
   */
  save(relativePath: string, buffer: Buffer): Promise<void>;

  /**
   * Reads a file buffer from the storage location.
   */
  read(relativePath: string): Promise<Buffer>;

  /**
   * Checks if a file exists at the storage location.
   */
  exists(relativePath: string): Promise<boolean>;

  /**
   * Deletes a file from storage.
   */
  delete(relativePath: string): Promise<void>;

  /**
   * Resolves the safe absolute path on disk.
   */
  resolveAbsolutePath(relativePath: string): string;
}

export class LocalStorageProvider implements IStorageProvider {
  private baseDir: string;

  constructor(baseDir = './storage/uploads') {
    this.baseDir = path.resolve(process.cwd(), baseDir);
  }

  /**
   * Resolves a relative path to an absolute path, preventing path traversal outside baseDir.
   */
  public resolveAbsolutePath(relativePath: string): string {
    const safeRel = path.normalize(relativePath).replace(/^(\.\.[\/\\])+/, '');
    const resolved = path.resolve(this.baseDir, safeRel);

    if (!resolved.startsWith(this.baseDir)) {
      throw new StorageWriteError(`Path traversal detected: "${relativePath}" escapes root directory`);
    }

    return resolved;
  }

  public async save(relativePath: string, buffer: Buffer): Promise<void> {
    const targetPath = this.resolveAbsolutePath(relativePath);
    const targetDir = path.dirname(targetPath);
    const tempPath = `${targetPath}.${crypto.randomUUID()}.tmp`;

    try {
      await fs.mkdir(targetDir, { recursive: true });
      // Write to temp file then rename for atomic creation
      await fs.writeFile(tempPath, buffer);
      await fs.rename(tempPath, targetPath);
    } catch (err: any) {
      try {
        await fs.unlink(tempPath);
      } catch {
        // ignore
      }
      throw new StorageWriteError(`Failed to save file to "${relativePath}": ${err?.message}`, err);
    }
  }

  public async read(relativePath: string): Promise<Buffer> {
    const targetPath = this.resolveAbsolutePath(relativePath);
    try {
      return await fs.readFile(targetPath);
    } catch (err: any) {
      throw new StorageWriteError(`Failed to read file from "${relativePath}": ${err?.message}`, err);
    }
  }

  public async exists(relativePath: string): Promise<boolean> {
    const targetPath = this.resolveAbsolutePath(relativePath);
    try {
      await fs.access(targetPath);
      return true;
    } catch {
      return false;
    }
  }

  public async delete(relativePath: string): Promise<void> {
    const targetPath = this.resolveAbsolutePath(relativePath);
    try {
      await fs.unlink(targetPath);
    } catch (err: any) {
      if (err?.code !== 'ENOENT') {
        throw new StorageWriteError(`Failed to delete file from "${relativePath}": ${err?.message}`, err);
      }
    }
  }
}
