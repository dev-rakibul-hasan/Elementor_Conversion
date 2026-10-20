/**
 * Storage & Upload Error Hierarchy
 * Module Owner: Rakib (Storage & Upload Lead)
 * 
 * Provides structured errors that map to standard HTTP status codes
 * and canonical ApiErrorDetail envelopes.
 */

import { STORAGE_ERROR_CODES, type StorageErrorCode } from './types.js';

export class StorageError extends Error {
  public readonly code: StorageErrorCode;
  public readonly httpStatus: number;
  public readonly retryable: boolean;
  public readonly details?: unknown;
  public readonly timestamp: string;

  constructor(
    message: string,
    options: {
      code: StorageErrorCode;
      httpStatus?: number;
      retryable?: boolean;
      details?: unknown;
      cause?: Error;
    }
  ) {
    super(message, { cause: options.cause });
    this.name = 'StorageError';
    this.code = options.code;
    this.httpStatus = options.httpStatus ?? 400;
    this.retryable = options.retryable ?? false;
    this.details = options.details;
    this.timestamp = new Date().toISOString();
  }
}

export class FileTooLargeError extends StorageError {
  constructor(sizeBytes: number, maxBytes: number) {
    super(`File size (${sizeBytes} bytes) exceeds maximum limit of ${maxBytes} bytes`, {
      code: STORAGE_ERROR_CODES.FILE_TOO_LARGE,
      httpStatus: 413,
      retryable: false,
      details: { sizeBytes, maxBytes },
    });
    this.name = 'FileTooLargeError';
  }
}

export class UnsupportedMediaTypeError extends StorageError {
  constructor(message: string, details?: unknown) {
    super(message, {
      code: STORAGE_ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
      httpStatus: 415,
      retryable: false,
      details,
    });
    this.name = 'UnsupportedMediaTypeError';
  }
}

export class FileSignatureMismatchError extends StorageError {
  constructor(declaredMime: string, detectedFormat: string | null) {
    super(
      `File signature mismatch: declared MIME "${declaredMime}" does not match detected format "${detectedFormat || 'unknown'}"`,
      {
        code: STORAGE_ERROR_CODES.FILE_SIGNATURE_MISMATCH,
        httpStatus: 415,
        retryable: false,
        details: { declaredMime, detectedFormat },
      }
    );
    this.name = 'FileSignatureMismatchError';
  }
}

export class InvalidImageError extends StorageError {
  constructor(message: string, details?: unknown, cause?: Error) {
    super(message, {
      code: STORAGE_ERROR_CODES.INVALID_IMAGE,
      httpStatus: 422,
      retryable: false,
      details,
      cause,
    });
    this.name = 'InvalidImageError';
  }
}

export class ImageDecodeError extends StorageError {
  constructor(message: string, cause?: Error) {
    super(`Image decode failed: ${message}`, {
      code: STORAGE_ERROR_CODES.IMAGE_DECODE_FAILED,
      httpStatus: 422,
      retryable: false,
      cause,
    });
    this.name = 'ImageDecodeError';
  }
}

export class ImageDimensionsExceededError extends StorageError {
  constructor(width: number, height: number, maxDimension: number) {
    super(
      `Image dimensions (${width}x${height}) exceed maximum allowed dimension of ${maxDimension}px`,
      {
        code: STORAGE_ERROR_CODES.IMAGE_DIMENSIONS_EXCEEDED,
        httpStatus: 422,
        retryable: false,
        details: { width, height, maxDimension },
      }
    );
    this.name = 'ImageDimensionsExceededError';
  }
}

export class ImagePixelLimitExceededError extends StorageError {
  constructor(totalPixels: number, maxPixels: number) {
    super(
      `Image pixel count (${totalPixels.toLocaleString()} pixels) exceeds decompression limit of ${maxPixels.toLocaleString()} pixels`,
      {
        code: STORAGE_ERROR_CODES.IMAGE_PIXEL_LIMIT_EXCEEDED,
        httpStatus: 422,
        retryable: false,
        details: { totalPixels, maxPixels },
      }
    );
    this.name = 'ImagePixelLimitExceededError';
  }
}

export class AnimatedImageNotSupportedError extends StorageError {
  constructor(frameCount: number) {
    super(
      `Animated multi-frame images are not supported (${frameCount} frames detected). Please upload a static image.`,
      {
        code: STORAGE_ERROR_CODES.ANIMATED_IMAGE_NOT_SUPPORTED,
        httpStatus: 422,
        retryable: false,
        details: { frameCount },
      }
    );
    this.name = 'AnimatedImageNotSupportedError';
  }
}

export class StorageWriteError extends StorageError {
  constructor(message: string, cause?: Error) {
    super(`Storage operation failed: ${message}`, {
      code: STORAGE_ERROR_CODES.STORAGE_FAILED,
      httpStatus: 500,
      retryable: true,
      cause,
    });
    this.name = 'StorageWriteError';
  }
}
