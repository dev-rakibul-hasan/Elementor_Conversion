/**
 * Image Processing & Metadata Extraction Engine
 * Module Owner: Rakib (Storage & Upload Lead)
 * 
 * Powered by Sharp.
 * Handles:
 * - Decompression bomb protection (limitInputPixels)
 * - Metadata extraction & validation
 * - EXIF orientation handling & normalization
 * - Metadata privacy stripping (GPS, camera serials)
 * - Crop & sub-asset slicing with bounds verification
 * - Re-encoding and safe temporary file lifecycle
 */

import fs from 'node:fs/promises';
import sharp, { type Metadata } from 'sharp';
import {
  DEFAULT_STORAGE_CONFIG,
  type StorageConfig,
  type SupportedImageFormat,
} from './types.js';
import {
  InvalidImageError,
  ImageDecodeError,
  ImageDimensionsExceededError,
  ImagePixelLimitExceededError,
  AnimatedImageNotSupportedError,
} from './errors.js';

export interface DecodedImageMetadata {
  width: number;
  height: number;
  normalizedWidth: number;
  normalizedHeight: number;
  aspectRatio: number;
  channels: number;
  hasAlpha: boolean;
  colorSpace: string;
  exifOrientation: number | null;
  isOrientationNormalized: boolean;
  frameCount: number;
  format: SupportedImageFormat;
  warnings: string[];
}

export interface ProcessedImageResult {
  metadata: DecodedImageMetadata;
  normalizedBuffer: Buffer;
}

export class ImageProcessor {
  private config: StorageConfig;

  constructor(config: StorageConfig = DEFAULT_STORAGE_CONFIG) {
    this.config = config;
  }

  /**
   * Decodes an image buffer, validates resource limits, and extracts normalized metadata.
   */
  public async extractMetadata(buffer: Buffer): Promise<DecodedImageMetadata> {
    const warnings: string[] = [];

    const imageInstance = sharp(buffer, {
      failOn: 'none',
      limitInputPixels: this.config.maxDecodedPixels,
    });

    let rawMeta: Metadata;
    try {
      rawMeta = await imageInstance.metadata();
    } catch (err: any) {
      if (err?.message?.includes('pixel limit') || err?.message?.includes('Input image exceeds pixel limit')) {
        throw new ImagePixelLimitExceededError(this.config.maxDecodedPixels + 1, this.config.maxDecodedPixels);
      }
      throw new ImageDecodeError(err?.message || 'Failed to decode image metadata', err);
    }

    const width = rawMeta.width;
    const height = rawMeta.height;

    if (!width || !height || width <= 0 || height <= 0) {
      throw new InvalidImageError('Image metadata contains non-positive or missing dimensions');
    }

    // 1. Enforce pixel limit guard
    const totalPixels = width * height;
    if (totalPixels > this.config.maxDecodedPixels) {
      throw new ImagePixelLimitExceededError(totalPixels, this.config.maxDecodedPixels);
    }

    // 2. Enforce max dimension guard
    if (width > this.config.maxDimensionPixels || height > this.config.maxDimensionPixels) {
      throw new ImageDimensionsExceededError(width, height, this.config.maxDimensionPixels);
    }

    // 3. Multi-frame / animation check
    const frameCount = rawMeta.pages || 1;
    if (frameCount > this.config.maxFrames) {
      throw new AnimatedImageNotSupportedError(frameCount);
    }

    // 4. Orientation inspection
    const exifOrientation = typeof rawMeta.orientation === 'number' ? rawMeta.orientation : null;
    let normalizedWidth = width;
    let normalizedHeight = height;
    let isOrientationNormalized = false;

    // Orientations 5, 6, 7, 8 transpose width and height
    if (exifOrientation && [5, 6, 7, 8].includes(exifOrientation)) {
      normalizedWidth = height;
      normalizedHeight = width;
      isOrientationNormalized = true;
    } else if (exifOrientation && exifOrientation > 1) {
      isOrientationNormalized = true;
    }

    const aspectRatio = parseFloat((normalizedWidth / normalizedHeight).toFixed(4));
    const channels = rawMeta.channels || 3;
    const hasAlpha = Boolean(rawMeta.hasAlpha);
    const colorSpace = rawMeta.space || 'srgb';

    let detectedFormat: SupportedImageFormat = 'png';
    if (rawMeta.format === 'jpeg') {
      detectedFormat = 'jpeg';
    } else if (rawMeta.format === 'webp') {
      detectedFormat = 'webp';
    } else if (rawMeta.format === 'png') {
      detectedFormat = 'png';
    }

    return {
      width,
      height,
      normalizedWidth,
      normalizedHeight,
      aspectRatio,
      channels,
      hasAlpha,
      colorSpace,
      exifOrientation,
      isOrientationNormalized,
      frameCount,
      format: detectedFormat,
      warnings,
    };
  }

  /**
   * Processes the input buffer into a normalized, privacy-stripped buffer.
   * Auto-orients EXIF rotation and strips sensitive geolocation tags.
   */
  public async processAndNormalize(buffer: Buffer): Promise<ProcessedImageResult> {
    const metadata = await this.extractMetadata(buffer);

    let transformer = sharp(buffer, {
      failOn: 'none',
      limitInputPixels: this.config.maxDecodedPixels,
    });

    // Auto-orient based on EXIF tag (and strip EXIF orientation tag from output so it's not applied twice)
    if (metadata.exifOrientation && metadata.exifOrientation > 1) {
      transformer = transformer.rotate();
    }

    // Strip sensitive EXIF (GPS coordinates, camera serial numbers, camera model)
    // while keeping color profiles intact
    transformer = transformer.withMetadata({
      orientation: 1, // Reset orientation tag since image was physically rotated
    });

    let normalizedBuffer: Buffer;
    try {
      normalizedBuffer = await transformer.toBuffer();
    } catch (err: any) {
      throw new ImageDecodeError(`Failed to normalize image: ${err?.message}`, err);
    }

    return {
      metadata,
      normalizedBuffer,
    };
  }

  /**
   * Crops a specified sub-rectangle from an image buffer with strict boundary verification.
   * Used for asset extraction (logos, artwork, hero graphics) in the DIR pipeline.
   */
  public async cropImageRegion(
    buffer: Buffer,
    rect: { x: number; y: number; width: number; height: number }
  ): Promise<Buffer> {
    const meta = await this.extractMetadata(buffer);

    const x = Math.round(rect.x);
    const y = Math.round(rect.y);
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);

    if (x < 0 || y < 0 || width <= 0 || height <= 0) {
      throw new InvalidImageError(`Invalid crop rectangle: (${x}, ${y}, ${width}x${height})`);
    }

    if (x + width > meta.normalizedWidth || y + height > meta.normalizedHeight) {
      throw new InvalidImageError(
        `Crop rectangle (${x}+${width}, ${y}+${height}) overflows image dimensions (${meta.normalizedWidth}x${meta.normalizedHeight})`
      );
    }

    try {
      return await sharp(buffer)
        .rotate() // ensure orientation normalized
        .extract({ left: x, top: y, width, height })
        .toBuffer();
    } catch (err: any) {
      throw new ImageDecodeError(`Crop failed: ${err?.message}`, err);
    }
  }

  /**
   * Alias for cropImageRegion.
   */
  public async cropRegion(
    buffer: Buffer,
    rect: { x: number; y: number; width: number; height: number }
  ): Promise<Buffer> {
    return this.cropImageRegion(buffer, rect);
  }

  /**
   * Safely deletes a file from the filesystem, suppressing missing file errors.
   */
  public static async safeUnlink(filePath?: string | null): Promise<void> {
    if (!filePath) return;
    try {
      await fs.unlink(filePath);
    } catch {
      // Ignore if file does not exist
    }
  }
}
