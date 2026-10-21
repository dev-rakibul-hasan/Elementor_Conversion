import { describe, it, expect } from 'vitest';
import { Request, Response } from 'express';
import { requireAuth, optionalAuth, signToken, getAuthenticatedUserId } from './auth.js';
import { AuthError } from '../lib/errors.js';

describe('Auth Middleware', () => {
  const userPayload = {
    id: 'user-uuid-1234',
    email: 'engineer@braingig.com',
    role: 'USER',
  };

  it('signs and verifies a valid JWT Bearer token', () => {
    const token = signToken(userPayload);
    const req = {
      headers: {
        authorization: `Bearer ${token}`,
      },
    } as unknown as Request;

    const res = {} as Response;
    let nextCalled = false;
    let capturedErr: unknown = null;

    requireAuth(req, res, (err) => {
      nextCalled = true;
      capturedErr = err;
    });

    expect(nextCalled).toBe(true);
    expect(capturedErr).toBeUndefined();
    expect(req.user).toBeDefined();
    expect(req.user?.id).toBe(userPayload.id);
    expect(req.user?.email).toBe(userPayload.email);
  });

  it('rejects missing Authorization header', () => {
    const req = { headers: {} } as Request;
    const res = {} as Response;
    let capturedErr: unknown = null;

    requireAuth(req, res, (err) => {
      capturedErr = err;
    });

    expect(capturedErr).toBeInstanceOf(AuthError);
    expect((capturedErr as AuthError).statusCode).toBe(401);
  });

  it('rejects malformed authorization header', () => {
    const req = {
      headers: { authorization: 'Basic 123456' },
    } as Request;
    const res = {} as Response;
    let capturedErr: unknown = null;

    requireAuth(req, res, (err) => {
      capturedErr = err;
    });

    expect(capturedErr).toBeInstanceOf(AuthError);
    expect((capturedErr as AuthError).message).toContain('Malformed authorization header');
  });

  it('optionalAuth attaches user if valid token present and passes if absent', () => {
    // 1. Without token
    const reqWithout = { headers: {} } as Request;
    optionalAuth(reqWithout, {} as Response, () => {});
    expect(reqWithout.user).toBeUndefined();

    // 2. With valid token
    const token = signToken(userPayload);
    const reqWith = {
      headers: { authorization: `Bearer ${token}` },
    } as unknown as Request;
    optionalAuth(reqWith, {} as Response, () => {});
    expect(reqWith.user?.id).toBe(userPayload.id);
  });

  it('getAuthenticatedUserId extracts user id or throws AuthError', () => {
    const validReq = { user: { id: 'user-1', email: 'test@example.com' } } as unknown as Request;
    expect(getAuthenticatedUserId(validReq)).toBe('user-1');

    const validReqWithUserId = { user: { userId: 'user-2', email: 'test@example.com' } } as unknown as Request;
    expect(getAuthenticatedUserId(validReqWithUserId)).toBe('user-2');

    const emptyReq = {} as Request;
    expect(() => getAuthenticatedUserId(emptyReq)).toThrow(AuthError);
  });
});
