import { describe, it, expect, beforeEach } from 'vitest';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import { UploadStorageAdapter } from '../modules/storage/adapter.js';
import { UploadService } from '../modules/storage/upload-service.js';
import { LocalStorageProvider } from '../modules/storage/storage-provider.js';
import { InMemoryDeduplicationStore } from '../modules/storage/hasher.js';
import { ImageProcessor } from '../modules/storage/processor.js';
import { CanvasIsolationService } from '../modules/storage/canvas.js';
import { type StorageConfig } from '../modules/storage/types.js';

describe('UploadStorageAdapter & Pipeline Orchestration Integration', () => {
  const testStorageDir = './storage/test_adapter_uploads';
  const testTempDir = './storage/test_adapter_tmp';
  const testInputFile = './storage/test_input_image.png';

  const testConfig: StorageConfig = {
    storageDir: testStorageDir,
    tempDir: testTempDir,
    maxFileSizeBytes: 10 * 1024 * 1024,
    maxTotalSizeBytes: 20 * 1024 * 1024,
    maxFilesPerRequest: 1,
    maxDecodedPixels: 20_000_000,
    maxDimensionPixels: 8000,
    maxFrames: 1,
    processingTimeoutMs: 15_000,
  };

  let adapter: UploadStorageAdapter;
  let uploadService: UploadService;

  beforeEach(async () => {
    await fs.rm(testStorageDir, { recursive: true, force: true }).catch(() => {});
    await fs.rm(testTempDir, { recursive: true, force: true }).catch(() => {});
    await fs.mkdir('./storage', { recursive: true }).catch(() => {});

    // Create a physical test input image
    const samplePng = await sharp({
      create: {
        width: 1280,
        height: 720,
        channels: 4,
        background: { r: 5, g: 10, b: 4, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    await fs.writeFile(testInputFile, samplePng);

    const storageProvider = new LocalStorageProvider(testConfig.storageDir);
    const deduplicationStore = new InMemoryDeduplicationStore();
    const processor = new ImageProcessor(testConfig);
    const canvasService = new CanvasIsolationService(testConfig);

    uploadService = new UploadService({
      config: testConfig,
      storageProvider,
      deduplicationStore,
      processor,
      canvasService,
    });

    adapter = new UploadStorageAdapter(uploadService, testConfig);
  });

  it('validates upload input for Stage 1 (Upload Validation)', async () => {
    const result = await adapter.validateUpload({
      filePath: testInputFile,
      fileName: 'hero-layout.png',
      mimeType: 'image/png',
      projectId: 'proj_pipeline_test',
    });

    expect(result.verifiedSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.verifiedMimeType).toBe('image/png');
    expect(result.verifiedWidth).toBe(1280);
    expect(result.verifiedHeight).toBe(720);
    expect(result.isCanvasIsolated).toBe(true);
    expect(result.sanitizedFileName).toBe('hero-layout.png');
    expect(result.storagePath).toBeDefined();
    expect(result.validatedAt).toBeDefined();
  });

  it('isolates canvas bounds for Stage 2 (Canvas Isolation / Perception)', async () => {
    const canvasBounds = await adapter.isolateCanvas(testInputFile);

    expect(canvasBounds.width).toBe(1280);
    expect(canvasBounds.height).toBe(720);
    expect(canvasBounds.x).toBe(0);
    expect(canvasBounds.y).toBe(0);
    expect(canvasBounds.inner_bg_type).toBe('solid');
    expect(canvasBounds.crop_mockup).toBe(false);
  });

  it('fails gracefully when reading a non-existent file path', async () => {
    await expect(
      adapter.validateUpload({
        filePath: './storage/non_existent_file.png',
        fileName: 'missing.png',
        mimeType: 'image/png',
        projectId: 'proj_pipeline_test',
      })
    ).rejects.toThrow(/Failed to read upload file/);
  });
});
