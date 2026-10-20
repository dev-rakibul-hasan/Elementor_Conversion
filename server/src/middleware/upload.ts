import multer from 'multer';
import path from 'path';
import { Request, Response, NextFunction } from 'express';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import { env } from '../config/index.js';
import { ValidationError } from '../lib/errors.js';

const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg']);
const ALLOWED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg']);

// Use memory storage for intake, in-memory validation, and magic byte checking
const storage = multer.memoryStorage();

export const uploadMiddleware = multer({
  storage,
  limits: {
    fileSize: env.UPLOAD_MAX_BYTES,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return cb(
        new ValidationError(
          `Invalid file extension '${ext}'. Only .png, .jpg, and .jpeg are supported.`
        )
      );
    }

    if (!ALLOWED_MIME_TYPES.has(file.mimetype.toLowerCase())) {
      return cb(
        new ValidationError(
          `Invalid MIME type '${file.mimetype}'. Only image/png and image/jpeg are supported.`
        )
      );
    }

    cb(null, true);
  },
});

export interface ValidatedImageFile {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  width: number;
  height: number;
  sha256: string;
}

/**
 * Validates uploaded file magic bytes, checks for decompression bombs,
 * and extracts validated image dimensions using sharp and file-type.
 */
export async function validateImageBuffer(
  file: Express.Multer.File
): Promise<ValidatedImageFile> {
  if (!file || !file.buffer || file.buffer.length === 0) {
    throw new ValidationError('No file content received');
  }

  // 1. Inspect actual file magic bytes
  const detectedType = await fileTypeFromBuffer(file.buffer);
  if (!detectedType || !ALLOWED_MIME_TYPES.has(detectedType.mime)) {
    throw new ValidationError(
      `File signature does not match allowed image formats. Detected: ${
        detectedType?.mime ?? 'unknown binary data'
      }`
    );
  }

  // 2. Compute SHA-256 for integrity and deduplication
  const crypto = await import('crypto');
  const sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');

  // 3. Inspect image structure with Sharp (with decompression bomb limit protection)
  try {
    const image = sharp(file.buffer, {
      failOnError: true,
      limitInputPixels: 268402689, // ~268 Megapixels limit
    });
    const metadata = await image.metadata();

    if (!metadata.width || !metadata.height) {
      throw new ValidationError('Could not determine image dimensions');
    }

    // Safety checks against pathological dimensions
    if (metadata.width > 20000 || metadata.height > 60000) {
      throw new ValidationError(
        `Image dimensions ${metadata.width}x${metadata.height} exceed maximum permitted size`
      );
    }

    return {
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: detectedType.mime,
      sizeBytes: file.buffer.length,
      width: metadata.width,
      height: metadata.height,
      sha256,
    };
  } catch (err: unknown) {
    if (err instanceof ValidationError) throw err;
    const msg = err instanceof Error ? err.message : 'Corrupt image';
    throw new ValidationError(`Failed to decode image data: ${msg}`);
  }
}

/**
 * Express middleware to validate the uploaded image in memory.
 * Attaches `req.validatedImage` to Request.
 */
declare global {
  namespace Express {
    interface Request {
      validatedImage?: ValidatedImageFile;
    }
  }
}

export function validateUploadedImage(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  if (!req.file) {
    return next(new ValidationError('No image file uploaded'));
  }

  validateImageBuffer(req.file)
    .then((validated) => {
      req.validatedImage = validated;
      next();
    })
    .catch(next);
}
