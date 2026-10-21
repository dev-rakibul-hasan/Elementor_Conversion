import crypto from 'crypto';
import sharp, { type Metadata } from 'sharp';
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
  let metadata: Metadata;
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

/** Make model input, crop coordinates and browser rendering use the same pixel orientation. */
export async function normalizeImageOrientation(buffer: Buffer): Promise<Buffer> {
  const image = sharp(buffer, { limitInputPixels: MAX_PIXELS_LIMIT });
  const metadata = await image.metadata();
  return metadata.orientation && metadata.orientation !== 1 ? image.rotate().toBuffer() : buffer;
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
  if (!Number.isInteger(tileHeight) || tileHeight < 1 || !Number.isInteger(overlap) || overlap < 0 || overlap >= tileHeight) {
    throw new ValidationError('Tile height must be a positive integer and overlap must be between 0 and tile height');
  }
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


/**
 * Expand a clipped composite crop only when a large connected light foreground
 * on a dark, opaque screenshot supplies measurable bounds. Never shrink a crop
 * or change a low-contrast/ambiguous image. Work on a bounded raster, not full MP.
 */
export async function expandClippedCompositeBounds(
  sourceBuffer: Buffer,
  rectangles: Array<{ x: number; y: number; width: number; height: number }>
): Promise<Array<{ x: number; y: number; width: number; height: number }>> {
  if (!rectangles.length) return [];
  const source = sharp(sourceBuffer, { limitInputPixels: MAX_PIXELS_LIMIT });
  const metadata = await source.metadata();
  if (!metadata.width || !metadata.height) return rectangles.map((rect) => ({ ...rect }));
  const { data, info } = await source.resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true })
    .toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const luminance = (index: number) => 0.2126 * data[index * channels] +
    0.7152 * data[index * channels + 1] + 0.0722 * data[index * channels + 2];
  const edge: number[] = [];
  for (let x = 0; x < width; x++) edge.push(luminance(x), luminance((height - 1) * width + x));
  for (let y = 0; y < height; y++) edge.push(luminance(y * width), luminance(y * width + width - 1));
  edge.sort((a, b) => a - b);
  if (edge[Math.floor(edge.length / 2)] > 80) return rectangles.map((rect) => ({ ...rect }));
  const mask = new Uint8Array(width * height);
  for (let index = 0; index < mask.length; index++) {
    if (data[index * channels + 3] >= 250 && luminance(index) >= 150) mask[index] = 1;
  }
  const queue = new Int32Array(mask.length);
  const components: Array<{ x: number; y: number; width: number; height: number }> = [];
  for (let seed = 0; seed < mask.length; seed++) {
    if (!mask[seed]) continue;
    let head = 0, tail = 1;
    queue[0] = seed;
    mask[seed] = 0;
    let left = width, top = height, right = 0, bottom = 0;
    while (head < tail) {
      const index = queue[head++];
      const x = index % width, y = Math.floor(index / width);
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
      const visit = (next: number) => { if (mask[next]) { mask[next] = 0; queue[tail++] = next; } };
      if (x > 0) visit(index - 1);
      if (x + 1 < width) visit(index + 1);
      if (y > 0) visit(index - width);
      if (y + 1 < height) visit(index + width);
    }
    const boxArea = (right - left + 1) * (bottom - top + 1);
    if (tail < mask.length * 0.015 || tail / boxArea < 0.4 || boxArea > mask.length * 0.5) continue;
    const x = Math.max(0, Math.floor(left * metadata.width / width) - 2);
    const y = Math.max(0, Math.floor(top * metadata.height / height) - 2);
    const endX = Math.min(metadata.width, Math.ceil((right + 1) * metadata.width / width) + 2);
    const endY = Math.min(metadata.height, Math.ceil((bottom + 1) * metadata.height / height) + 2);
    components.push({ x, y, width: endX - x, height: endY - y });
  }
  return rectangles.map((rect) => {
    if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0) return { ...rect };
    const candidates = components.filter((box) => {
      const overlap = Math.max(0, Math.min(box.x + box.width, rect.x + rect.width) - Math.max(box.x, rect.x)) *
        Math.max(0, Math.min(box.y + box.height, rect.y + rect.height) - Math.max(box.y, rect.y));
      return overlap >= rect.width * rect.height * 0.2 && box.width >= rect.width * 0.65 &&
        box.height >= rect.height * 0.65 && box.width * box.height <= rect.width * rect.height * 4;
    });
    // Competing components are ambiguous: do not infer which artwork is intended.
    if (candidates.length !== 1) return { ...rect };
    const box = candidates[0];
    const x = Math.min(rect.x, box.x), y = Math.min(rect.y, box.y);
    const endX = Math.max(rect.x + rect.width, box.x + box.width);
    const endY = Math.max(rect.y + rect.height, box.y + box.height);
    return { x, y, width: endX - x, height: endY - y };
  });
}
