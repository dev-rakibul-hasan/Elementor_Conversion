import { describe, it, expect, vi } from 'vitest';
import { Request, Response } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { errorHandler } from './errorHandler.js';
import { NotFoundError } from '../lib/errors.js';

describe('Error Handler Middleware', () => {
  const mockResponse = () => {
    const res: Partial<Response> = {};
    let status = 200;
    let jsonBody: unknown = null;

    res.status = vi.fn().mockImplementation((code: number) => {
      status = code;
      return res;
    });

    res.json = vi.fn().mockImplementation((body: unknown) => {
      jsonBody = body;
      return res;
    });

    return {
      res: res as Response,
      getStatus: () => status,
      getBody: () => jsonBody,
    };
  };

  it('handles AppError and subclasses with correct statusCode and code', () => {
    const { res, getStatus, getBody } = mockResponse();
    const req = { id: 'test-req-123', headers: {}, method: 'GET', path: '/test' } as Request;
    const err = new NotFoundError('Asset', 'asset-456');

    errorHandler(err, req, res, () => {});

    expect(getStatus()).toBe(404);
    const body = getBody() as Record<string, unknown>;
    expect((body.error as Record<string, unknown>).code).toBe('NOT_FOUND');
    expect((body.error as Record<string, unknown>).requestId).toBe('test-req-123');
  });

  it('handles ZodError as 400 VALIDATION_ERROR with structured issue details', () => {
    const schema = z.object({ email: z.string().email() });
    const parsed = schema.safeParse({ email: 'not-an-email' });
    expect(parsed.success).toBe(false);

    if (!parsed.success) {
      const { res, getStatus, getBody } = mockResponse();
      const req = { id: 'test-req-zod', headers: {}, method: 'POST', path: '/submit' } as Request;

      errorHandler(parsed.error, req, res, () => {});

      expect(getStatus()).toBe(400);
      const body = getBody() as Record<string, unknown>;
      expect((body.error as Record<string, unknown>).code).toBe('VALIDATION_ERROR');
      expect((body.error as Record<string, unknown>).requestId).toBe('test-req-zod');
    }
  });

  it('handles MulterError LIMIT_FILE_SIZE with 413 code', () => {
    const { res, getStatus, getBody } = mockResponse();
    const req = { id: 'test-req-multer', headers: {}, method: 'POST', path: '/upload' } as Request;
    const multerErr = new multer.MulterError('LIMIT_FILE_SIZE');

    errorHandler(multerErr, req, res, () => {});

    expect(getStatus()).toBe(413);
    const body = getBody() as Record<string, unknown>;
    expect((body.error as Record<string, unknown>).code).toBe('UPLOAD_ERROR');
  });

  it('handles unexpected generic error safely as 500 without leaking stack trace', () => {
    const { res, getStatus, getBody } = mockResponse();
    const req = { id: 'test-req-unexpected', headers: {}, method: 'GET', path: '/crash' } as Request;
    const genericErr = new Error('Database password was incorrect in connection string');

    errorHandler(genericErr, req, res, () => {});

    expect(getStatus()).toBe(500);
    const body = getBody() as Record<string, unknown>;
    expect((body.error as Record<string, unknown>).code).toBe('INTERNAL_SERVER_ERROR');
    expect((body.error as Record<string, unknown>).message).toBe('An unexpected internal error occurred');
    expect(JSON.stringify(body)).not.toContain('Database password');
  });
});
