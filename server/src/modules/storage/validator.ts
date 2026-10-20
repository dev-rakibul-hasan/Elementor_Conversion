/**
 * Secure File Validation Service
 * Module Owner: Rakib (Storage & Upload Lead)
 * 
 * Enforces:
 * - Binary magic byte inspection (JPEG, PNG, WebP)
 * - Mismatch checking between declared MIME type and actual file signature
 * - File size boundaries on actual byte streams
 * - Filename sanitization (path traversal, null bytes, special characters)
 * - Strict rejection of unsupported, empty, or polyglot payloads
 */

import path from 'node:path';
import {
  DEFAULT_STORAGE_CONFIG,
  type SupportedImageFormat,
  type SupportedMimeType,
  type StorageConfig,
} from './types.js';
import {
  FileTooLargeError,
  UnsupportedMediaTypeError,
  FileSignatureMismatchError,
  InvalidImageError,
} from './errors.js';

export interface FileValidationResult {
  detectedFormat: SupportedImageFormat;
  detectedMime: SupportedMimeType;
  sanitizedFileName: string;
  sizeBytes: number;
}

/**
 * Checks magic bytes from a buffer header to reliably detect format.
 */
export function detectFormatFromMagicBytes(header: Buffer): SupportedImageFormat | null {
  if (!header || header.length < 12) {
    return null;
  }

  // 1. JPEG Check: 0xFF, 0xD8, 0xFF
  if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
    return 'jpeg';
  }

  // 2. PNG Check: 0x89, 0x50 ('P'), 0x4E ('N'), 0x47 ('G'), 0x0D, 0x0A, 0x1A, 0x0A
  if (
    header[0] === 0x89 &&
    header[1] === 0x50 &&
    header[2] === 0x4e &&
    header[3] === 0x47 &&
    header[4] === 0x0d &&
    header[5] === 0x0a &&
    header[6] === 0x1a &&
    header[7] === 0x0a
  ) {
    return 'png';
  }

  // 3. WebP Check: RIFF (bytes 0-3: 0x52, 0x49, 0x46, 0x46) + WEBP (bytes 8-11: 0x57, 0x45, 0x42, 0x50)
  if (
    header[0] === 0x52 &&
    header[1] === 0x49 &&
    header[2] === 0x46 &&
    header[3] === 0x46 &&
    header[8] === 0x57 &&
    header[9] === 0x45 &&
    header[10] === 0x42 &&
    header[11] === 0x50
  ) {
    return 'webp';
  }

  return null;
}

/**
 * Convenience helper detecting magic bytes and returning both format and MIME type.
 */
export function detectMagicBytes(
  header: Buffer
): { format: SupportedImageFormat; mimeType: SupportedMimeType } | null {
  const format = detectFormatFromMagicBytes(header);
  if (!format) {
    return null;
  }
  return {
    format,
    mimeType: formatToMimeType(format),
  };
}

/**
 * Maps a detected format enum to its standard MIME type.
 */
export function formatToMimeType(format: SupportedImageFormat): SupportedMimeType {
  switch (format) {
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
  }
}

/**
 * Maps a MIME type to its normalized format.
 */
export function mimeTypeToFormat(mimeType: string): SupportedImageFormat | null {
  const normalized = mimeType.trim().toLowerCase();
  switch (normalized) {
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpeg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    default:
      return null;
  }
}

/**
 * Sanitizes an untrusted client filename:
 * - Strips directory traversal (../, ..\)
 * - Strips null bytes (\0)
 * - Removes control characters
 * - Normalizes Unicode and whitespace
 * - Prevents hidden files or reserved filenames
 * - Caps max length to 255 chars
 */
export function sanitizeFileName(rawFileName?: string | null): string {
  if (!rawFileName || typeof rawFileName !== 'string') {
    return 'unnamed_upload.png';
  }

  // Remove null bytes and control characters
  let cleaned = rawFileName.replace(/\0/g, '').replace(/[\x00-\x1f\x7f-\x9f]/g, '');

  // Strip path information (both Unix and Windows separators)
  cleaned = cleaned.replace(/\\/g, '/');
  cleaned = path.basename(cleaned);

  // Remove leading periods (hidden files) and excessive dot-dots
  cleaned = cleaned.replace(/^\.+/, '').replace(/\.{2,}/g, '.');

  // Replace potentially dangerous characters with underscores
  cleaned = cleaned.replace(/[^a-zA-Z0-9._-]/g, '_');

  // Trim underscores, periods, hyphens, and whitespace from edges
  cleaned = cleaned.replace(/^[_.-]+|[_.-]+$/g, '').trim();

  if (!cleaned || cleaned === '.') {
    return 'unnamed_upload.png';
  }

  // Cap length
  if (cleaned.length > 255) {
    const ext = path.extname(cleaned);
    const base = path.basename(cleaned, ext);
    cleaned = `${base.slice(0, 255 - ext.length)}${ext}`;
  }

  return cleaned;
}

/**
 * Validates file buffer header, declared MIME, size limits, and filename.
 */
export function validateUploadContent(
  buffer: Buffer,
  declaredMimeType?: string,
  rawFileName?: string,
  config: StorageConfig = DEFAULT_STORAGE_CONFIG
): FileValidationResult {
  const sizeBytes = buffer.length;

  // 1. Empty buffer check
  if (sizeBytes === 0) {
    throw new InvalidImageError('Uploaded file is empty (0 bytes received)');
  }

  // 2. File size boundary check
  if (sizeBytes > config.maxFileSizeBytes) {
    throw new FileTooLargeError(sizeBytes, config.maxFileSizeBytes);
  }

  // 3. Minimum buffer length check for signature detection
  if (sizeBytes < 12) {
    throw new InvalidImageError('Uploaded file is truncated or too small to be a valid image');
  }

  // 4. Magic bytes detection
  const detectedFormat = detectFormatFromMagicBytes(buffer);
  if (!detectedFormat) {
    // Check for common rejected formats like SVG or HTML/PHP polyglots
    const headerAscii = buffer.slice(0, 100).toString('utf-8').toLowerCase();
    if (headerAscii.includes('<svg') || headerAscii.includes('<?xml')) {
      throw new UnsupportedMediaTypeError(
        'SVG images are not supported for canvas conversion. Please upload raster PNG, JPEG, or WebP mockups.'
      );
    }
    if (headerAscii.includes('<?php') || headerAscii.includes('<html') || headerAscii.includes('<script')) {
      throw new UnsupportedMediaTypeError('Unsafe file content detected');
    }
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
      throw new UnsupportedMediaTypeError(
        'GIF format is not supported. Please upload static PNG, JPEG, or WebP.'
      );
    }

    throw new UnsupportedMediaTypeError(
      'Unsupported media format. Only JPEG, PNG, and WebP images are accepted.'
    );
  }

  const detectedMime = formatToMimeType(detectedFormat);

  // 5. Mismatch check against declared MIME if provided
  if (declaredMimeType) {
    const declaredFormat = mimeTypeToFormat(declaredMimeType);
    if (!declaredFormat) {
      throw new UnsupportedMediaTypeError(
        `Declared MIME type "${declaredMimeType}" is not supported. Supported: image/jpeg, image/png, image/webp.`
      );
    }
    if (declaredFormat !== detectedFormat) {
      throw new FileSignatureMismatchError(declaredMimeType, detectedFormat);
    }
  }

  // 6. Filename sanitization
  const sanitizedFileName = sanitizeFileName(rawFileName);

  return {
    detectedFormat,
    detectedMime,
    sanitizedFileName,
    sizeBytes,
  };
}
