/**
 * Upload Routes & HTTP Controller
 * Module Owner: Rakib (Storage & Upload Lead)
 * 
 * Handles multipart file ingestion for:
 * - POST /api/upload
 * - POST /api/v1/upload
 */

import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { UploadService } from '../modules/storage/upload-service.js';
import { StorageError } from '../modules/storage/errors.js';
import { STORAGE_ERROR_CODES, type StorageConfig, DEFAULT_STORAGE_CONFIG } from '../modules/storage/types.js';
import { API_VERSION } from '../contracts/api.js';

export function createUploadRouter(
  uploadService: UploadService,
  config: StorageConfig = DEFAULT_STORAGE_CONFIG
): Router {
  const router = Router();

  // Configure bounded in-memory or bounded temp buffer for multer
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: config.maxFileSizeBytes,
      files: config.maxFilesPerRequest,
    },
  });

  // Accept 'image' or 'file' form field for maximum client compatibility
  const uploadMiddleware = upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'file', maxCount: 1 },
  ]);

  router.post(
    '/',
    (req: Request, res: Response, next: NextFunction): void => {
      uploadMiddleware(req, res, (err: any) => {
        if (err) {
          if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
              res.status(413).json({
                success: false,
                error: {
                  code: STORAGE_ERROR_CODES.FILE_TOO_LARGE,
                  message: `File size exceeds the limit of ${config.maxFileSizeBytes} bytes`,
                  stage: 'upload_validation',
                  retryable: false,
                  timestamp: new Date().toISOString(),
                },
              });
              return;
            }
            if (err.code === 'LIMIT_FILE_COUNT') {
              res.status(400).json({
                success: false,
                error: {
                  code: STORAGE_ERROR_CODES.TOO_MANY_FILES,
                  message: `Exceeded maximum file count of ${config.maxFilesPerRequest}`,
                  stage: 'upload_validation',
                  retryable: false,
                  timestamp: new Date().toISOString(),
                },
              });
              return;
            }
            res.status(400).json({
              success: false,
              error: {
                code: STORAGE_ERROR_CODES.INVALID_REQUEST,
                message: `Upload error: ${err.message}`,
                stage: 'upload_validation',
                retryable: false,
                timestamp: new Date().toISOString(),
              },
            });
            return;
          }
          next(err);
          return;
        }
        next();
      });
    },
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
        const uploadedFile = files?.image?.[0] || files?.file?.[0];

        if (!uploadedFile) {
          res.status(400).json({
            success: false,
            error: {
              code: STORAGE_ERROR_CODES.INVALID_REQUEST,
              message: 'No file uploaded. Expected form field "image" or "file".',
              stage: 'upload_validation',
              retryable: false,
              timestamp: new Date().toISOString(),
            },
          });
          return;
        }

        const projectId = (req.body?.projectId as string) || (req.body?.name as string) || 'default_project';
        const declaredMime = uploadedFile.mimetype;
        const originalName = uploadedFile.originalname;

        const result = await uploadService.handleUpload({
          fileBuffer: uploadedFile.buffer,
          originalFileName: originalName,
          declaredMimeType: declaredMime,
          projectId,
        });

        // 200 OK on idempotent duplicate; 201 Created on fresh asset
        const statusCode = result.isDuplicate ? 200 : 201;

        res.status(statusCode).json({
          success: true,
          data: {
            assetId: result.assetId,
            metadata: result.metadata,
            canvas: result.canvas,
            isDuplicate: result.isDuplicate,
            duplicateOfAssetId: result.duplicateOfAssetId,
            warnings: result.warnings,
            // Also provide composite shape for Client project/job model
            project: {
              id: projectId,
              name: req.body?.name || originalName,
            },
            asset: result.metadata,
          },
          meta: {
            apiVersion: API_VERSION,
            timestamp: new Date().toISOString(),
          },
        });
        return;
      } catch (err: any) {
        if (err instanceof StorageError) {
          res.status(err.httpStatus).json({
            success: false,
            error: {
              code: err.code,
              message: err.message,
              stage: 'upload_validation',
              details: err.details,
              retryable: err.retryable,
              timestamp: err.timestamp,
            },
          });
          return;
        }
        next(err);
      }
    }
  );

  return router;
}
