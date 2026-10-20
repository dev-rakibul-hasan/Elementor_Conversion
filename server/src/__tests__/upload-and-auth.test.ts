import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { app } from '../index.js';
import { signToken } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';

describe('Upload API and Authentication Endpoints', () => {
  let server: http.Server;
  let baseUrl: string;
  let testUserToken: string;
  let testUserId: string;

  const validPngBuffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );

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

    // Create or locate a test user
    const testEmail = `test-upload-${Date.now()}@example.com`;
    const user = await prisma.user.create({
      data: {
        email: testEmail,
        passwordHash: 'dummy-hash-for-testing',
      },
    });
    testUserId = user.id;
    testUserToken = signToken({ id: user.id, email: user.email, role: user.role });
  });

  afterAll(async () => {
    // Wait for in-flight job execution to settle
    await new Promise((r) => setTimeout(r, 600));

    if (testUserId) {
      await prisma.conversionJob.deleteMany({
        where: { project: { userId: testUserId } },
      }).catch(() => {});
      await prisma.asset.deleteMany({
        where: { project: { userId: testUserId } },
      }).catch(() => {});
      await prisma.project.deleteMany({
        where: { userId: testUserId },
      }).catch(() => {});
      await prisma.user.delete({
        where: { id: testUserId },
      }).catch(() => {});
    }

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('GET /api/v1/projects without Authorization header returns 401 UNAUTHORIZED', async () => {
    const res = await fetch(`${baseUrl}/api/v1/projects`);
    expect(res.status).toBe(401);

    const body = (await res.json()) as any;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(body.error.message).toContain('Authorization header missing');
  });

  it('GET /api/v1/projects with malformed Authorization header returns 401 UNAUTHORIZED', async () => {
    const res = await fetch(`${baseUrl}/api/v1/projects`, {
      headers: { Authorization: 'Basic not-a-bearer-token' },
    });
    expect(res.status).toBe(401);

    const body = (await res.json()) as any;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(body.error.message).toContain('Malformed authorization header');
  });

  it('POST /api/v1/auth/dev-login generates a valid token and user session', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/dev-login`, {
      method: 'POST',
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.token).toBeDefined();
    expect(body.data.user.email).toBe('developer@elementor.local');
  });

  it('GET /api/v1/auth/me returns the authenticated user data', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${testUserToken}` },
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(testUserId);
    expect(body.data.storageQuota).toBeDefined();
  });

  it('POST /api/v1/upload without Authorization header returns 401 UNAUTHORIZED', async () => {
    const formData = new FormData();
    const blob = new Blob([validPngBuffer], { type: 'image/png' });
    formData.append('image', blob, 'design.png');

    const res = await fetch(`${baseUrl}/api/v1/upload`, {
      method: 'POST',
      body: formData,
    });
    expect(res.status).toBe(401);

    const body = (await res.json()) as any;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('POST /api/v1/upload with auth but missing file returns 400 validation error', async () => {
    const formData = new FormData();
    formData.append('name', 'Missing File Project');

    const res = await fetch(`${baseUrl}/api/v1/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${testUserToken}` },
      body: formData,
    });
    expect(res.status).toBe(400);

    const body = (await res.json()) as any;
    expect(body.success).toBe(false);
    expect(body.error.message).toContain('No image file provided');
  });

  let createdProjectId: string;

  it('POST /api/v1/upload creates project, asset, and queued conversion job', async () => {
    const formData = new FormData();
    const blob = new Blob([validPngBuffer], { type: 'image/png' });
    formData.append('image', blob, 'landing-page.png');
    formData.append('name', 'SaaS Hero Page');

    const res = await fetch(`${baseUrl}/api/v1/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${testUserToken}` },
      body: formData,
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as any;

    expect(body.success).toBe(true);
    expect(body.data.project).toBeDefined();
    expect(body.data.project.name).toBe('SaaS Hero Page');
    expect(body.data.job).toBeDefined();
    expect(body.data.job.status).toBe('queued');
    expect(body.data.asset).toBeDefined();
    expect(body.data.asset.fileName).toBe('landing-page.png');
    expect(body.data.jobId).toBe(body.data.job.id);
    expect(body.data.assetId).toBe(body.data.asset.id);

    createdProjectId = body.data.project.id;
  });

  it('GET /api/v1/projects lists projects for authenticated user', async () => {
    const res = await fetch(`${baseUrl}/api/v1/projects`, {
      headers: { Authorization: `Bearer ${testUserToken}` },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;

    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    const found = body.data.find((p: any) => p.id === createdProjectId);
    expect(found).toBeDefined();
    expect(found.name).toBe('SaaS Hero Page');
  });

  it('POST /api/v1/projects/:projectId/upload uploads additional asset to existing project', async () => {
    const formData = new FormData();
    const blob = new Blob([validPngBuffer], { type: 'image/png' });
    formData.append('image', blob, 'variant-b.png');

    const res = await fetch(`${baseUrl}/api/v1/projects/${createdProjectId}/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${testUserToken}` },
      body: formData,
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as any;

    expect(body.success).toBe(true);
    expect(body.data.project.id).toBe(createdProjectId);
    expect(body.data.asset.fileName).toBe('variant-b.png');
    expect(body.data.job.status).toBe('queued');
  });
});
