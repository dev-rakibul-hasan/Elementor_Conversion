import * as storageFactory from '../modules/storage/factory.js';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { Server } from 'node:http';
import sharp from 'sharp';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import { signToken } from '../middleware/auth.js';
import { getStorage } from '../modules/storage/factory.js';
import { recordGeneratedAsset } from '../modules/storage/accounting.js';
import { ConversionWorker } from '../worker.js';
import { ConversionOrchestrator } from '../modules/conversion/orchestrator.js';
import { MCPPublisher } from '../modules/mcp/publisher.js';
import { encrypt } from '../modules/security/encryption.js';
import { env } from '../config/index.js';

// This suite must never use the application schema; run scripts/test-isolated.mjs.
describe.runIf(process.env.PIPELINE_ISOLATED_TESTS === 'true')('Pipeline fixes with isolated PostgreSQL', () => {
  let server: Server, base: string, userId: string, projectId: string, token: string, image: Buffer;
  const headers = () => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
  const post = (path: string, body: unknown = {}) => fetch(`${base}/api/v1${path}`, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
  beforeAll(async () => {
    const schema = await prisma.$queryRaw<Array<{ current_schema: string }>>`SELECT current_schema()`;
    if (!/^pipeline_test_[a-f0-9]{32}$/.test(schema[0].current_schema)) throw new Error('Integration tests require an isolated test schema');
    const user = await prisma.user.create({ data: { email: `pipeline-fixes-${Date.now()}@test.local`, passwordHash: 'test-only' } });
    userId = user.id;
    token = signToken({ id: userId, email: user.email, role: user.role });
    image = await sharp({ create: { width: 64, height: 64, channels: 4, background: '#ff0000' } }).png().toBuffer();
    server = app.listen(0);
    await new Promise<void>((resolve) => server.on('listening', resolve));
    base = `http://127.0.0.1:${(server.address() as any).port}`;
  });
  beforeEach(async () => {
    vi.restoreAllMocks();
    await prisma.project.deleteMany({ where: { userId } });
    await prisma.user.update({ where: { id: userId }, data: { storageQuota: BigInt(1000000), usedStorage: BigInt(0) } });
    projectId = (await prisma.project.create({ data: { userId, name: 'Regression project' } })).id;
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    if (userId) await prisma.user.delete({ where: { id: userId } });
  });
  const upload = async (description = '', targetProject = projectId) => {
    const form = new FormData(); form.append('image', new Blob([new Uint8Array(image)], { type: 'image/png' }), 'source.png');
    form.append('projectId', targetProject); form.append('description', description);
    return fetch(`${base}/api/v1/upload`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  };

  it('atomically enforces each user quota across concurrent uploads and rolls back rejected files', async () => {
    await prisma.user.update({ where: { id: userId }, data: { storageQuota: BigInt(image.length) } });
    const other = await prisma.project.create({ data: { userId, name: 'Concurrent project' } });
    const results = await Promise.all([upload(), upload('', other.id)]);
    expect(results.map((res) => res.status).sort()).toEqual([201, 429]);
    const assets = await prisma.asset.findMany({ where: { project: { userId } } });
    expect(assets).toHaveLength(1);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).usedStorage).toBe(BigInt(image.length));
  });

  it('records B2 as the asset backend and serves its image through the client storage URL', async () => {
    const previous = env.STORAGE_PROVIDER;
    const remote = { upload: vi.fn().mockImplementation(async (key: string, buffer: Buffer, mimeType: string) => ({ key, size: buffer.length, contentHash: 'hash', mimeType })),
      download: vi.fn().mockResolvedValue(image), delete: vi.fn().mockResolvedValue(undefined), getSignedUrl: vi.fn(), exists: vi.fn() };
    const storage = vi.spyOn(storageFactory, 'getStorage').mockReturnValue(remote);
    try {
      env.STORAGE_PROVIDER = 'b2';
      const response = await upload(); expect(response.status).toBe(201);
      const data = (await response.json() as any).data;
      expect(data.asset.storageProvider).toBe('b2');
      const preview = await fetch(`${base}/storage/${data.asset.storagePath}`);
      expect(preview.status).toBe(200);
      expect(preview.headers.get('content-type')).toContain('image/png');
      expect(preview.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
      expect(Buffer.from(await preview.arrayBuffer())).toEqual(image);
      expect(remote.download).toHaveBeenCalledWith(data.asset.storagePath);
    } finally { env.STORAGE_PROVIDER = previous; storage.mockRestore(); }
  });

  it('counts generated files against quota with concurrent workers', async () => {
    await prisma.user.update({ where: { id: userId }, data: { storageQuota: BigInt(10) } });
    const make = (suffix: string) => recordGeneratedAsset({ projectId, fileName: suffix, mimeType: 'image/png', sizeBytes: BigInt(8), storageProvider: 'local', storagePath: `test/${suffix}`, sha256: suffix });
    const results = await Promise.allSettled([make('one'), make('two')]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).usedStorage).toBe(BigInt(8));
  });

  it('deletes stored files and releases quota when a project is deleted', async () => {
    const response = await upload(); expect(response.status).toBe(201);
    const data = (await response.json() as any).data;
    expect(await getStorage().exists(data.asset.storagePath)).toBe(true);
    const deleted = await fetch(`${base}/api/v1/projects/${projectId}`, { method: 'DELETE', headers: headers() });
    expect(deleted.status).toBe(200);
    expect(await getStorage().exists(data.asset.storagePath)).toBe(false);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).usedStorage).toBe(BigInt(0));
    expect(await prisma.project.findUnique({ where: { id: projectId } })).toBeNull();
  });

  it('reconciles legacy usage without removing another project quota allocation', async () => {
    const other = await prisma.project.create({ data: { userId, name: 'Retained project' } });
    await prisma.asset.createMany({ data: [
      { projectId, fileName: 'old.png', mimeType: 'image/png', sizeBytes: BigInt(8), storageProvider: 'local', storagePath: `test/${projectId}/old.png`, sha256: 'old' },
      { projectId: other.id, fileName: 'retained.png', mimeType: 'image/png', sizeBytes: BigInt(10), storageProvider: 'local', storagePath: `test/${other.id}/retained.png`, sha256: 'retained' },
    ] });
    const deleted = await fetch(`${base}/api/v1/projects/${projectId}`, { method: 'DELETE', headers: headers() });
    expect(deleted.status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).usedStorage).toBe(BigInt(10));
  });

  it('refuses to reset an active retry and returns actual job data for a stopped retry', async () => {
    const job = await prisma.conversionJob.create({ data: { projectId, status: 'analyzing_image', workerId: 'worker-a', attempts: 2, leaseExpiresAt: new Date(Date.now() + 60000) } });
    expect((await post(`/jobs/${job.id}/retry`)).status).toBe(409);
    expect((await prisma.conversionJob.findUniqueOrThrow({ where: { id: job.id } })).workerId).toBe('worker-a');
    await prisma.conversionJob.update({ where: { id: job.id }, data: { status: 'failed', workerId: null, leaseExpiresAt: null } });
    const retried = await post(`/jobs/${job.id}/retry`);
    expect(retried.status).toBe(200);
    const body = await retried.json() as any;
    expect(body.data.status).toBe('queued'); expect(body.data.attempts).toBe(2);
    expect(body.data.maxAttempts).toBe(2 + env.CONVERSION_MAX_ATTEMPTS);
  });

  it('cancels an active job and prevents its previous worker from overwriting cancellation', async () => {
    const worker = new ConversionWorker();
    const job = await prisma.conversionJob.create({ data: { projectId, status: 'analyzing_image', workerId: worker.getWorkerId(), attempts: 1, leaseExpiresAt: new Date(Date.now() + 60000) } });
    expect((await post(`/jobs/${job.id}/cancel`)).status).toBe(200);
    await worker.handleJobError(job.id, 1, 'Late failure', new Error('Late failure'));
    expect((await prisma.conversionJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe('cancelled');
  });

  it('rejects stale orchestration ownership before writing stage records', async () => {
    const job = await prisma.conversionJob.create({ data: { projectId, status: 'analyzing_image', workerId: 'new-owner', attempts: 2, leaseExpiresAt: new Date(Date.now() + 60000) } });
    await expect(new ConversionOrchestrator().processJob(job.id, { workerId: 'old-owner', attempt: 1 })).rejects.toThrow(/lease lost/);
    expect(await prisma.jobStage.count({ where: { jobId: job.id } })).toBe(0);
    expect((await prisma.conversionJob.findUniqueOrThrow({ where: { id: job.id } })).workerId).toBe('new-owner');
  });

  it('returns owned latest-job and artifact endpoints and denies another user', async () => {
    const job = await prisma.conversionJob.create({ data: { projectId, dirArtifact: { version: '1.0.0' } } });
    const latest = await fetch(`${base}/api/v1/projects/${projectId}/job`, { headers: headers() });
    expect((await latest.json() as any).data.id).toBe(job.id);
    const artifact = await fetch(`${base}/api/v1/jobs/${job.id}/artifacts`, { headers: headers() });
    expect((await artifact.json() as any).data.dir.version).toBe('1.0.0');
    const stranger = signToken({ id: 'other-user', email: 'other@test.local', role: 'USER' });
    expect((await fetch(`${base}/api/v1/projects/${projectId}/job`, { headers: { Authorization: `Bearer ${stranger}` } })).status).toBe(404);
  });

  it('blocks development login in production', async () => {
    const previous = env.NODE_ENV;
    try { env.NODE_ENV = 'production'; expect((await post('/auth/dev-login')).status).toBe(404); }
    finally { env.NODE_ENV = previous; }
  });

  it('requires publish confirmation and reports publisher failures as HTTP errors', async () => {
    const job = await prisma.conversionJob.create({ data: { projectId, status: 'preview_ready', elementorArtifact: { content: [{ id: 'abc1234', settings: {} }] } } });
    const site = await prisma.siteConnection.create({ data: { userId, siteUrl: 'http://wp.test', encryptedCredentials: encrypt(JSON.stringify({ username: 'admin', applicationPassword: 'test' })) } });
    const input = { jobId: job.id, siteConnectionId: site.id, title: 'Page', mode: 'draft' };
    expect((await post('/publish', input)).status).toBe(400);
    vi.spyOn(MCPPublisher.prototype, 'publish').mockResolvedValue({ success: false, resourceType: 'page', status: 'failed', error: 'Permission denied' });
    const response = await post('/publish', { ...input, confirmPublish: true });
    expect(response.status).toBe(502); expect((await response.json() as any).success).toBe(false);
    expect((await prisma.conversionJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe('preview_ready');
  });

  it('deduplicates successful publish requests across HTTP retries', async () => {
    const job = await prisma.conversionJob.create({ data: { projectId, status: 'preview_ready', elementorArtifact: { content: [{ id: 'abc1234', settings: {} }] } } });
    const site = await prisma.siteConnection.create({ data: { userId, siteUrl: 'http://wp.test', encryptedCredentials: encrypt(JSON.stringify({ username: 'admin', applicationPassword: 'test' })) } });
    const publish = vi.spyOn(MCPPublisher.prototype, 'publish').mockImplementation(async (request) => ({ success: true, resourceType: 'page', status: 'draft', remoteId: '20', verified: true, idempotencyKey: request.idempotencyKey }));
    const input = { jobId: job.id, siteConnectionId: site.id, title: 'Page', mode: 'draft', confirmPublish: true };
    expect((await post('/publish', input)).status).toBe(200);
    expect((await post('/publish', input)).status).toBe(200);
    expect(publish).toHaveBeenCalledTimes(1);
  });
});
