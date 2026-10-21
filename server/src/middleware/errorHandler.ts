import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import multer from 'multer';
import { AppError } from '../lib/errors.js';
import { createRequestLogger } from '../lib/logger.js';

export const errorHandler: ErrorRequestHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  if (res.headersSent) { _next(err); return; }
  const requestId = (req.id || (req.headers['x-request-id'] as string) || 'unknown') as string;
  const reqLogger = createRequestLogger(requestId, {
    method: req.method,
    path: req.path,
    ip: req.ip,
  });

  const bodyError = err as Error & { type?: string; status?: number };
  if (bodyError.type === 'entity.parse.failed' || bodyError.type === 'entity.too.large' || err instanceof URIError) {
    const tooLarge = bodyError.type === 'entity.too.large';
    res.status(tooLarge ? 413 : 400).json({ success: false, error: {
      code: tooLarge ? 'PAYLOAD_TOO_LARGE' : 'INVALID_REQUEST',
      message: tooLarge ? 'Request body exceeds the maximum allowed size' : 'Malformed request data', requestId,
    } });
    return;
  }

  // Handle custom AppError and subclasses
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      reqLogger.error(
        { err: { name: err.name, message: err.message, stack: err.stack, details: err.details } },
        `Application error [${err.code}]: ${err.message}`
      );
    } else {
      reqLogger.warn(
        { details: err.details, code: err.code },
        `Client error [${err.code}]: ${err.message}`
      );
    }

    res.status(err.statusCode).json(err.toJSON(requestId));
    return;
  }

  // Handle Zod schema validation errors
  if (err instanceof ZodError) {
    reqLogger.warn({ issues: err.issues }, 'Zod validation error');
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: err.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
        requestId,
      },
    });
    return;
  }

  // Handle Multer upload errors
  if (err instanceof multer.MulterError) {
    reqLogger.warn({ multerError: err.code }, `Multer upload error: ${err.message}`);
    const statusCode = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    res.status(statusCode).json({
      success: false,
      error: {
        code: 'UPLOAD_ERROR',
        message:
          err.code === 'LIMIT_FILE_SIZE'
            ? 'The uploaded file exceeds the maximum allowed size'
            : err.message,
        details: { code: err.code, field: err.field },
        requestId,
      },
    });
    return;
  }

  // Catch-all for unexpected unhandled errors
  reqLogger.error(
    {
      err: {
        name: err.name,
        message: err.message,
        stack: err.stack,
      },
    },
    'Unhandled server exception'
  );

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected internal error occurred',
      requestId,
    },
  });
};
