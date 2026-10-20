import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { ImageProcessor } from '../modules/storage/processor.js';
import {
  ImagePixelLimitExceededError,
  ImageDimensionsExceededError,
  InvalidImageError,
} from '../modules/storage/errors.js';
import { DEFAULT_STORAGE_CONFIG, type StorageConfig } from '../modules/storage/types.js';

describe('Image Metadata Extraction & Processing Engine', () => {
  const processor = new ImageProcessor(DEFAULT_STORAGE_CONFIG);

  it('extracts complete, accurate metadata from PNG image with alpha channel', async () => {
    const pngBuffer = await sharp({
      create: {
        width: 300,
        height: 150,
        channels: 4,
        background: { r: 10, g: 20, b: 30, alpha: 0.5 },
      },
    })
      .png()
      .toBuffer();

    const metadata = await processor.extractMetadata(pngBuffer);

    expect(metadata.width).toBe(300);
    expect(metadata.height).toBe(150);
    expect(metadata.normalizedWidth).toBe(300);
    expect(metadata.normalizedHeight).toBe(150);
    expect(metadata.aspectRatio).toBe(2);
    expect(metadata.format).toBe('png');
    expect(metadata.hasAlpha).toBe(true);
    expect(metadata.channels).toBe(4);
    expect(metadata.frameCount).toBe(1);
  });

  it('extracts metadata from RGB JPEG image without alpha channel', async () => {
    const jpegBuffer = await sharp({
      create: {
        width: 400,
        height: 200,
        channels: 3,
        background: { r: 255, g: 128, b: 0 },
      },
    })
      .jpeg()
      .toBuffer();

    const metadata = await processor.extractMetadata(jpegBuffer);

    expect(metadata.width).toBe(400);
    expect(metadata.height).toBe(200);
    expect(metadata.aspectRatio).toBe(2);
    expect(metadata.format).toBe('jpeg');
    expect(metadata.hasAlpha).toBe(false);
    expect(metadata.channels).toBe(3);
  });

  it('enforces decompression bomb protection via limitInputPixels', async () => {
    const strictConfig: StorageConfig = {
      ...DEFAULT_STORAGE_CONFIG,
      maxDecodedPixels: 1000, // Very low limit to trigger decompression bomb guard
    };
    const bombGuardedProcessor = new ImageProcessor(strictConfig);

    // Create an image with 50x50 = 2500 pixels (> 1000)
    const testBuffer = await sharp({
      create: {
        width: 50,
        height: 50,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
      },
    })
      .png()
      .toBuffer();

    await expect(bombGuardedProcessor.extractMetadata(testBuffer)).rejects.toThrow(
      ImagePixelLimitExceededError
    );
  });

  it('rejects images exceeding dimension limits', async () => {
    const strictConfig: StorageConfig = {
      ...DEFAULT_STORAGE_CONFIG,
      maxDimensionPixels: 50,
    };
    const dimensionGuardedProcessor = new ImageProcessor(strictConfig);

    const testBuffer = await sharp({
      create: {
        width: 100,
        height: 20,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
      },
    })
      .png()
      .toBuffer();

    await expect(dimensionGuardedProcessor.extractMetadata(testBuffer)).rejects.toThrow(
      ImageDimensionsExceededError
    );
  });

  it('normalizes image and strips privacy-sensitive EXIF tags', async () => {
    const inputBuffer = await sharp({
      create: {
        width: 80,
        height: 40,
        channels: 3,
        background: { r: 50, g: 100, b: 150 },
      },
    })
      .jpeg({ quality: 90 })
      .toBuffer();

    const result = await processor.processAndNormalize(inputBuffer);

    expect(result.normalizedBuffer).toBeInstanceOf(Buffer);
    expect(result.metadata.width).toBe(80);
    expect(result.metadata.height).toBe(40);

    // Verify output can be read cleanly by sharp
    const outputMeta = await sharp(result.normalizedBuffer).metadata();
    expect(outputMeta.width).toBe(80);
    expect(outputMeta.height).toBe(40);
  });

  it('crops sub-asset regions accurately within bounds', async () => {
    const baseBuffer = await sharp({
      create: {
        width: 200,
        height: 200,
        channels: 3,
        background: { r: 100, g: 150, b: 200 },
      },
    })
      .png()
      .toBuffer();

    const cropResult = await processor.cropRegion(baseBuffer, {
      x: 20,
      y: 30,
      width: 50,
      height: 60,
    });

    const cropMeta = await sharp(cropResult).metadata();
    expect(cropMeta.width).toBe(50);
    expect(cropMeta.height).toBe(60);
  });

  it('rejects out-of-bounds crop regions', async () => {
    const baseBuffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
      },
    })
      .png()
      .toBuffer();

    // Crop exceeds boundary: x + width = 120 > 100
    await expect(
      processor.cropRegion(baseBuffer, {
        x: 50,
        y: 10,
        width: 70,
        height: 20,
      })
    ).rejects.toThrow(InvalidImageError);

    // Negative coordinates
    await expect(
      processor.cropRegion(baseBuffer, {
        x: -10,
        y: 0,
        width: 50,
        height: 50,
      })
    ).rejects.toThrow(InvalidImageError);
  });
});
