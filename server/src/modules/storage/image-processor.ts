import crypto from 'crypto';
import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';
import {
  ImageMetadata,
  ImageValidationResult,
  ImageTile,
  AnalysisCopyResult,
} from './types.js';
import { ValidationError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { env } from '../../config/env.js';

/**
 * Maximum allowed image dimensions in total pixels (100 Megapixels).
 * Protects against decompression bomb (zip bomb / pixel flood) attacks.
 */
export const MAX_PIXELS_LIMIT = 100_000_000; // 100 MP

/**
 * Supported MIME types for uploaded design screenshots.
 */
export const SUPPORTED_MIME_TYPES = ['image/png', 'image/jpeg'] as const;

/**
 * Inspect magic bytes directly from buffer to ensure the payload is authentic.
 */
export function checkMagicBytes(buffer: Buffer): 'image/png' | 'image/jpeg' | null {
  if (buffer.length >= 8) {
    // PNG signature: 89 50 4E 47 0D 0A 1A 0A
    if (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    ) {
      return 'image/png';
    }
  }

  if (buffer.length >= 3) {
    // JPEG signature: FF D8 FF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return 'image/jpeg';
    }
  }

  return null;
}

/**
 * Computes the SHA-256 content hash of a buffer.
 */
export function computeContentHash(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Validates an image buffer for security and formatting constraints:
 * - Checks file size against UPLOAD_MAX_BYTES
 * - Performs MIME type validation using file-type inspection of actual bytes
 * - Verifies image magic bytes for authentic PNG/JPEG format
 * - Protects against decompression bombs by enforcing a strict 100 MP limit
 * - Ensures image dimensions are valid and readable
 */
export async function validateImage(buffer: Buffer): Promise<ImageValidationResult> {
  if (!buffer || buffer.length === 0) {
    throw new ValidationError('Uploaded image file is empty');
  }

  // 1. File size check
  const maxBytes = env.UPLOAD_MAX_BYTES || 524_288_000; // default 500MB
  if (buffer.length > maxBytes) {
    const sizeMb = (buffer.length / (1024 * 1024)).toFixed(2);
    const maxMb = (maxBytes / (1024 * 1024)).toFixed(0);
    throw new ValidationError(
      `Image file size (${sizeMb} MB) exceeds maximum allowed size of ${maxMb} MB`
    );
  }

  // 2. MIME type verification via file-type (examining actual bytes)
  const detectedType = await fileTypeFromBuffer(buffer);
  if (!detectedType) {
    throw new ValidationError('Could not determine image file type from content');
  }

  if (!SUPPORTED_MIME_TYPES.includes(detectedType.mime as any)) {
    throw new ValidationError(
      `Unsupported image format '${detectedType.mime}'. Only PNG and JPEG images are allowed.`
    );
  }

  // 3. Magic bytes double-check
  const magicByteMime = checkMagicBytes(buffer);
  if (!magicByteMime || magicByteMime !== detectedType.mime) {
    throw new ValidationError(
      'Corrupt or spoofed image: file magic bytes do not match expected image signature'
    );
  }

  // 4. Sharp metadata check with decompression bomb protection
  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(buffer, {
      failOn: 'truncated',
      limitInputPixels: MAX_PIXELS_LIMIT,
    }).metadata();
  } catch (error: any) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('Input image exceeds pixel limit') || msg.includes('pixel limit')) {
      throw new ValidationError(
        `Image exceeds maximum limit of 100 megapixels. Potential decompression bomb rejected.`
      );
    }
    logger.warn({ err: error }, 'Failed to parse image with sharp');
    throw new ValidationError(`Corrupt or unreadable image file: ${msg}`);
  }

  const width = metadata.width;
  const height = metadata.height;

  if (!width || !height || width <= 0 || height <= 0) {
    throw new ValidationError('Image has invalid or missing dimensions');
  }

  const totalPixels = width * height;
  if (totalPixels > MAX_PIXELS_LIMIT) {
    const megapixels = (totalPixels / 1_000_000).toFixed(1);
    throw new ValidationError(
      `Image resolution of ${megapixels} MP exceeds maximum allowed limit of 100 MP`
    );
  }

  return {
    width,
    height,
    format: metadata.format || detectedType.ext,
    size: buffer.length,
    mimeType: detectedType.mime,
  };
}

/**
 * Extracts comprehensive metadata from an image buffer.
 */
export async function getImageMetadata(buffer: Buffer): Promise<ImageMetadata> {
  const metadata = await sharp(buffer, {
    limitInputPixels: MAX_PIXELS_LIMIT,
  }).metadata();

  if (!metadata.width || !metadata.height || !metadata.format) {
    throw new ValidationError('Cannot extract valid metadata from image');
  }

  return {
    width: metadata.width,
    height: metadata.height,
    format: metadata.format,
    size: buffer.length,
    channels: metadata.channels ?? 3,
    space: metadata.space,
    hasAlpha: Boolean(metadata.hasAlpha),
  };
}

/**
 * Creates an optimized normalized JPEG copy resized for AI vision model analysis.
 * Downscales images exceeding maxWidth while preserving aspect ratio.
 */
export async function createAnalysisCopy(
  buffer: Buffer,
  maxWidth = 1920
): Promise<AnalysisCopyResult> {
  const metadata = await sharp(buffer, {
    limitInputPixels: MAX_PIXELS_LIMIT,
  }).metadata();

  if (!metadata.width || !metadata.height) {
    throw new ValidationError('Invalid image dimensions for analysis copy');
  }

  let pipeline = sharp(buffer, {
    limitInputPixels: MAX_PIXELS_LIMIT,
  });

  if (metadata.width > maxWidth) {
    pipeline = pipeline.resize({
      width: maxWidth,
      withoutEnlargement: true,
      fit: 'inside',
    });
  }

  const processedBuffer = await pipeline
    .jpeg({
      quality: 85,
      mozjpeg: true,
    })
    .toBuffer();

  const processedMeta = await sharp(processedBuffer).metadata();

  return {
    buffer: processedBuffer,
    width: processedMeta.width ?? metadata.width,
    height: processedMeta.height ?? metadata.height,
    mimeType: 'image/jpeg',
  };
}

/**
 * Creates a square thumbnail of the design screenshot, focusing on the top header area.
 */
export async function createThumbnail(
  buffer: Buffer,
  size = 300
): Promise<Buffer> {
  return sharp(buffer, {
    limitInputPixels: MAX_PIXELS_LIMIT,
  })
    .resize(size, size, {
      fit: 'cover',
      position: 'top', // Webpage designs naturally start with key header / hero branding at the top
    })
    .jpeg({
      quality: 80,
      mozjpeg: true,
    })
    .toBuffer();
}

/**
 * Splits tall images into overlapping vertical tiles for multi-pass vision model analysis.
 * Overlap prevents element truncation across tile boundaries.
 */
export async function createTiles(
  buffer: Buffer,
  tileHeight = 1200,
  overlap = 100
): Promise<ImageTile[]> {
  const meta = await sharp(buffer, {
    limitInputPixels: MAX_PIXELS_LIMIT,
  }).metadata();

  const width = meta.width;
  const height = meta.height;

  if (!width || !height) {
    throw new ValidationError('Cannot tile image with invalid dimensions');
  }

  // If the image is shorter than or equal to tileHeight, return single tile
  if (height <= tileHeight) {
    const tileBuffer = await sharp(buffer, { limitInputPixels: MAX_PIXELS_LIMIT })
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();

    return [
      {
        buffer: tileBuffer,
        index: 0,
        yOffset: 0,
        height,
        totalTiles: 1,
      },
    ];
  }

  const step = Math.max(1, tileHeight - overlap);
  const tileSpecs: { yOffset: number; height: number }[] = [];

  let currentY = 0;
  while (currentY < height) {
    const currentHeight = Math.min(tileHeight, height - currentY);
    tileSpecs.push({ yOffset: currentY, height: currentHeight });

    if (currentY + currentHeight >= height) {
      break;
    }
    currentY += step;
  }

  const totalTiles = tileSpecs.length;
  const tiles: ImageTile[] = [];

  for (let i = 0; i < totalTiles; i++) {
    const spec = tileSpecs[i];
    const tileBuffer = await sharp(buffer, { limitInputPixels: MAX_PIXELS_LIMIT })
      .extract({
        left: 0,
        top: spec.yOffset,
        width: width,
        height: spec.height,
      })
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();

    tiles.push({
      buffer: tileBuffer,
      index: i,
      yOffset: spec.yOffset,
      height: spec.height,
      totalTiles,
    });
  }

  return tiles;
}

/**
 * Crops a specific sub-region from an image buffer using pixel coordinates.
 * Clamps coordinates to valid image dimensions to prevent out-of-bounds errors.
 */
export async function cropAsset(
  sourceBuffer: Buffer,
  rect: { x: number; y: number; width: number; height: number }
): Promise<Buffer> {
  const meta = await sharp(sourceBuffer, { limitInputPixels: MAX_PIXELS_LIMIT }).metadata();
  const imgWidth = meta.width || 1440;
  const imgHeight = meta.height || 900;

  const left = Math.max(0, Math.min(Math.round(rect.x), imgWidth - 1));
  const top = Math.max(0, Math.min(Math.round(rect.y), imgHeight - 1));
  const width = Math.max(1, Math.min(Math.round(rect.width), imgWidth - left));
  const height = Math.max(1, Math.min(Math.round(rect.height), imgHeight - top));

  return sharp(sourceBuffer, { limitInputPixels: MAX_PIXELS_LIMIT })
    .extract({ left, top, width, height })
    .png({ quality: 90 })
    .toBuffer();
}

