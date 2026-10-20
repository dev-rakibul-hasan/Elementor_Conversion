import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import { createApp } from '../server.js';
import { UploadService } from '../modules/storage/upload-service.js';
import { LocalStorageProvider } from '../modules/storage/storage-provider.js';
import { InMemoryDeduplicationStore } from '../modules/storage/hasher.js';
import { ImageProcessor } from '../modules/storage/processor.js';
import { CanvasIsolationService } from '../modules/storage/canvas.js';
import { type StorageConfig } from '../modules/storage/types.js';

describe('Upload API HTTP Integration Tests', () => {
  const testStorageDir = './storage/test_uploads_api';
  const testConfig: StorageConfig = {
    storageDir: testStorageDir,
    tempDir: './storage/test_tmp_api',
    maxFileSizeBytes: 1024 * 1024, // 1 MiB for tests
    maxTotalSizeBytes: 2 * 1024 * 1024,
    maxFilesPerRequest: 1,
    maxDecodedPixels: 10_000_000,
    maxDimensionPixels: 5000,
    maxFrames: 1,
    processingTimeoutMs: 10_000,
  };

  let app: any;
  let uploadService: UploadService;

  beforeEach(async () => {
    // Clean test directories
    await fs.rm(testStorageDir, { recursive: true, force: true }).catch(() => {});
    await fs.rm(testConfig.tempDir, { recursive: true, force: true }).catch(() => {});

    const storageProvider = new LocalStorageProvider(testConfig.storageDir);
    const deduplicationStore = new InMemoryDeduplicationStore();
    const imageProcessor = new ImageProcessor(testConfig);
    const canvasService = new CanvasIsolationService(testConfig);

    uploadService = new UploadService({
      config: testConfig,
      storageProvider,
      deduplicationStore,
      processor: imageProcessor,
      canvasService,
    });

    app = createApp({
      uploadService,
      storageConfig: testConfig,
    });
  });

  it('GET /health and GET /api/v1/health return 200 OK', async () => {
    const resRoot = await request(app).get('/health');
    expect(resRoot.status).toBe(200);
    expect(resRoot.body.status).toBe('ok');

    const resV1 = await request(app).get('/api/v1/health');
    expect(resV1.status).toBe(200);
    expect(resV1.body.status).toBe('ok');
    expect(resV1.body.version).toBeDefined();
  });

  it('POST /api/upload successfully processes valid PNG and returns 201 Created', async () => {
    const pngBuffer = await sharp({
      create: { width: 120, height: 80, channels: 4, background: { r: 10, g: 200, b: 50, alpha: 0.9 } },
    })
      .png()
      .toBuffer();

    const response = await request(app)
      .post('/api/upload')
      .field('projectId', 'proj_alpha')
      .attach('image', pngBuffer, 'test-image.png');

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toBeDefined();

    const { assetId, metadata, canvas, isDuplicate } = response.body.data;
    expect(assetId).toMatch(/^asset_[a-f0-9]{16}$/);
    expect(isDuplicate).toBe(false);
    expect(metadata.format).toBe('png');
    expect(metadata.normalizedWidth).toBe(120);
    expect(metadata.normalizedHeight).toBe(80);
    expect(metadata.hasAlpha).toBe(true);

    expect(canvas.canvasId).toMatch(/^cvs_[a-f0-9]{16}$/);
    expect(canvas.sourceAssetId).toBe(assetId);
    expect(canvas.canvasWidth).toBe(120);
    expect(canvas.canvasHeight).toBe(80);
  });

  it('POST /api/v1/upload matches client expectations (field name "image", composite project/asset)', async () => {
    const jpegBuffer = await sharp({
      create: { width: 150, height: 100, channels: 3, background: { r: 240, g: 50, b: 20 } },
    })
      .jpeg()
      .toBuffer();

    const response = await request(app)
      .post('/api/v1/upload')
      .field('name', 'Landing Page Mockup')
      .attach('image', jpegBuffer, 'landing.jpg');

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);

    // Client integration shape: { project, asset }
    expect(response.body.data.project).toBeDefined();
    expect(response.body.data.project.name).toBe('Landing Page Mockup');
    expect(response.body.data.asset).toBeDefined();
    expect(response.body.data.asset.format).toBe('jpeg');
  });

  it('detects duplicate uploads idempotently and returns 200 OK with duplicate info', async () => {
    const pngBuffer = await sharp({
      create: { width: 64, height: 64, channels: 3, background: { r: 0, g: 100, b: 200 } },
    })
      .png()
      .toBuffer();

    // First upload: 201 Created
    const res1 = await request(app)
      .post('/api/upload')
      .field('projectId', 'shared_project')
      .attach('image', pngBuffer, 'icon.png');

    expect(res1.status).toBe(201);
    expect(res1.body.data.isDuplicate).toBe(false);
    const originalAssetId = res1.body.data.assetId;

    // Second upload of exact same buffer in same project: 200 OK
    const res2 = await request(app)
      .post('/api/upload')
      .field('projectId', 'shared_project')
      .attach('image', pngBuffer, 'duplicate_icon.png');

    expect(res2.status).toBe(200);
    expect(res2.body.data.isDuplicate).toBe(true);
    expect(res2.body.data.duplicateOfAssetId).toBe(originalAssetId);
    expect(res2.body.data.assetId).toBe(originalAssetId);
  });

  it('enforces tenant scope isolation for duplicates across different projects', async () => {
    const pngBuffer = await sharp({
      create: { width: 64, height: 64, channels: 3, background: { r: 50, g: 50, b: 50 } },
    })
      .png()
      .toBuffer();

    // Upload to Tenant A
    const resTenantA = await request(app)
      .post('/api/upload')
      .field('projectId', 'tenant_a')
      .attach('image', pngBuffer, 'tenant-logo.png');

    expect(resTenantA.status).toBe(201);

    // Upload to Tenant B: must NOT be marked duplicate of Tenant A
    const resTenantB = await request(app)
      .post('/api/upload')
      .field('projectId', 'tenant_b')
      .attach('image', pngBuffer, 'tenant-logo.png');

    expect(resTenantB.status).toBe(201);
    expect(resTenantB.body.data.isDuplicate).toBe(false);
    expect(resTenantB.body.data.assetId).not.toBe(resTenantA.body.data.assetId);
  });

  it('returns 400 Bad Request when no file is uploaded', async () => {
    const response = await request(app)
      .post('/api/upload')
      .field('projectId', 'proj_empty');

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('INVALID_REQUEST');
  });

  it('returns 413 File Too Large when upload exceeds configured max size', async () => {
    // Generate a buffer larger than 1 MiB (1024 * 1024 = 1048576)
    const largeBuffer = Buffer.alloc(1024 * 1024 + 100, 0xaa);

    const response = await request(app)
      .post('/api/upload')
      .attach('image', largeBuffer, 'huge_file.png');

    expect(response.status).toBe(413);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('FILE_TOO_LARGE');
  });

  it('returns 415 Unsupported Media Type for SVG or text uploads', async () => {
    const textBuffer = Buffer.from('This is a plain text file, not an image.');

    const response = await request(app)
      .post('/api/upload')
      .attach('image', textBuffer, 'notes.txt');

    expect(response.status).toBe(415);
    expect(response.body.success).toBe(false);
  });

  it('returns 422 Unprocessable Entity for corrupted image bytes', async () => {
    // Valid PNG magic bytes followed by truncated/garbage payload
    const corruptPngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00]);

    const response = await request(app)
      .post('/api/upload')
      .attach('image', corruptPngBuffer, 'corrupt.png');

    expect(response.status).toBe(422);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toMatch(/IMAGE_DECODE_FAILED|INVALID_IMAGE/);
  });

  it('returns 404 for unknown route', async () => {
    const response = await request(app).get('/api/unknown-endpoint');
    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('ROUTE_NOT_FOUND');
  });
});
