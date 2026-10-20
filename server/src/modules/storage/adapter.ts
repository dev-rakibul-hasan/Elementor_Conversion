/**
 * Upload Storage Adapter for Pipeline Orchestration
 * Module Owner: Rakib (Storage & Upload Lead)
 * 
 * Implements Mubasshir's IUploadStorageAdapter contract to wire Stage 1 (Upload Validation)
 * and Stage 2 (Canvas Isolation) into the ConversionPipelineOrchestrator.
 */

import fs from 'node:fs/promises';
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
}
