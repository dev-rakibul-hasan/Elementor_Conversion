import { describe, it, expect } from 'vitest';
import { Request, Response } from 'express';
import { requestId } from './requestId.js';

describe('RequestId Middleware', () => {
  it('generates a new uuid if X-Request-Id header is absent', () => {
    const req = { headers: {} } as unknown as Request;
    const headersSet: Record<string, string> = {};
    const res = {
      setHeader: (name: string, value: string) => {
        headersSet[name] = value;
      },
    } as unknown as Response;

    let nextCalled = false;
    requestId(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(req.id).toBeDefined();
    expect(typeof req.id).toBe('string');
    expect(req.id?.length).toBeGreaterThan(10);
    expect(headersSet['X-Request-Id']).toBe(req.id);
  });

  it('preserves existing X-Request-Id from upstream client', () => {
    const customId = 'upstream-client-trace-12345';
    const req = { headers: { 'x-request-id': customId } } as unknown as Request;
    const headersSet: Record<string, string> = {};
    const res = {
      setHeader: (name: string, value: string) => {
        headersSet[name] = value;
      },
    } as unknown as Response;

    requestId(req, res, () => {});

    expect(req.id).toBe(customId);
    expect(headersSet['X-Request-Id']).toBe(customId);
  });
});
