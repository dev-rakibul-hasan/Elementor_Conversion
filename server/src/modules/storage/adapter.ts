/**
 * Upload Storage Adapter for Pipeline Orchestration
 * Module Owner: Rakib (Storage & Upload Lead)
 * 
 * Implements Mubasshir's IUploadStorageAdapter contract to wire Stage 1 (Upload Validation)
 * and Stage 2 (Canvas Isolation) into the ConversionPipelineOrchestrator.
 */

import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import sharp from 'sharp';
import type {
  IUploadStorageAdapter,
} from '../orchestration/adapters.js';
import type {
  Stage1UploadValidationInput,
  Stage1UploadValidationOutput,
} from '../orchestration/registry.js';
import type { DIRCanvasBounds } from '../dir/types.js';
import { UploadService } from './upload-service.js';
import { ImageProcessor } from './processor.js';
import type { StorageConfig } from './types.js';
import type { DIRDocument } from '../dir/types.js';

export class UploadStorageAdapter implements IUploadStorageAdapter {
  private uploadService: UploadService;
  private processor: ImageProcessor;

  constructor(uploadService?: UploadService, config?: StorageConfig) {
    this.uploadService = uploadService || new UploadService({ config });
    this.processor = new ImageProcessor(config);
  }

  /**
   * Validates upload input for Stage 1 of the conversion pipeline.
   */
  public async validateUpload(input: Stage1UploadValidationInput): Promise<Stage1UploadValidationOutput> {
    let fileBuffer: Buffer;

    try {
      fileBuffer = await fs.readFile(input.filePath);
    } catch {
      // If filePath was a relative storage path, attempt reading via storage provider
      try {
        fileBuffer = await this.uploadService.getStorageProvider().read(input.filePath);
      } catch (err: any) {
        throw new Error(`Failed to read upload file at "${input.filePath}": ${err?.message}`);
      }
    }

    const uploadResult = await this.uploadService.handleUpload({
      fileBuffer,
      originalFileName: input.fileName,
      declaredMimeType: input.mimeType,
      projectId: input.projectId,
    });

    const meta = uploadResult.metadata;

    return {
      verifiedSha256: meta.sha256,
      verifiedMimeType: meta.mimeType,
      verifiedWidth: meta.normalizedWidth,
      verifiedHeight: meta.normalizedHeight,
      storagePath: meta.storagePath,
      isCanvasIsolated: true,
      sanitizedFileName: meta.sanitizedFileName,
      validatedAt: meta.createdAt,
    };
  }

  /**
   * Implements canvas isolation bounds extraction for Stage 2.
   */
  public async isolateCanvas(filePath: string): Promise<DIRCanvasBounds> {
    let buffer: Buffer;
    try {
      buffer = await fs.readFile(filePath);
    } catch {
      buffer = await this.uploadService.getStorageProvider().read(filePath);
    }

    const meta = await this.processor.extractMetadata(buffer);

    return {
      crop_mockup: false,
      inner_bg_type: 'solid',
      primary_hex: '#050a04',
      x: 0,
      y: 0,
      width: meta.normalizedWidth,
      height: meta.normalizedHeight,
    };
  }

  public async prepareDIRAssets(
    document: DIRDocument,
    input: { projectId: string; sourceAssetPath: string }
  ): Promise<DIRDocument> {
    const preparedDocument = structuredClone(document);
    const assetsToCrop = preparedDocument.assets.filter(
      (asset) => asset.sourceRect && !asset.path && !this.hasPublicAssetUrl(asset.url, asset.placeholder)
    );
    if (assetsToCrop.length === 0) return preparedDocument;

    const sourceBuffer = await this.uploadService.getStorageProvider().read(input.sourceAssetPath);
    const projectSegment = this.safePathSegment(input.projectId);

    for (const asset of assetsToCrop) {
      const sourceRect = asset.sourceRect;
      if (!sourceRect) continue;
      const croppedBuffer = await this.processor.cropImageRegion(sourceBuffer, sourceRect);
      const pngBuffer = await sharp(croppedBuffer).png().toBuffer();
      const croppedMetadata = await sharp(pngBuffer).metadata();
      if (!croppedMetadata.width || !croppedMetadata.height) {
        throw new Error(`Failed to read dimensions for cropped DIR asset "${asset.id}"`);
      }
      const assetSegment = this.safePathSegment(asset.id);
      const storagePath = `projects/${projectSegment}/assets/${assetSegment}.png`;
      await this.uploadService.getStorageProvider().save(storagePath, pngBuffer);

      asset.path = storagePath;
      asset.width = croppedMetadata.width;
      asset.height = croppedMetadata.height;
    }

    return preparedDocument;
  }

  private hasPublicAssetUrl(...values: Array<string | undefined>): boolean {
    return values.some((value) => {
      if (!value) return false;
      if (/^https?:\/\//i.test(value)) {
        try {
          const parsed = new URL(value);
          return parsed.protocol === 'http:' || parsed.protocol === 'https:';
        } catch {
          return false;
        }
      }
      return value.startsWith('/') && !value.startsWith('//');
    });
  }

  private safePathSegment(value: string): string {
    const sanitized = value.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/^_+|_+$/g, '').slice(0, 64);
    const suffix = crypto.createHash('sha256').update(value).digest('hex').slice(0, 8);
    return `${sanitized.slice(0, 48) || 'asset'}-${suffix}`;
  }
}
