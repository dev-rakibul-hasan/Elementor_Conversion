import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import {
  validateUploadContent,
  detectMagicBytes,
  sanitizeFileName,
} from '../modules/storage/validator.js';
import {
  FileTooLargeError,
  UnsupportedMediaTypeError,
  FileSignatureMismatchError,
  InvalidImageError,
} from '../modules/storage/errors.js';
import { DEFAULT_STORAGE_CONFIG, type StorageConfig } from '../modules/storage/types.js';

describe('File Validation & Magic Byte Inspection', () => {
  it('detects and accepts valid JPEG magic bytes (FF D8 FF)', async () => {
    const jpegBuffer = await sharp({
      create: { width: 40, height: 40, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .jpeg()
      .toBuffer();

    const signature = detectMagicBytes(jpegBuffer);
    expect(signature).toEqual({
      format: 'jpeg',
      mimeType: 'image/jpeg',
    });

    const validation = validateUploadContent(
      jpegBuffer,
      'image/jpeg',
      'photo.jpg',
      DEFAULT_STORAGE_CONFIG
    );
    expect(validation.detectedFormat).toBe('jpeg');
    expect(validation.detectedMime).toBe('image/jpeg');
    expect(validation.sanitizedFileName).toBe('photo.jpg');
    expect(validation.sizeBytes).toBe(jpegBuffer.length);
  });

  it('detects and accepts valid PNG magic bytes (89 50 4E 47 0D 0A 1A 0A)', async () => {
    const pngBuffer = await sharp({
      create: { width: 50, height: 50, channels: 4, background: { r: 0, g: 255, b: 0, alpha: 0.8 } },
    })
      .png()
      .toBuffer();

    const signature = detectMagicBytes(pngBuffer);
    expect(signature).toEqual({
      format: 'png',
      mimeType: 'image/png',
    });

    const validation = validateUploadContent(
      pngBuffer,
      'image/png',
      'graphic.png',
      DEFAULT_STORAGE_CONFIG
    );
    expect(validation.detectedFormat).toBe('png');
    expect(validation.detectedMime).toBe('image/png');
    expect(validation.sanitizedFileName).toBe('graphic.png');
  });

  it('detects and accepts valid WebP magic bytes (RIFF....WEBP)', async () => {
    const webpBuffer = await sharp({
      create: { width: 60, height: 60, channels: 3, background: { r: 0, g: 0, b: 255 } },
    })
      .webp()
      .toBuffer();

    const signature = detectMagicBytes(webpBuffer);
    expect(signature).toEqual({
      format: 'webp',
      mimeType: 'image/webp',
    });

    const validation = validateUploadContent(
      webpBuffer,
      'image/webp',
      'hero.webp',
      DEFAULT_STORAGE_CONFIG
    );
    expect(validation.detectedFormat).toBe('webp');
    expect(validation.detectedMime).toBe('image/webp');
    expect(validation.sanitizedFileName).toBe('hero.webp');
  });

  it('strictly rejects SVG / XML text files', () => {
    const svgBuffer = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><circle r="10"/></svg>');
    const signature = detectMagicBytes(svgBuffer);
    expect(signature).toBeNull();

    expect(() =>
      validateUploadContent(svgBuffer, 'image/svg+xml', 'vector.svg', DEFAULT_STORAGE_CONFIG)
    ).toThrow(UnsupportedMediaTypeError);
  });

  it('rejects empty and undersized buffers', () => {
    const emptyBuffer = Buffer.alloc(0);
    expect(() =>
      validateUploadContent(emptyBuffer, 'image/png', 'empty.png', DEFAULT_STORAGE_CONFIG)
    ).toThrow(InvalidImageError);

    const smallBuffer = Buffer.from([0x01, 0x02, 0x03]);
    expect(() =>
      validateUploadContent(smallBuffer, 'image/png', 'truncated.png', DEFAULT_STORAGE_CONFIG)
    ).toThrow(InvalidImageError);
  });

  it('rejects declared MIME type mismatch with actual content signature', async () => {
    // Content is PNG, but client declares image/jpeg
    const pngBuffer = await sharp({
      create: { width: 30, height: 30, channels: 3, background: { r: 120, g: 120, b: 120 } },
    })
      .png()
      .toBuffer();

    expect(() =>
      validateUploadContent(pngBuffer, 'image/jpeg', 'mismatched.jpg', DEFAULT_STORAGE_CONFIG)
    ).toThrow(FileSignatureMismatchError);
  });

  it('enforces maximum file size limit', async () => {
    const testConfig: StorageConfig = {
      ...DEFAULT_STORAGE_CONFIG,
      maxFileSizeBytes: 100, // Very low limit for testing
    };

    const pngBuffer = await sharp({
      create: { width: 50, height: 50, channels: 3, background: { r: 255, g: 255, b: 0 } },
    })
      .png()
      .toBuffer();

    expect(pngBuffer.length).toBeGreaterThan(100);

    expect(() =>
      validateUploadContent(pngBuffer, 'image/png', 'large.png', testConfig)
    ).toThrow(FileTooLargeError);
  });

  it('sanitizes malicious filenames against path traversal, null bytes, and illegal characters', () => {
    expect(sanitizeFileName('../../../etc/passwd.png')).toBe('passwd.png');
    expect(sanitizeFileName('..\\..\\windows\\system32\\cmd.exe.jpg')).toBe('cmd.exe.jpg');
    expect(sanitizeFileName('test\0injected.png')).toBe('testinjected.png');
    expect(sanitizeFileName('weird:name*with?bad<chars>.webp')).toBe('weird_name_with_bad_chars_.webp');
    expect(sanitizeFileName('')).toBe('unnamed_upload.png');
    expect(sanitizeFileName('   ')).toBe('unnamed_upload.png');
  });
});
