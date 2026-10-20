/**
 * Upload Service
 * Module Owner: Rakib (Storage & Upload Lead)
 * 
 * Orchestrates the full upload, validation, deduplication, metadata extraction,
 * persistence, and canvas initialization workflow.
 */

import crypto from 'node:crypto';
import {
  DEFAULT_STORAGE_CONFIG,
  type StorageConfig,
  type ValidatedImageMetadata,
  type UploadResult,
} from './types.js';
import { validateUploadContent } from './validator.js';
import { computeSha256, type IAssetDeduplicationStore, InMemoryDeduplicationStore } from './hasher.js';
import { ImageProcessor } from './processor.js';
import { CanvasIsolationService, type CanvasInitializationOptions } from './canvas.js';
import { type IStorageProvider, LocalStorageProvider } from './storage-provider.js';

export interface ProcessUploadParams {
  fileBuffer: Buffer;
  originalFileName?: string;
  declaredMimeType?: string;
  projectId?: string;
  userId?: string;
  canvasOptions?: CanvasInitializationOptions;
}

export class UploadService {
  private config: StorageConfig;
  private storageProvider: IStorageProvider;
  private deduplicationStore: IAssetDeduplicationStore;
  private processor: ImageProcessor;

  constructor(options?: {
    config?: StorageConfig;
    storageProvider?: IStorageProvider;
    deduplicationStore?: IAssetDeduplicationStore;
    processor?: ImageProcessor;
    canvasService?: CanvasIsolationService;
  }) {
    this.config = options?.config || DEFAULT_STORAGE_CONFIG;
    this.storageProvider = options?.storageProvider || new LocalStorageProvider(this.config.storageDir);
    this.deduplicationStore = options?.deduplicationStore || new InMemoryDeduplicationStore();
    this.processor = options?.processor || new ImageProcessor(this.config);
  }

  /**
   * Executes the end-to-end upload ingestion pipeline.
   */
  public async handleUpload(params: ProcessUploadParams): Promise<UploadResult> {
    const { fileBuffer, originalFileName, declaredMimeType, projectId, canvasOptions } = params;
    const scope = projectId || 'default_project';

    // 1. Validate file format, magic bytes, and size limits
    const validation = validateUploadContent(
      fileBuffer,
      declaredMimeType,
      originalFileName,
      this.config
    );

    // 2. Compute authoritative SHA-256 digest on raw original bytes
    const sha256 = computeSha256(fileBuffer);

    // 3. Scoped duplicate detection lookup
    const existingAsset = await this.deduplicationStore.findBySha256(scope, sha256);
    if (existingAsset) {
      // Re-create an isolated canvas instance for this request
      const canvas = CanvasIsolationService.createIsolatedCanvas(existingAsset, canvasOptions);
      return {
        assetId: existingAsset.id,
        metadata: existingAsset,
        isDuplicate: true,
        duplicateOfAssetId: existingAsset.id,
        canvas,
        warnings: ['Asset with identical SHA-256 already exists in project scope; deduplicated.'],
      };
    }

    // 4. Decode image, enforce resource limits, and normalize orientation
    const { metadata: decodedMeta, normalizedBuffer } = await this.processor.processAndNormalize(fileBuffer);

    // 5. Generate secure internal asset identifier
    const assetId = `asset_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

    // 6. Formulate secure storage path
    const ext = validation.detectedFormat === 'jpeg' ? 'jpg' : validation.detectedFormat;
    const safeBaseName = validation.sanitizedFileName.replace(/\.[^/.]+$/, '');
    const storagePath = `projects/${scope}/originals/${sha256.slice(0, 16)}_${safeBaseName}.${ext}`;

    // 7. Persist file atomically
    await this.storageProvider.save(storagePath, normalizedBuffer);

    // 8. Assemble validated metadata record
    const validatedMetadata: ValidatedImageMetadata = {
      id: assetId,
      originalFileName: originalFileName || validation.sanitizedFileName,
      sanitizedFileName: validation.sanitizedFileName,
      mimeType: validation.detectedMime,
      format: validation.detectedFormat,
      sizeBytes: validation.sizeBytes,
      sha256,
      width: decodedMeta.width,
      height: decodedMeta.height,
      normalizedWidth: decodedMeta.normalizedWidth,
      normalizedHeight: decodedMeta.normalizedHeight,
      aspectRatio: decodedMeta.aspectRatio,
      channels: decodedMeta.channels,
      hasAlpha: decodedMeta.hasAlpha,
      colorSpace: decodedMeta.colorSpace,
      exifOrientation: decodedMeta.exifOrientation,
      isOrientationNormalized: decodedMeta.isOrientationNormalized,
      frameCount: decodedMeta.frameCount,
      storagePath,
      storageProvider: 'local',
      createdAt: new Date().toISOString(),
      warnings: decodedMeta.warnings,
    };

    // 9. Register in deduplication store under project scope
    await this.deduplicationStore.registerAsset(scope, validatedMetadata);

    // 10. Initialize isolated canvas representation
    const canvas = CanvasIsolationService.createIsolatedCanvas(validatedMetadata, canvasOptions);

    return {
      assetId,
      metadata: validatedMetadata,
      isDuplicate: false,
      canvas,
      warnings: validatedMetadata.warnings,
    };
  }

  public getStorageProvider(): IStorageProvider {
    return this.storageProvider;
  }

  public getDeduplicationStore(): IAssetDeduplicationStore {
    return this.deduplicationStore;
  }
}
