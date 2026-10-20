import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

declare global {
  namespace Express {
    interface Request {
      id?: string;
    }
  }
}

/**
 * Middleware that ensures every incoming HTTP request has a unique request ID.
 * Uses the existing X-Request-Id header if provided, otherwise generates a UUID v4.
 * Attaches the ID to `req.id` and the `X-Request-Id` response header.
 */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incomingId = req.headers['x-request-id'];
  const id = typeof incomingId === 'string' && incomingId.trim().length > 0
    ? incomingId.trim()
    : uuidv4();

  req.id = id;
  res.setHeader('X-Request-Id', id);
  next();
}

export default requestId;
