import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import {
  LocalStorageAdapter,
  B2StorageAdapter,
  generateStorageKey,
  createStorageAdapter,
  getStorage,
  resetStorageInstance,
  validateImage,
  getImageMetadata,
  createAnalysisCopy,
  createThumbnail,
  createTiles,
  computeContentHash,
  checkMagicBytes,
  MAX_PIXELS_LIMIT,
} from './index.js';
import { StorageError, ValidationError } from '../../lib/errors.js';

describe('Storage Module', () => {
  const testStorageDir = path.resolve('./storage/test-tmp-storage');

  beforeEach(async () => {
    resetStorageInstance();
    if (fs.existsSync(testStorageDir)) {
      await fs.promises.rm(testStorageDir, { recursive: true, force: true });
    }
  });

  afterEach(async () => {
    if (fs.existsSync(testStorageDir)) {
      await fs.promises.rm(testStorageDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  describe('LocalStorageAdapter', () => {
    it('should create the base storage directory if it does not exist', () => {
      new LocalStorageAdapter(testStorageDir);
      expect(fs.existsSync(testStorageDir)).toBe(true);
    });

    it('should upload, check existence, download, and delete a file', async () => {
      const adapter = new LocalStorageAdapter(testStorageDir);
      const testBuffer = Buffer.from('hello world design to elementor');
      const testKey = 'projects/proj_1/test-file.txt';

      // 1. Upload
      const result = await adapter.upload(testKey, testBuffer, 'text/plain');
      expect(result.key).toBe(testKey);
      expect(result.size).toBe(testBuffer.length);
      expect(result.mimeType).toBe('text/plain');
      expect(result.contentHash).toBe(computeContentHash(testBuffer));

      // 2. Exists
      const exists = await adapter.exists(testKey);
      expect(exists).toBe(true);

      // 3. Download
      const downloaded = await adapter.download(testKey);
      expect(downloaded.toString('utf-8')).toBe('hello world design to elementor');

      // 4. Signed URL (returns path for local)
      const url = await adapter.getSignedUrl(testKey);
      expect(url).toContain('test-file.txt');

      // 5. Delete
      await adapter.delete(testKey);
      const existsAfterDelete = await adapter.exists(testKey);
      expect(existsAfterDelete).toBe(false);

      // 6. Idempotent delete does not throw
      await expect(adapter.delete(testKey)).resolves.toBeUndefined();
    });

    it('should throw StorageError when downloading a non-existent file', async () => {
      const adapter = new LocalStorageAdapter(testStorageDir);
      await expect(adapter.download('non-existent.png')).rejects.toThrow(StorageError);
    });

    it('should block path traversal attempts', async () => {
      const adapter = new LocalStorageAdapter(testStorageDir);
      const evilKeys = [
        '../outside.txt',
        '../../etc/passwd',
        'foo/../../bar/../../../secret.txt',
      ];

      for (const key of evilKeys) {
        await expect(
          adapter.upload(key, Buffer.from('exploit'), 'text/plain')
        ).rejects.toThrow(/traversal/i);

        await expect(adapter.download(key)).rejects.toThrow(/traversal/i);
        await expect(adapter.delete(key)).rejects.toThrow(/traversal/i);
        await expect(adapter.getSignedUrl(key)).rejects.toThrow(/traversal/i);
        await expect(adapter.exists(key)).rejects.toThrow(/traversal/i);
      }
    });

    it('should safely handle keys with leading slashes and backslashes', async () => {
      const adapter = new LocalStorageAdapter(testStorageDir);
      const testBuffer = Buffer.from('leading slash test');
      await adapter.upload('/test-leading.txt', testBuffer, 'text/plain');
      expect(await adapter.exists('/test-leading.txt')).toBe(true);
      expect(await adapter.exists('test-leading.txt')).toBe(true);
      const downloaded = await adapter.download('/test-leading.txt');
      expect(downloaded.toString('utf-8')).toBe('leading slash test');
      await adapter.delete('/test-leading.txt');
      expect(await adapter.exists('/test-leading.txt')).toBe(false);
    });

    it('should reject invalid empty keys', async () => {
      const adapter = new LocalStorageAdapter(testStorageDir);
      await expect(adapter.upload('', Buffer.from('test'), 'text/plain')).rejects.toThrow(
        StorageError
      );
    });
  });

  describe('B2StorageAdapter', () => {
    it('should validate required environment variables or config options', () => {
      expect(() => {
        new B2StorageAdapter({
          endpoint: '',
          region: '',
          bucket: '',
          keyId: '',
          applicationKey: '',
        });
      }).toThrow(/configuration error/i);
    });

    it('should generate unguessable project-scoped storage keys', () => {
      const key1 = generateStorageKey('project_123', 'screenshot.png');
      const key2 = generateStorageKey('project_123', 'screenshot.png');

      expect(key1).toContain('projects/project_123/');
      expect(key1).toMatch(/\.png$/);
      expect(key1).not.toBe(key2); // Random suffix ensures uniqueness
    });

    it('should instantiate successfully with complete B2 config', () => {
      const adapter = new B2StorageAdapter({
        endpoint: 'https://s3.us-east-005.backblazeb2.com',
        region: 'us-east-005',
        bucket: 'my-test-bucket',
        keyId: 'testKeyId123456',
        applicationKey: 'testAppKeySecret1234567890',
      });

      expect(adapter).toBeInstanceOf(B2StorageAdapter);
      const generatedKey = adapter.generateKey('proj-42', 'hero.jpeg');
      expect(generatedKey).toContain('proj-42');
    });
  });

  describe('Storage Factory', () => {
    it('should create LocalStorageAdapter by default', () => {
      const adapter = createStorageAdapter({ provider: 'local', localPath: testStorageDir });
      expect(adapter).toBeInstanceOf(LocalStorageAdapter);
    });

    it('should validate missing B2 configuration when B2 provider is requested', () => {
      expect(() => {
        createStorageAdapter({
          provider: 'b2',
          b2Endpoint: '',
          b2Region: '',
          b2Bucket: '',
          b2KeyId: '',
          b2Key: '',
        });
      }).toThrow(/Missing required Backblaze B2/i);
    });

    it('should provide singleton instance via getStorage()', () => {
      const instance1 = getStorage({ provider: 'local', localPath: testStorageDir });
      const instance2 = getStorage();
      expect(instance1).toBe(instance2);
    });
  });

  describe('ImageProcessor', () => {
    let samplePngBuffer: Buffer;
    let sampleJpegBuffer: Buffer;

    beforeEach(async () => {
      // Create a valid 200x200 PNG
      samplePngBuffer = await sharp({
        create: {
          width: 200,
          height: 200,
          channels: 4,
          background: { r: 50, g: 100, b: 200, alpha: 1 },
        },
      })
        .png()
        .toBuffer();

      // Create a valid 300x150 JPEG
      sampleJpegBuffer = await sharp({
        create: {
          width: 300,
          height: 150,
          channels: 3,
          background: { r: 255, g: 128, b: 0 },
        },
      })
        .jpeg()
        .toBuffer();
    });

    it('should compute SHA-256 hash correctly', () => {
      const hash1 = computeContentHash(samplePngBuffer);
      const hash2 = computeContentHash(samplePngBuffer);
      expect(hash1).toHaveLength(64);
      expect(hash1).toBe(hash2);
    });

    it('should check magic bytes for PNG and JPEG correctly', () => {
      expect(checkMagicBytes(samplePngBuffer)).toBe('image/png');
      expect(checkMagicBytes(sampleJpegBuffer)).toBe('image/jpeg');
      expect(checkMagicBytes(Buffer.from('not an image at all'))).toBeNull();
    });

    it('should validate genuine PNG and JPEG images', async () => {
      const pngResult = await validateImage(samplePngBuffer);
      expect(pngResult.width).toBe(200);
      expect(pngResult.height).toBe(200);
      expect(pngResult.mimeType).toBe('image/png');

      const jpegResult = await validateImage(sampleJpegBuffer);
      expect(jpegResult.width).toBe(300);
      expect(jpegResult.height).toBe(150);
      expect(jpegResult.mimeType).toBe('image/jpeg');
    });

    it('should reject text files disguised as images', async () => {
      const fakeImage = Buffer.from('this is plain text not an image');
      await expect(validateImage(fakeImage)).rejects.toThrow(ValidationError);
    });

    it('should extract comprehensive metadata from images', async () => {
      const metadata = await getImageMetadata(samplePngBuffer);
      expect(metadata.width).toBe(200);
      expect(metadata.height).toBe(200);
      expect(metadata.format).toBe('png');
      expect(metadata.channels).toBe(4);
      expect(metadata.hasAlpha).toBe(true);
    });

    it('should create an analysis copy normalized to JPEG and resized if necessary', async () => {
      // Wide image 2400x800
      const wideImage = await sharp({
        create: {
          width: 2400,
          height: 800,
          channels: 3,
          background: { r: 10, g: 20, b: 30 },
        },
      })
        .png()
        .toBuffer();

      const result = await createAnalysisCopy(wideImage, 1920);
      expect(result.mimeType).toBe('image/jpeg');
      expect(result.width).toBe(1920);
      expect(result.height).toBe(640); // 2400:800 -> 1920:640
      expect(checkMagicBytes(result.buffer)).toBe('image/jpeg');
    });

    it('should create square thumbnails focusing on top area', async () => {
      const thumb = await createThumbnail(samplePngBuffer, 120);
      const meta = await sharp(thumb).metadata();
      expect(meta.width).toBe(120);
      expect(meta.height).toBe(120);
      expect(meta.format).toBe('jpeg');
    });

    it('should tile tall images with overlap', async () => {
      // Create tall screenshot 600x2500
      const tallImage = await sharp({
        create: {
          width: 600,
          height: 2500,
          channels: 3,
          background: { r: 80, g: 120, b: 160 },
        },
      })
        .jpeg()
        .toBuffer();

      const tiles = await createTiles(tallImage, 1000, 100);
      expect(tiles.length).toBeGreaterThan(1);
      expect(tiles[0].index).toBe(0);
      expect(tiles[0].yOffset).toBe(0);
      expect(tiles[0].height).toBe(1000);
      expect(tiles[0].totalTiles).toBe(tiles.length);

      // Verify second tile offset accounts for overlap
      expect(tiles[1].yOffset).toBe(900); // 1000 - 100

      // All tiles should be valid buffers
      for (const tile of tiles) {
        expect(tile.buffer.length).toBeGreaterThan(0);
        const tileMeta = await sharp(tile.buffer).metadata();
        expect(tileMeta.width).toBe(600);
        expect(tileMeta.height).toBe(tile.height);
      }
    });

    it('should return a single tile for images shorter than tileHeight', async () => {
      const shortImage = await sharp({
        create: {
          width: 400,
          height: 600,
          channels: 3,
          background: { r: 10, g: 10, b: 10 },
        },
      })
        .png()
        .toBuffer();

      const tiles = await createTiles(shortImage, 1200, 100);
      expect(tiles.length).toBe(1);
      expect(tiles[0].index).toBe(0);
      expect(tiles[0].yOffset).toBe(0);
      expect(tiles[0].height).toBe(600);
      expect(tiles[0].totalTiles).toBe(1);
    });

    it('should enforce decompression bomb limit of 100 megapixels', () => {
      expect(MAX_PIXELS_LIMIT).toBe(100_000_000);
    });
  });
});
