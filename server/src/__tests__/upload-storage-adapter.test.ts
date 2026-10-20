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
import type { DIRDocument } from '../modules/dir/types.js';

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

  it('crops DIR sub-assets into project storage without mutating the input document', async () => {
    const upload = await adapter.validateUpload({
      filePath: testInputFile,
      fileName: 'hero-layout.png',
      mimeType: 'image/png',
      projectId: 'proj_crop_test',
    });
    const document: DIRDocument = {
      version: '1.0.0',
      meta: {
        sourceImageHash: upload.verifiedSha256,
        sourceWidth: 1280,
        sourceHeight: 720,
        analysisProvider: 'test',
        analysisModel: 'test',
        analysisTimestamp: new Date().toISOString(),
        confidenceScore: 1,
        schemaVersion: '1.0.0',
        promptVersion: '1.0.0',
      },
      breakpoints: { desktop: { min: 1025 } },
      globals: {
        colors: { background: '#050a04', text: '#ffffff' },
        typography: { fontFamilies: [] },
      },
      assets: [{
        id: 'hero-art',
        type: 'image',
        role: 'hero artwork',
        sourceRect: { x: 20, y: 30, width: 80, height: 40 },
        confidence: 1,
      }],
      pages: [],
    };

    const prepared = await adapter.prepareDIRAssets(document, {
      projectId: 'proj_crop_test',
      sourceAssetPath: upload.storagePath,
    });
    const croppedAsset = prepared.assets[0];

    expect(document.assets[0]?.path).toBeUndefined();
    expect(croppedAsset?.path).toMatch(
      /^projects\/proj_crop_test-[a-f0-9]{8}\/assets\/hero-art-[a-f0-9]{8}\.png$/
    );
    if (!croppedAsset?.path) throw new Error('Expected cropped asset path to be present');
    const croppedBuffer = await uploadService.getStorageProvider().read(croppedAsset.path);
    const metadata = await sharp(croppedBuffer).metadata();
    expect(metadata.width).toBe(80);
    expect(metadata.height).toBe(40);
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
