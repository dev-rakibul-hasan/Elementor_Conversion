import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { app } from './index.js';

describe('Express API Server Endpoints', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address();
        if (typeof address === 'object' && address !== null) {
          baseUrl = `http://127.0.0.1:${address.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('GET /api/v1/health returns 200 with status ok and uptime', async () => {
    const res = await fetch(`${baseUrl}/api/v1/health`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, unknown>;
    expect(body.status).toBe('ok');
    expect(typeof body.uptime).toBe('number');
    expect(res.headers.get('x-request-id')).toBeTruthy();
  });

  it('GET /api/v1/diagnostic returns safe config data', async () => {
    const res = await fetch(`${baseUrl}/api/v1/diagnostic`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, unknown>;
    expect(body.status).toBe('ok');
    expect(body.storage).toBeDefined();
    expect(body.ai).toBeDefined();
  });

  it('GET /api/v1/non-existent returns 404 with structured error', async () => {
    const res = await fetch(`${baseUrl}/api/v1/does-not-exist`);
    expect(res.status).toBe(404);

    const body = (await res.json()) as Record<string, unknown>;
    expect(body.success).toBe(false);
    expect((body.error as Record<string, unknown>).code).toBe('ROUTE_NOT_FOUND');
    expect(res.headers.get('x-request-id')).toBeTruthy();
  });
});
