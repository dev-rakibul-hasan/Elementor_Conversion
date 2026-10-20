/**
 * Storage, Upload, and Canvas Domain Types
 * Module Owner: Rakib (Storage & Upload Lead)
 * 
 * Defines strict TypeScript contracts for:
 * - Upload requests, configuration limits, and MIME allowlists
 * - Validated image metadata and privacy-sanitized attributes
 * - Duplicate detection results and tenancy scopes
 * - Initial isolated canvas representation
 * - Reusable image-processing options
 * - Unified storage error taxonomy
 */

import type { DIRCanvasBounds } from '../dir/types.js';

// ─── MIME & Format Types ─────────────────────────────────────────────

export const SUPPORTED_IMAGE_FORMATS = ['jpeg', 'png', 'webp'] as const;
export type SupportedImageFormat = (typeof SUPPORTED_IMAGE_FORMATS)[number];

export const SUPPORTED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;
export type SupportedMimeType = (typeof SUPPORTED_MIME_TYPES)[number];

// ─── Upload Configuration & Limits ───────────────────────────────────

export interface StorageConfig {
  /** Root directory for persisted files. Defaults to './storage/uploads'. */
  storageDir: string;
  /** Directory for bounded temporary files during processing. Defaults to './storage/tmp'. */
  tempDir: string;
  /** Maximum allowed upload size in bytes. Default: 15 MiB (15 * 1024 * 1024). */
  maxFileSizeBytes: number;
  /** Maximum total upload size for multi-file requests. Default: 30 MiB. */
  maxTotalSizeBytes: number;
  /** Maximum number of files per request. Default: 1 for static image pipeline. */
  maxFilesPerRequest: number;
  /** Maximum decoded pixel count (decompression bomb guard). Default: 40 MP (40,000,000 pixels). */
  maxDecodedPixels: number;
  /** Maximum allowed width or height in pixels. Default: 12,000 pixels. */
  maxDimensionPixels: number;
  /** Maximum allowed frames (1 for static images). Default: 1. */
  maxFrames: number;
  /** Timeout for image processing operations in milliseconds. Default: 30,000ms. */
  processingTimeoutMs: number;
}

export const DEFAULT_STORAGE_CONFIG: Readonly<StorageConfig> = {
  storageDir: './storage/uploads',
  tempDir: './storage/tmp',
  maxFileSizeBytes: 15 * 1024 * 1024, // 15 MiB
  maxTotalSizeBytes: 30 * 1024 * 1024, // 30 MiB
  maxFilesPerRequest: 5,
  maxDecodedPixels: 40_000_000, // 40 MP
  maxDimensionPixels: 12_000,
  maxFrames: 1,
  processingTimeoutMs: 30_000,
};

// ─── Validated Image Metadata ────────────────────────────────────────

export interface ValidatedImageMetadata {
  /** Internal stable asset identifier (UUID). */
  id: string;
  /** Original client-provided filename for safe display only. */
  originalFileName: string;
  /** Sanitized filename without path traversal or unsafe characters. */
  sanitizedFileName: string;
  /** Verified and detected MIME type based on binary signature. */
  mimeType: SupportedMimeType;
  /** Normalized image format enum. */
  format: SupportedImageFormat;
  /** Actual received file size in bytes. */
  sizeBytes: number;
  /** Authoritative SHA-256 digest computed from the raw uploaded bytes. */
  sha256: string;
  /** Decoded pixel width prior to any orientation normalization. */
  width: number;
  /** Decoded pixel height prior to any orientation normalization. */
  height: number;
  /** Normalized display width after EXIF orientation adjustments. */
  normalizedWidth: number;
  /** Normalized display height after EXIF orientation adjustments. */
  normalizedHeight: number;
  /** Aspect ratio calculated from normalized dimensions (width / height). */
  aspectRatio: number;
  /** Number of color channels (e.g. 3 for RGB, 4 for RGBA). */
  channels: number;
  /** Whether the image contains an alpha transparency channel. */
  hasAlpha: boolean;
  /** Color space mode if available (e.g. 'srgb', 'cmyk', 'unknown'). */
  colorSpace: string;
  /** Original EXIF orientation tag (1-8) if present in metadata. */
  exifOrientation: number | null;
  /** Whether orientation normalization (auto-rotation) was performed. */
  isOrientationNormalized: boolean;
  /** Number of frames detected in the container (1 for static images). */
  frameCount: number;
  /** Safe relative storage path within the storage provider. */
  storagePath: string;
  /** Active storage provider identifier. */
  storageProvider: 'local';
  /** ISO timestamp when the asset was validated and saved. */
  createdAt: string;
  /** Nonfatal warnings encountered during optional metadata extraction. */
  warnings: string[];
}

// ─── Canvas Isolation Models ─────────────────────────────────────────

export interface CanvasTransform {
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

export interface IsolatedCanvasState {
  /** Unique canvas session identifier. */
  canvasId: string;
  /** Reference to the underlying validated source asset. */
  sourceAssetId: string;
  /** Canvas viewport pixel width (matches normalized image width). */
  canvasWidth: number;
  /** Canvas viewport pixel height (matches normalized image height). */
  canvasHeight: number;
  /** Initial display width within the conversion coordinate system. */
  displayWidth: number;
  /** Initial display height within the conversion coordinate system. */
  displayHeight: number;
  /** Initial identity or fit transform. */
  transform: CanvasTransform;
  /** Source aspect ratio. */
  aspectRatio: number;
  /** Optional background and bounds metadata conforming to canonical DIR. */
  canvasBounds?: DIRCanvasBounds;
  /** Initialization status. */
  status: 'initialized' | 'processing' | 'ready';
  /** Timestamp of canvas isolation. */
  initializedAt: string;
  /** Nonfatal warnings during isolation. */
  warnings: string[];
}

// ─── Deduplication Models ─────────────────────────────────────────────

export interface DuplicateLookupResult {
  isDuplicate: boolean;
  existingAsset?: ValidatedImageMetadata;
  scope: string;
}

// ─── Public Upload Result Contract ───────────────────────────────────

export interface UploadResult {
  assetId: string;
  metadata: ValidatedImageMetadata;
  isDuplicate: boolean;
  duplicateOfAssetId?: string;
  canvas: IsolatedCanvasState;
  warnings: string[];
}

// ─── Error Taxonomy ──────────────────────────────────────────────────

export const STORAGE_ERROR_CODES = {
  INVALID_REQUEST: 'INVALID_REQUEST',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  REQUEST_TOO_LARGE: 'REQUEST_TOO_LARGE',
  TOO_MANY_FILES: 'TOO_MANY_FILES',
  UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',
  FILE_SIGNATURE_MISMATCH: 'FILE_SIGNATURE_MISMATCH',
  INVALID_IMAGE: 'INVALID_IMAGE',
  IMAGE_DECODE_FAILED: 'IMAGE_DECODE_FAILED',
  IMAGE_DIMENSIONS_EXCEEDED: 'IMAGE_DIMENSIONS_EXCEEDED',
  IMAGE_PIXEL_LIMIT_EXCEEDED: 'IMAGE_PIXEL_LIMIT_EXCEEDED',
  ANIMATED_IMAGE_NOT_SUPPORTED: 'ANIMATED_IMAGE_NOT_SUPPORTED',
  DUPLICATE_ASSET: 'DUPLICATE_ASSET',
  STORAGE_FAILED: 'STORAGE_FAILED',
  METADATA_EXTRACTION_FAILED: 'METADATA_EXTRACTION_FAILED',
  IMAGE_PROCESSING_FAILED: 'IMAGE_PROCESSING_FAILED',
  CANVAS_INITIALIZATION_FAILED: 'CANVAS_INITIALIZATION_FAILED',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type StorageErrorCode = (typeof STORAGE_ERROR_CODES)[keyof typeof STORAGE_ERROR_CODES];
