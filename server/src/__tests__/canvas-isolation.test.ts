import { describe, it, expect } from 'vitest';
import { CanvasIsolationService } from '../modules/storage/canvas.js';
import type { ValidatedImageMetadata } from '../modules/storage/types.js';

describe('Canvas Isolation Service', () => {
  const dummyMetadata: ValidatedImageMetadata = {
    id: 'ast_test_12345678',
    originalFileName: 'design-mockup.png',
    sanitizedFileName: 'design-mockup.png',
    mimeType: 'image/png',
    format: 'png',
    sizeBytes: 10240,
    sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    width: 1920,
    height: 1080,
    normalizedWidth: 1920,
    normalizedHeight: 1080,
    aspectRatio: 1.7777777777777777,
    frameCount: 1,
    hasAlpha: false,
    colorSpace: 'srgb',
    exifOrientation: null,
    isOrientationNormalized: true,
    storagePath: 'storage/uploads/default/ast_test_12345678.png',
    storageProvider: 'local',
    createdAt: new Date().toISOString(),
    warnings: [],
  };

  it('initializes safe canvas state linked to source asset with 1:1 default transform', () => {
    const canvas = CanvasIsolationService.createIsolatedCanvas(dummyMetadata);

    expect(canvas.canvasId).toMatch(/^cvs_[a-f0-9]{16}$/);
    expect(canvas.sourceAssetId).toBe(dummyMetadata.id);
    expect(canvas.canvasWidth).toBe(1920);
    expect(canvas.canvasHeight).toBe(1080);
    expect(canvas.displayWidth).toBe(1920);
    expect(canvas.displayHeight).toBe(1080);
    expect(canvas.aspectRatio).toBeCloseTo(1.777, 2);
    expect(canvas.status).toBe('initialized');

    // Default transform verification
    expect(canvas.transform).toEqual({
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
    });

    // DIR canvas bounds verification
    expect(canvas.canvasBounds).toEqual({
      crop_mockup: false,
      inner_bg_type: 'solid',
      primary_hex: '#050a04',
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
    });
  });

  it('scales display dimensions proportionally when viewportMaxWidth is applied', () => {
    const canvas = CanvasIsolationService.createIsolatedCanvas(dummyMetadata, {
      viewportMaxWidth: 960, // Half width
    });

    // Underlying canvas preserves original dimensions
    expect(canvas.canvasWidth).toBe(1920);
    expect(canvas.canvasHeight).toBe(1080);

    // Display dimensions scaled down 50%
    expect(canvas.displayWidth).toBe(960);
    expect(canvas.displayHeight).toBe(540);
  });

  it('supports custom background colors in canvas bounds', () => {
    const canvas = CanvasIsolationService.createIsolatedCanvas(dummyMetadata, {
      preferredBackground: '#ffffff',
    });

    expect(canvas.canvasBounds.primary_hex).toBe('#ffffff');
  });

  it('performs defensive cloning to prevent cross-stage mutation', () => {
    const original = CanvasIsolationService.createIsolatedCanvas(dummyMetadata);
    const clone = CanvasIsolationService.cloneCanvas(original);

    expect(clone).toEqual(original);
    expect(clone).not.toBe(original);
    expect(clone.transform).not.toBe(original.transform);
    expect(clone.canvasBounds).not.toBe(original.canvasBounds);

    // Modifying clone does not mutate original
    clone.transform.x = 100;
    clone.canvasBounds.crop_mockup = true;

    expect(original.transform.x).toBe(0);
    expect(original.canvasBounds.crop_mockup).toBe(false);
  });
});
