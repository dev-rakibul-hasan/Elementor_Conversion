import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/index.js';
import { AuthError } from '../lib/errors.js';

export interface AuthUser {
  id: string;
  userId?: string;
  email: string;
  role?: string;
  [key: string]: unknown;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * Middleware that requires a valid JWT Bearer token in the Authorization header.
 * Attaches the verified user payload to `req.user`.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return next(
      new AuthError('Authorization header missing. Expected: Bearer <token>', 401, 'UNAUTHORIZED')
    );
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return next(
      new AuthError('Malformed authorization header. Format must be: Bearer <token>', 401, 'UNAUTHORIZED')
    );
  }

  const token = parts[1];

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as any;
    const uid = decoded.id || decoded.userId;
    if (!uid) {
      return next(new AuthError('Invalid token payload: missing user identifier', 401, 'UNAUTHORIZED'));
    }
    const normalizedUser: AuthUser = {
      ...decoded,
      id: uid,
      userId: uid,
      email: decoded.email,
      role: decoded.role,
    };
    req.user = normalizedUser;
    return next();
  } catch (err: unknown) {
    if (err instanceof jwt.TokenExpiredError) {
      return next(new AuthError('Authentication token has expired', 401, 'UNAUTHORIZED'));
    }
    return next(new AuthError('Invalid authentication token', 401, 'UNAUTHORIZED'));
  }
}

/**
 * Middleware that optionally checks and decodes a JWT Bearer token if present.
 * Does not reject requests without a token.
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return next();
  }

  const parts = authHeader.split(' ');
  if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
    try {
      const decoded = jwt.verify(parts[1], env.JWT_SECRET) as any;
      const uid = decoded.id || decoded.userId;
      if (uid) {
        req.user = {
          ...decoded,
          id: uid,
          userId: uid,
          email: decoded.email,
          role: decoded.role,
        };
      }
    } catch {
      // Ignore token decoding error on optional routes
    }
  }
  return next();
}

/**
 * Helper to generate a JWT token for a given user payload.
 */
export function signToken(
  payload: { id?: string; userId?: string; email: string; role?: string; [key: string]: unknown },
  expiresIn: string | number = '7d'
): string {
  const uid = payload.id || payload.userId;
  const tokenPayload = {
    ...payload,
    id: uid,
    userId: uid,
  };
  return jwt.sign(tokenPayload, env.JWT_SECRET, { expiresIn } as jwt.SignOptions);
}
